// Lightweight request-body validation for the AI routes. We deliberately
// avoid zod here to keep the edge-friendly bundle small and to give each
// route clear ownership of its schema. Every validator returns a
// `{ ok: true, value }` on success or `{ ok: false, reason }` so the route
// can return a 400 with a safe error contract.

import type { AiLocale, PortfolioMetadataGaps } from "./types";

export type ValidationError = {
  ok: false;
  reason: string;
};
export type ValidationOk<T> = { ok: true; value: T };
export type ValidationResult<T> = ValidationOk<T> | ValidationError;

export type ArtworkLiteParsed = {
  id: string;
  title: string | null;
  year: string | number | null;
  medium: string | null;
  dimensions: string | null;
  keywords: string[];
};

export type ExhibitionLiteParsed = {
  id: string;
  title: string | null;
  year: string | number | null;
  venue: string | null;
};

export type PersonSummaryParsed = {
  display_name: string | null;
  role: string | null;
  themes: string[];
  mediums: string[];
  city: string | null;
};

export type MatchmakerCandidateParsed = PersonSummaryParsed & {
  profileId: string;
  sharedSignals: string[];
};

const LOCALE_VALUES: readonly AiLocale[] = ["en", "ko"] as const;
const BIO_TONES = ["concise", "warm", "curatorial"] as const;
const INQUIRY_TONES = ["concise", "warm", "curatorial"] as const;
const INQUIRY_KINDS = ["reply", "followup"] as const;
const INQUIRY_LENGTHS = ["short", "long"] as const;
const EXHIBITION_KINDS = ["title", "description", "wall_text", "invite_blurb"] as const;

/** Hard guards to keep prompt size bounded across all AI routes. */
export const LIMITS = Object.freeze({
  bioMax: 600,
  textItemMax: 400,
  keywordItem: 48,
  keywordCount: 8,
  arrayMax: 10,
  themesMax: 8,
  mediumsMax: 8,
  rolesMax: 6,
  selectedArtworksMax: 5,
  artworksMax: 20,
  exhibitionsMax: 10,
  threadMessagesMax: 3,
  candidatesMax: 6,
  titleMax: 160,
  venueMax: 160,
  curatorMax: 160,
});

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function trimArray(v: unknown, max: number, perItem: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.length > perItem ? s.slice(0, perItem) : s);
    if (out.length >= max) break;
  }
  return out;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function stringOrYearOrNull(v: unknown): string | number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s.slice(0, 32) : null;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseLocale(v: unknown): AiLocale {
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if ((LOCALE_VALUES as readonly string[]).includes(lower)) return lower as AiLocale;
  }
  return "en";
}

function parseArtworkLite(v: unknown): ArtworkLiteParsed | null {
  if (!isRecord(v)) return null;
  const id = typeof v.id === "string" && v.id.trim() ? v.id.trim().slice(0, 64) : null;
  if (!id) return null;
  return {
    id,
    title: trimOrNull(v.title, LIMITS.titleMax),
    year: stringOrYearOrNull(v.year),
    medium: trimOrNull(v.medium, 80),
    dimensions: trimOrNull(v.dimensions, 80),
    keywords: trimArray(v.keywords, LIMITS.keywordCount, LIMITS.keywordItem),
  };
}

function parseExhibitionLite(v: unknown): ExhibitionLiteParsed | null {
  if (!isRecord(v)) return null;
  const id = typeof v.id === "string" && v.id.trim() ? v.id.trim().slice(0, 64) : null;
  if (!id) return null;
  return {
    id,
    title: trimOrNull(v.title, LIMITS.titleMax),
    year: stringOrYearOrNull(v.year),
    venue: trimOrNull(v.venue, LIMITS.venueMax),
  };
}

