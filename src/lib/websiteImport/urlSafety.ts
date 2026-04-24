/**
 * Normalize user-provided website URL and enforce safe fetch targets.
 * Conservative defaults: http(s) only, block obvious private hosts, strip tracking params.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
]);

const PRIVATE_IPV4 = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

export function stripTrackingParams(url: URL): void {
  for (const k of [...url.searchParams.keys()]) {
    const low = k.toLowerCase();
    if (TRACKING_PARAMS.has(low)) url.searchParams.delete(k);
  }
}

export function normalizeWebsiteUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (!parsed.hostname || parsed.hostname === "localhost") {
    return { ok: false, reason: "blocked_host" };
  }
  stripTrackingParams(parsed);
  parsed.hash = "";
  return { ok: true, url: parsed };
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;
  // literal IPv4 private
  if (PRIVATE_IPV4.test(h)) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal")) return true;
  return false;
}

/** Known CDN / asset hosts we allow for <img> bytes when the HTML page is on the origin host. */
const IMAGE_HOST_SUFFIX_ALLOW = [
  "squarespace-cdn.com",
  "squarespace.com",
  "wixstatic.com",
  "cloudinary.com",
  "imgix.net",
  "wp.com",
  "files.wordpress.com",
  "supabase.co",
  "cloudfront.net",
  "akamaized.net",
];

export function assertFetchablePageUrl(pageUrl: URL, originHostname: string): void {
  const host = pageUrl.hostname.toLowerCase();
  if (isBlockedHostname(host)) throw new Error("blocked_target");
  if (host !== originHostname.toLowerCase()) throw new Error("cross_origin_page");
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") throw new Error("unsupported_scheme");
}

/**
 * Image URLs may be on the same host as the portfolio or on a small CDN allowlist (still https-only).
 */
export function assertFetchableImageUrl(imageUrl: URL, originHostname: string): void {
  const host = imageUrl.hostname.toLowerCase();
  if (isBlockedHostname(host)) throw new Error("blocked_target");
  if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") throw new Error("unsupported_scheme");
  const origin = originHostname.toLowerCase();
  if (host === origin) return;
  const allowedCdn = IMAGE_HOST_SUFFIX_ALLOW.some((suffix) => host === suffix || host.endsWith("." + suffix));
  if (!allowedCdn) throw new Error("image_host_not_allowed");
}

export function resolveUrl(base: string, href: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}
