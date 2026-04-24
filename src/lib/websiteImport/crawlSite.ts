import * as cheerio from "cheerio";
import { assertFetchableImageUrl, assertFetchablePageUrl, resolveUrl } from "./urlSafety";
import { mergeCaptionBlocks, parseMetadataLine } from "./metadataParse";
import { dhashFromImageBuffer } from "./dhash";
import type { WebsiteImportCandidate, WebsiteImportScanMeta } from "./types";
import { randomUUID } from "crypto";

const MAX_PAGES = 28;
const MAX_QUEUE = 80;
const MAX_CANDIDATES = 180;
const PAGE_TIMEOUT_MS = 7500;
const MAX_HTML_BYTES = 1_400_000;
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_CONCURRENT_PAGE_FETCH = 3;

const GALLERY_PATH_HINTS =
  /portfolio|gallery|works|artwork|work|series|exhibition|projects|collections|shop|store/i;

async function fetchBuffer(url: URL, originHostname: string, kind: "page" | "image"): Promise<Buffer> {
  if (kind === "page") assertFetchablePageUrl(url, originHostname);
  else assertFetchableImageUrl(url, originHostname);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), kind === "page" ? PAGE_TIMEOUT_MS : PAGE_TIMEOUT_MS + 2000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AbstractWebsiteImport/1.0 (+https://abstract.art)",
        Accept: kind === "page" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" : "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const cap = kind === "page" ? MAX_HTML_BYTES : MAX_IMAGE_BYTES;
    if (buf.length > cap) throw new Error("response_too_large");
    return buf;
  } finally {
    clearTimeout(t);
  }
}

function extractLinks(html: string, pageUrl: string, originHostname: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const abs = resolveUrl(pageUrl, href);
    if (!abs) return;
    try {
      assertFetchablePageUrl(abs, originHostname);
    } catch {
      return;
    }
    const path = abs.pathname + (abs.search || "");
    if (path.length > 200) return;
    out.push(abs.toString());
  });
  return [...new Set(out)];
}