function collectArtworks(arr: unknown, cap: number): ArtworkLiteParsed[] {
  if (!Array.isArray(arr)) return [];
  const out: ArtworkLiteParsed[] = [];
  for (const item of arr.slice(0, cap)) {
    const parsed = parseArtworkLite(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function collectExhibitions(arr: unknown, cap: number): ExhibitionLiteParsed[] {
  if (!Array.isArray(arr)) return [];
  const out: ExhibitionLiteParsed[] = [];
  for (const item of arr.slice(0, cap)) {
    const parsed = parseExhibitionLite(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function clampStudioCount(v: unknown): number {
  const n = numberOrNull(v);
  if (n == null) return 0;
  return Math.min(500, Math.max(0, Math.floor(n)));
}

const EMPTY_PORTFOLIO_GAPS: PortfolioMetadataGaps = {
  missing_title: 0,
  missing_year: 0,
  missing_medium: 0,
  missing_size: 0,
  no_image: 0,
  drafts_not_public: 0,
};

function parsePortfolioMetadataGaps(v: unknown): PortfolioMetadataGaps {
  if (!isRecord(v)) return { ...EMPTY_PORTFOLIO_GAPS };
  return {
    missing_title: clampStudioCount(v.missing_title),
    missing_year: clampStudioCount(v.missing_year),
    missing_medium: clampStudioCount(v.missing_medium),
    missing_size: clampStudioCount(v.missing_size),
    no_image: clampStudioCount(v.no_image),
    drafts_not_public: clampStudioCount(v.drafts_not_public),
  };
}

export function parseProfileBody(raw: unknown): ValidationResult<{
  display_name: string | null;
  username: string | null;
  role: string | null;
  bio: string | null;
  themes: string[];
  mediums: string[];
  city: string | null;
  locale: AiLocale;
  counts: { artworks?: number; exhibitions?: number; followers?: number; views7d?: number };
}> {
  if (!isRecord(raw) || !isRecord(raw.profile)) return { ok: false, reason: "missing_profile" };
  const p = raw.profile;
  const counts = isRecord(p.counts) ? p.counts : {};
  return {
    ok: true,
    value: {
      display_name: trimOrNull(p.display_name, 120),
      username: trimOrNull(p.username, 64),
      role: trimOrNull(p.role, 40),
      bio: trimOrNull(p.bio, LIMITS.bioMax),
      themes: trimArray(p.themes, LIMITS.themesMax, LIMITS.keywordItem),
      mediums: trimArray(p.mediums, LIMITS.mediumsMax, LIMITS.keywordItem),
      city: trimOrNull(p.city, 80),
      locale: parseLocale(p.locale),
      counts: {
        artworks: numberOrNull(counts.artworks) ?? 0,
        exhibitions: numberOrNull(counts.exhibitions) ?? 0,
        followers: numberOrNull(counts.followers) ?? 0,
        views7d: numberOrNull(counts.views7d) ?? 0,
      },
    },
  };
}

export function parsePortfolioBody(raw: unknown): ValidationResult<{
  username: string | null;
  artworks: ArtworkLiteParsed[];
  exhibitions: ExhibitionLiteParsed[];
  metadataGaps: PortfolioMetadataGaps;
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.portfolio)) return { ok: false, reason: "missing_portfolio" };
  const p = raw.portfolio;
  const gaps = parsePortfolioMetadataGaps(isRecord(p.metadataGaps) ? p.metadataGaps : {});
  return {
    ok: true,
    value: {
      username: trimOrNull(p.username, 64),
      artworks: collectArtworks(p.artworks, LIMITS.artworksMax),
      exhibitions: collectExhibitions(p.exhibitions, LIMITS.exhibitionsMax),
      metadataGaps: gaps,
      locale: parseLocale(p.locale),
    },
  };
}

export function parseDigestBody(raw: unknown): ValidationResult<{
  views7d: number;
  views30d: number;
  inquiries7d: number;
  followsDelta7d: number;
  shortlistEvents7d: number;
  draftsNotPublicCount: number;
  incompleteMetadataCount: number;
  recentExhibitions: Array<{ title: string; year?: string | number }>;
  recentUploads: Array<{ title: string; createdAt?: string }>;
  username: string | null;
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.digest)) return { ok: false, reason: "missing_digest" };
  const d = raw.digest;
  const rx = Array.isArray(d.recentExhibitions) ? d.recentExhibitions : [];
  const recent: Array<{ title: string; year?: string | number }> = [];
  for (const item of rx.slice(0, 5)) {
    if (!isRecord(item)) continue;
    const title = trimOrNull(item.title, LIMITS.titleMax);
    if (!title) continue;
    const year = stringOrYearOrNull(item.year);
    recent.push(year != null ? { title, year } : { title });
  }
  const up = Array.isArray(d.recentUploads) ? d.recentUploads : [];
  const uploads: Array<{ title: string; createdAt?: string }> = [];
  for (const item of up.slice(0, 3)) {
    if (!isRecord(item)) continue;
    const title = trimOrNull(item.title, LIMITS.titleMax);
    if (!title) continue;
    const createdAt = trimOrNull(item.createdAt, 40);
    uploads.push(createdAt ? { title, createdAt } : { title });
  }
  return {
    ok: true,
    value: {
      views7d: numberOrNull(d.views7d) ?? 0,
      views30d: numberOrNull(d.views30d) ?? 0,
      inquiries7d: numberOrNull(d.inquiries7d) ?? 0,
      followsDelta7d: numberOrNull(d.followsDelta7d) ?? 0,
      shortlistEvents7d: numberOrNull(d.shortlistEvents7d) ?? 0,
      draftsNotPublicCount: clampStudioCount(d.draftsNotPublicCount),
      incompleteMetadataCount: clampStudioCount(d.incompleteMetadataCount),
      recentExhibitions: recent,
      recentUploads: uploads,
      username: trimOrNull(d.username, 64),
      locale: parseLocale(d.locale),
    },
  };
}

export function parseBioBody(raw: unknown): ValidationResult<{
  tone: (typeof BIO_TONES)[number];
  display_name: string | null;
  role: string | null;
  themes: string[];
  mediums: string[];
  city: string | null;
  selectedArtworks: ArtworkLiteParsed[];
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.bio)) return { ok: false, reason: "missing_bio" };
  const b = raw.bio;
  const tone = (BIO_TONES as readonly string[]).includes(b.tone as string)
    ? (b.tone as (typeof BIO_TONES)[number])
    : "concise";
  return {
    ok: true,
    value: {
      tone,
      display_name: trimOrNull(b.display_name, 120),
      role: trimOrNull(b.role, 40),
      themes: trimArray(b.themes, LIMITS.themesMax, LIMITS.keywordItem),
      mediums: trimArray(b.mediums, LIMITS.mediumsMax, LIMITS.keywordItem),
      city: trimOrNull(b.city, 80),
      selectedArtworks: collectArtworks(b.selectedArtworks, LIMITS.selectedArtworksMax),
      locale: parseLocale(b.locale),
    },
  };
}

export function parseExhibitionBody(raw: unknown): ValidationResult<{
  kind: (typeof EXHIBITION_KINDS)[number];
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  venueLabel: string | null;
  curatorLabel: string | null;
  hostLabel: string | null;
  works: ArtworkLiteParsed[];
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.exhibition)) return { ok: false, reason: "missing_exhibition" };
  const e = raw.exhibition;
  if (!(EXHIBITION_KINDS as readonly string[]).includes(e.kind as string)) {
    return { ok: false, reason: "invalid_kind" };
  }
  return {
    ok: true,
    value: {
      kind: e.kind as (typeof EXHIBITION_KINDS)[number],
      title: trimOrNull(e.title, LIMITS.titleMax),
      startDate: trimOrNull(e.startDate, 32),
      endDate: trimOrNull(e.endDate, 32),
      venueLabel: trimOrNull(e.venueLabel, LIMITS.venueMax),
      curatorLabel: trimOrNull(e.curatorLabel, LIMITS.curatorMax),
      hostLabel: trimOrNull(e.hostLabel, LIMITS.curatorMax),
      works: collectArtworks(e.works, LIMITS.artworksMax),
      locale: parseLocale(e.locale),
    },
  };
}

export function parseInquiryBody(raw: unknown): ValidationResult<{
  tone: (typeof INQUIRY_TONES)[number];
  kind: (typeof INQUIRY_KINDS)[number];
  lengthPreference: (typeof INQUIRY_LENGTHS)[number];
  artwork: {
    title: string | null;
    year: string | number | null;
    medium: string | null;
    artistName: string | null;
    pricePolicy: string | null;
  } | null;
  exhibitionTitle: string | null;
  thread: Array<{ from: "inquirer" | "owner"; text: string }>;
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.inquiry)) return { ok: false, reason: "missing_inquiry" };
  const i = raw.inquiry;
  const tone = (INQUIRY_TONES as readonly string[]).includes(i.tone as string)
    ? (i.tone as (typeof INQUIRY_TONES)[number])
    : "warm";
  const kind = (INQUIRY_KINDS as readonly string[]).includes(i.kind as string)
    ? (i.kind as (typeof INQUIRY_KINDS)[number])
    : "reply";
  const lengthPreference = (INQUIRY_LENGTHS as readonly string[]).includes(i.lengthPreference as string)
    ? (i.lengthPreference as (typeof INQUIRY_LENGTHS)[number])
    : "short";
  const artworkRaw = isRecord(i.artwork) ? i.artwork : null;
  const artwork = artworkRaw
    ? {
        title: trimOrNull(artworkRaw.title, LIMITS.titleMax),
        year: stringOrYearOrNull(artworkRaw.year),
        medium: trimOrNull(artworkRaw.medium, 80),
        artistName: trimOrNull(artworkRaw.artistName, 120),
        pricePolicy: trimOrNull(artworkRaw.pricePolicy, 120),
      }
    : null;
  const threadRaw = Array.isArray(i.thread) ? i.thread : [];
  const thread: Array<{ from: "inquirer" | "owner"; text: string }> = [];
  for (const m of threadRaw.slice(-LIMITS.threadMessagesMax)) {
    if (!isRecord(m)) continue;
    const from = m.from === "inquirer" || m.from === "owner" ? m.from : null;
    const text = trimOrNull(m.text, LIMITS.textItemMax);
    if (!from || !text) continue;
    thread.push({ from, text });
  }
  return {
    ok: true,
    value: {
      tone,
      kind,
      lengthPreference,
      artwork,
      exhibitionTitle: trimOrNull(i.exhibitionTitle, LIMITS.titleMax),
      thread,
      locale: parseLocale(i.locale),
    },
  };
}