function prioritizeLinks(urls: string[], origin: URL): string[] {
  const scored = urls.map((u) => {
    let s = 0;
    try {
      const p = new URL(u).pathname;
      if (GALLERY_PATH_HINTS.test(p)) s += 4;
      if (p === "/" || p === "") s += 2;
      if (p.split("/").filter(Boolean).length <= 2) s += 1;
    } catch {
      return { u, s: -99 };
    }
    return { u, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.u);
}

/** Down-rank favicons, sprites, logos, social badges, and tiny layout images. */
function shouldSkipImageUrl(url: URL, alt: string, wAttr: number, hAttr: number): boolean {
  const path = `${url.pathname}${url.search}`.toLowerCase();
  const altL = alt.toLowerCase();
  if (
    /favicon|apple-touch|touch-icon|mstile|sprite|1x1|pixel|spacer|blank|placeholder|site-logo|brand-logo|logo-icon|social-share|og-image-for-/i.test(
      path,
    )
  ) {
    return true;
  }
  if (/(^|\/)icons\/|\/static\/.*icon/i.test(path)) return true;
  if (altL.length > 0 && /\b(logo|icon|avatar|badge|facebook|instagram|twitter|linkedin|pinterest)\b/i.test(altL)) {
    return true;
  }
  if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0 && wAttr < 32 && hAttr < 32) {
    return true;
  }
  return false;
}

function firstUrlToken(raw: string): string {
  return raw.trim().split(/\s+/)[0] ?? "";
}

function bestSrcsetUrl(srcset: string, pageUrl: string, originHostname: string): string | null {
  let bestUrl: string | null = null;
  let bestW = -1;
  for (const part of srcset.split(",")) {
    const tok = firstUrlToken(part);
    if (!tok || tok.startsWith("data:")) continue;
    const abs = resolveUrl(pageUrl, tok);
    if (!abs) continue;
    try {
      assertFetchableImageUrl(abs, originHostname);
    } catch {
      continue;
    }
    const m = part.match(/(\d+)\s*w\b/i);
    const w = m ? parseInt(m[1]!, 10) : 0;
    if (w > bestW) {
      bestW = w;
      bestUrl = abs.toString();
    }
  }
  if (bestUrl) return bestUrl;
  for (const part of srcset.split(",")) {
    const tok = firstUrlToken(part);
    if (!tok || tok.startsWith("data:")) continue;
    const abs = resolveUrl(pageUrl, tok);
    if (!abs) continue;
    try {
      assertFetchableImageUrl(abs, originHostname);
      return abs.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function collectImgUrls($: cheerio.CheerioAPI, el: any, pageUrl: string, originHostname: string): string[] {
  const $el = $(el);
  const urls: string[] = [];
  const pushAttr = (raw: string | undefined) => {
    if (!raw || raw.startsWith("data:")) return;
    const token = firstUrlToken(raw);
    if (!token) return;
    const abs = resolveUrl(pageUrl, token);
    if (!abs) return;
    try {
      assertFetchableImageUrl(abs, originHostname);
    } catch {
      return;
    }
    urls.push(abs.toString());
  };

  const srcset = $el.attr("srcset") ?? $el.attr("data-srcset");
  if (srcset) {
    const best = bestSrcsetUrl(srcset, pageUrl, originHostname);
    if (best) urls.push(best);
  }
  pushAttr($el.attr("src"));
  pushAttr($el.attr("data-src"));
  pushAttr($el.attr("data-lazy-src"));
  pushAttr($el.attr("data-original"));
  pushAttr($el.attr("data-image"));
  pushAttr($el.attr("data-zoom-src"));
  pushAttr($el.attr("data-deferred"));

  return [...new Set(urls)];
}

function pickDisplayUrl(urls: string[], alt: string, wAttr: number, hAttr: number): string | null {
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (shouldSkipImageUrl(parsed, alt, wAttr, hAttr)) continue;
      return u;
    } catch {
      continue;
    }
  }
  return null;
}

async function extractCandidatesFromPage(
  html: string,
  pageUrl: string,
  originHostname: string,
): Promise<Omit<WebsiteImportCandidate, "id" | "dhash_hex">[]> {
  const $ = cheerio.load(html);
  const found: Omit<WebsiteImportCandidate, "id" | "dhash_hex">[] = [];

  $("img").each((_, el) => {
    const $el = $(el);
    const wAttr = parseInt($el.attr("width") || "", 10);
    const hAttr = parseInt($el.attr("height") || "", 10);
    const alt = ($el.attr("alt") || "").trim() || null;
    const urls = collectImgUrls($, el, pageUrl, originHostname);
    const absStr = pickDisplayUrl(urls, alt ?? "", wAttr, hAttr);
    if (!absStr) return;

    const $fig = $el.closest("figure");
    const cap = $fig.find("figcaption").first().text().trim() || null;
    const $card = $el.closest("article, .grid-item, .gallery-item, .portfolio-item, li, .sqs-block-content");
    const nearby = $card
      .find("h1, h2, h3, h4, .title, .work-title, p")
      .first()
      .text()
      .trim();
    const caption_blob = mergeCaptionBlocks(alt, cap, nearby);
    const parsed = parseMetadataLine(caption_blob);
    found.push({
      page_url: pageUrl,
      image_url: absStr,
      width: Number.isFinite(wAttr) ? wAttr : undefined,
      height: Number.isFinite(hAttr) ? hAttr : undefined,
      alt_text: alt,
      caption_blob,
      parsed,
    });
  });

  return found;
}

async function hashCandidateImage(
  c: Omit<WebsiteImportCandidate, "id" | "dhash_hex">,
  originHostname: string,
): Promise<WebsiteImportCandidate | null> {
  try {
    const buf = await fetchBuffer(new URL(c.image_url), originHostname, "image");
    const dhash_hex = await dhashFromImageBuffer(buf);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    const mw = meta.width ?? c.width;
    const mh = meta.height ?? c.height;
    if (mw && mh) {
      if (mw < 48 || mh < 48) return null;
      if (mw * mh < 2400) return null;
    }
    return {
      id: randomUUID(),
      ...c,
      dhash_hex,
      width: mw,
      height: mh,
    };
  } catch {
    return null;
  }
}

export type CrawlSiteResult =
  | {
      ok: true;
      candidates: WebsiteImportCandidate[];
      scan_meta: WebsiteImportScanMeta;
    }
  | { ok: false; error: string };

export async function crawlPortfolioSite(startUrl: URL): Promise<CrawlSiteResult> {
  const originHostname = startUrl.hostname;
  const seenPages = new Set<string>();
  const queue: string[] = [startUrl.toString()];
  const candidatesMap = new Map<string, Omit<WebsiteImportCandidate, "id" | "dhash_hex">>();
  let pagesFetched = 0;

  try {
    while (queue.length > 0 && pagesFetched < MAX_PAGES && seenPages.size < MAX_QUEUE) {
      const batch = queue.splice(0, MAX_CONCURRENT_PAGE_FETCH);
      const results = await Promise.all(
        batch.map(async (pageUrlStr) => {
          if (seenPages.has(pageUrlStr)) return null as string | null;
          seenPages.add(pageUrlStr);
          const pageUrl = new URL(pageUrlStr);
          try {
            assertFetchablePageUrl(pageUrl, originHostname);
          } catch {
            return null;
          }
          try {
            const buf = await fetchBuffer(pageUrl, originHostname, "page");
            const html = buf.toString("utf8");
            pagesFetched += 1;
            const links = extractLinks(html, pageUrlStr, originHostname);
            for (const u of prioritizeLinks(links, startUrl)) {
              if (!seenPages.has(u) && queue.length + seenPages.size < MAX_QUEUE) queue.push(u);
            }
            const cands = await extractCandidatesFromPage(html, pageUrlStr, originHostname);
            for (const c of cands) {
              if (!candidatesMap.has(c.image_url)) candidatesMap.set(c.image_url, c);
            }
          } catch {
            /* skip page */
          }
          return pageUrlStr;
        }),
      );
      void results;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "crawl_failed" };
  }

  const rawList = [...candidatesMap.values()].slice(0, MAX_CANDIDATES + 40);
  const hashed: WebsiteImportCandidate[] = [];
  let n = 0;
  for (const c of rawList) {
    if (hashed.length >= MAX_CANDIDATES) break;
    const withHash = await hashCandidateImage(c, originHostname);
    if (withHash) hashed.push(withHash);
    n += 1;
    if (n % 4 === 0) await new Promise((r) => setTimeout(r, 20));
  }

  const parsedCount = hashed.filter((c) => {
    const p = c.parsed;
    if (!p) return false;
    return !!(p.title || p.year != null || p.medium || p.size || p.story);
  }).length;
  const warnings: string[] = [];
  if (candidatesMap.size >= MAX_CANDIDATES) {
    warnings.push("near_candidate_cap");
  }

  return {
    ok: true,
    candidates: hashed,
    scan_meta: {
      pages_fetched: pagesFetched,
      pages_queued_cap: MAX_QUEUE,
      origin_hostname: originHostname,
      candidates_parsed_count: parsedCount,
      warnings: warnings.length ? warnings : undefined,
    },
  };
}