function parsePersonSummary(v: unknown): PersonSummaryParsed {
  if (!isRecord(v)) return { display_name: null, role: null, themes: [], mediums: [], city: null };
  return {
    display_name: trimOrNull(v.display_name, 120),
    role: trimOrNull(v.role, 40),
    themes: trimArray(v.themes, LIMITS.themesMax, LIMITS.keywordItem),
    mediums: trimArray(v.mediums, LIMITS.mediumsMax, LIMITS.keywordItem),
    city: trimOrNull(v.city, 80),
  };
}

export function parseIntroBody(raw: unknown): ValidationResult<{
  me: PersonSummaryParsed & { artworks: Array<{ title: string }> };
  recipient: PersonSummaryParsed & { sharedSignals: string[] };
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.intro)) return { ok: false, reason: "missing_intro" };
  const x = raw.intro;
  const meBase = parsePersonSummary(x.me);
  const meRaw = isRecord(x.me) ? x.me : null;
  const artworksRaw = meRaw && Array.isArray(meRaw.artworks) ? meRaw.artworks : [];
  const artworks: Array<{ title: string }> = [];
  for (const a of artworksRaw.slice(0, 3)) {
    if (!isRecord(a)) continue;
    const title = trimOrNull(a.title, LIMITS.titleMax);
    if (title) artworks.push({ title });
  }
  const recipientBase = parsePersonSummary(x.recipient);
  const sharedSignals = isRecord(x.recipient)
    ? trimArray(x.recipient.sharedSignals, LIMITS.keywordCount, LIMITS.keywordItem)
    : [];
  return {
    ok: true,
    value: {
      me: { ...meBase, artworks },
      recipient: { ...recipientBase, sharedSignals },
      locale: parseLocale(x.locale),
    },
  };
}

export function parseMatchmakerBody(raw: unknown): ValidationResult<{
  me: {
    themes: string[];
    mediums: string[];
    city: string | null;
    artworks: Array<{ id: string; title: string | null }>;
  };
  candidates: MatchmakerCandidateParsed[];
  locale: AiLocale;
}> {
  if (!isRecord(raw) || !isRecord(raw.matchmaker)) return { ok: false, reason: "missing_matchmaker" };
  const m = raw.matchmaker;
  const me = isRecord(m.me) ? m.me : {};
  const candidatesRaw = Array.isArray(m.candidates) ? m.candidates : [];
  const candidates: MatchmakerCandidateParsed[] = [];
  for (const c of candidatesRaw.slice(0, LIMITS.candidatesMax)) {
    if (!isRecord(c)) continue;
    const profileId = typeof c.profileId === "string" && c.profileId.trim() ? c.profileId.trim().slice(0, 64) : null;
    if (!profileId) continue;
    const base = parsePersonSummary(c);
    candidates.push({
      profileId,
      display_name: base.display_name,
      role: base.role,
      themes: base.themes,
      mediums: base.mediums,
      city: base.city,
      sharedSignals: trimArray(c.sharedSignals, LIMITS.keywordCount, LIMITS.keywordItem),
    });
  }
  const artworksRaw = Array.isArray(me.artworks) ? me.artworks : [];
  const artworks: Array<{ id: string; title: string | null }> = [];
  for (const a of artworksRaw.slice(0, LIMITS.selectedArtworksMax)) {
    if (!isRecord(a)) continue;
    const id = typeof a.id === "string" && a.id.trim() ? a.id.trim().slice(0, 64) : null;
    if (!id) continue;
    artworks.push({ id, title: trimOrNull(a.title, LIMITS.titleMax) });
  }
  return {
    ok: true,
    value: {
      me: {
        themes: trimArray(me.themes, LIMITS.themesMax, LIMITS.keywordItem),
        mediums: trimArray(me.mediums, LIMITS.mediumsMax, LIMITS.keywordItem),
        city: trimOrNull(me.city, 80),
        artworks,
      },
      candidates,
      locale: parseLocale(m.locale),
    },
  };
}
