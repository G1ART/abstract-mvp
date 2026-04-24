// Context builders turn raw DB rows into the minimal, sanitized summaries we
// send to the model. Keep these pure (no DB calls) so they stay easy to test
// and so routes can audit exactly what text is shipped across the wire.

import type { PortfolioMetadataGaps } from "./types";

export type ProfileContextInput = {
  display_name?: string | null;
  username?: string | null;
  role?: string | null;
  bio?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  city?: string | null;
  locale?: string | null;
  counts?: {
    artworks?: number;
    exhibitions?: number;
    shortlists?: number;
    follows?: number;
    views7d?: number;
    views30d?: number;
  };
};

export function buildProfileCopilotContext(input: ProfileContextInput): string {
  const lines = [
    `display_name: ${input.display_name ?? ""}`,
    `username: ${input.username ?? ""}`,
    `role: ${input.role ?? ""}`,
    `bio: ${(input.bio ?? "").slice(0, 400)}`,
    `themes: ${(input.themes ?? []).slice(0, 6).join(", ")}`,
    `mediums: ${(input.mediums ?? []).slice(0, 6).join(", ")}`,
    `city: ${input.city ?? ""}`,
    `locale: ${input.locale ?? "ko"}`,
    `counts: ${JSON.stringify(input.counts ?? {})}`,
  ];
  return lines.join("\n");
}

export type ArtworkLite = {
  id: string;
  title?: string | null;
  year?: string | number | null;
  medium?: string | null;
  dimensions?: string | null;
  keywords?: string[] | null;
};

export type ExhibitionLite = {
  id: string;
  title?: string | null;
  year?: string | number | null;
  venue?: string | null;
};

export type PortfolioContextInput = {
  username?: string | null;
  artworks: ArtworkLite[];
  exhibitions: ExhibitionLite[];
  /** Optional counts computed client-side from live artworks. */
  metadataGaps?: PortfolioMetadataGaps | null;
};

const PORTFOLIO_CTX_MAX_CHARS = 18_000;

/** Keeps portfolio copilot prompts under typical model context limits. */
function clipPromptText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function buildPortfolioCopilotContext(input: PortfolioContextInput): string {
  const summarized = input.artworks.slice(0, 20).map((a) => ({
    id: clipPromptText(String(a.id ?? ""), 72),
    title: clipPromptText(String(a.title ?? ""), 160),
    year: clipPromptText(String(a.year ?? ""), 24),
    medium: clipPromptText(String(a.medium ?? ""), 120),
    dimensions: clipPromptText(String(a.dimensions ?? ""), 120),
    keywords: (a.keywords ?? []).slice(0, 4).map((k) => clipPromptText(k, 48)),
  }));
  const ex = input.exhibitions.slice(0, 10).map((e) => ({
    id: clipPromptText(String(e.id ?? ""), 72),
    title: clipPromptText(String(e.title ?? ""), 160),
    year: clipPromptText(String(e.year ?? ""), 24),
    venue: clipPromptText(String(e.venue ?? ""), 120),
  }));
  const gaps =
    input.metadataGaps != null && typeof input.metadataGaps === "object"
      ? `\nmetadataGaps: ${JSON.stringify(input.metadataGaps)}`
      : "";
  const line = `username: ${clipPromptText(String(input.username ?? ""), 64)}\nartworks: ${JSON.stringify(summarized)}\nexhibitions: ${JSON.stringify(ex)}${gaps}`;
  if (line.length <= PORTFOLIO_CTX_MAX_CHARS) return line;
  return `${line.slice(0, PORTFOLIO_CTX_MAX_CHARS - 20)}\n…[truncated]`;
}

export type StudioDigestInput = {
  views7d?: number;
  views30d?: number;
  followsDelta7d?: number;
  inquiries7d?: number;
  shortlistEvents7d?: number;
  /** Works in the studio list that are not yet public (e.g. draft visibility). */
  draftsNotPublicCount?: number;
  /** Works missing title, year, medium, size, or primary image (client count). */
  incompleteMetadataCount?: number;
  recentExhibitions?: Array<{ title: string; year?: string | number }>;
  /**
   * Wave 2: up to 3 of the artist's most recent uploads so the digest
   * can mention "your new work from this week" without inventing titles.
   */
  recentUploads?: Array<{ id?: string; title?: string | null; createdAt?: string | null }>;
  /**
   * Wave 2: artist's username so nextActions can deep-link to their
   * public profile (reorder / share) without the prompt guessing.
   */
  username?: string | null;
  locale?: string | null;
};

export function buildStudioDigestContext(input: StudioDigestInput): string {
  return [
    `locale: ${input.locale ?? "ko"}`,
    `username: ${input.username ?? ""}`,
    `views7d: ${input.views7d ?? 0}`,
    `views30d: ${input.views30d ?? 0}`,
    `followsDelta7d: ${input.followsDelta7d ?? 0}`,
    `inquiries7d: ${input.inquiries7d ?? 0}`,
    `shortlistEvents7d: ${input.shortlistEvents7d ?? 0}`,
    `drafts_not_public_count: ${input.draftsNotPublicCount ?? 0}`,
    `incomplete_metadata_count: ${input.incompleteMetadataCount ?? 0}`,
    `recentExhibitions: ${JSON.stringify((input.recentExhibitions ?? []).slice(0, 5))}`,
    `recentUploads: ${JSON.stringify(
      (input.recentUploads ?? []).slice(0, 3).map((u) => ({
        title: u.title ?? "",
        createdAt: u.createdAt ?? "",
      })),
    )}`,
  ].join("\n");
}

export type BioDraftInput = {
  tone: "concise" | "warm" | "curatorial";
  display_name?: string | null;
  role?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  city?: string | null;
  selectedArtworks?: ArtworkLite[];
  locale?: string | null;
};

export function buildBioDraftContext(input: BioDraftInput): string {
  const works = (input.selectedArtworks ?? []).slice(0, 5).map((a) => ({
    title: a.title ?? "",
    year: a.year ?? "",
    medium: a.medium ?? "",
  }));
  return [
    `tone: ${input.tone}`,
    `locale: ${input.locale ?? "ko"}`,
    `display_name: ${input.display_name ?? ""}`,
    `role: ${input.role ?? ""}`,
    `themes: ${(input.themes ?? []).slice(0, 6).join(", ")}`,
    `mediums: ${(input.mediums ?? []).slice(0, 6).join(", ")}`,
    `city: ${input.city ?? ""}`,
    `selected_artworks: ${JSON.stringify(works)}`,
  ].join("\n");
}

export type ExhibitionDraftInput = {
  kind: "title" | "description" | "wall_text" | "invite_blurb";
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  venueLabel?: string | null;
  curatorLabel?: string | null;
  hostLabel?: string | null;
  locale?: string | null;
  works?: ArtworkLite[];
};

export function buildExhibitionProducerContext(input: ExhibitionDraftInput): string {
  const works = (input.works ?? []).slice(0, 20).map((a) => ({
    title: a.title ?? "",
    year: a.year ?? "",
    medium: a.medium ?? "",
  }));
  return [
    `kind: ${input.kind}`,
    `locale: ${input.locale ?? "ko"}`,
    `title: ${input.title ?? ""}`,
    `startDate: ${input.startDate ?? ""}`,
    `endDate: ${input.endDate ?? ""}`,
    `venue: ${input.venueLabel ?? ""}`,
    `curator: ${input.curatorLabel ?? ""}`,
    `host: ${input.hostLabel ?? ""}`,
    `works: ${JSON.stringify(works)}`,
  ].join("\n");
}

export type InquiryReplyInput = {
  tone: "concise" | "warm" | "curatorial";
  kind: "reply" | "followup";
  locale?: string | null;
  /** Wave 2: caller-selected length preference. "short" keeps drafts ~2 sentences; "long" ~4–6. */
  lengthPreference?: "short" | "long";
  artwork?: {
    title?: string | null;
    year?: string | number | null;
    medium?: string | null;
    artistName?: string | null;
    pricePolicy?: string | null;
  };
  exhibitionTitle?: string | null;
  thread?: Array<{ from: "inquirer" | "owner"; text: string }>;
};

export function buildInquiryReplyContext(input: InquiryReplyInput): string {
  const thread = (input.thread ?? []).slice(-3).map((m) => ({
    from: m.from,
    text: m.text.slice(0, 400),
  }));
  return [
    `tone: ${input.tone}`,
    `kind: ${input.kind}`,
    `lengthPreference: ${input.lengthPreference ?? "short"}`,
    `locale: ${input.locale ?? "ko"}`,
    `artwork: ${JSON.stringify(input.artwork ?? {})}`,
    `exhibition: ${input.exhibitionTitle ?? ""}`,
    `thread: ${JSON.stringify(thread)}`,
  ].join("\n");
}

export type IntroMessageInput = {
  locale?: string | null;
  me: {
    display_name?: string | null;
    role?: string | null;
    themes?: string[] | null;
    mediums?: string[] | null;
    city?: string | null;
    /**
     * Wave 2: optional list of the sender's own works the user wants
     * referenced in the intro note. Only title is used — ids are kept
     * client-side for deep-link rendering.
     */
    artworks?: Array<{ title: string }> | null;
  };
  recipient: {
    display_name?: string | null;
    role?: string | null;
    themes?: string[] | null;
    mediums?: string[] | null;
    city?: string | null;
    sharedSignals?: string[] | null;
  };
};

export function buildIntroMessageContext(input: IntroMessageInput): string {
  return [
    `locale: ${input.locale ?? "ko"}`,
    `me: ${JSON.stringify({
      display_name: input.me.display_name ?? "",
      role: input.me.role ?? "",
      themes: (input.me.themes ?? []).slice(0, 6),
      mediums: (input.me.mediums ?? []).slice(0, 6),
      city: input.me.city ?? "",
      artworks: (input.me.artworks ?? []).slice(0, 3).map((a) => a.title),
    })}`,
    `recipient: ${JSON.stringify({
      display_name: input.recipient.display_name ?? "",
      role: input.recipient.role ?? "",
      themes: (input.recipient.themes ?? []).slice(0, 6),
      mediums: (input.recipient.mediums ?? []).slice(0, 6),
      city: input.recipient.city ?? "",
      sharedSignals: (input.recipient.sharedSignals ?? []).slice(0, 6),
    })}`,
  ].join("\n");
}

export type MatchmakerRationaleCandidate = {
  profileId: string;
  display_name?: string | null;
  role?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  city?: string | null;
  sharedSignals?: string[] | null;
};

export type MatchmakerRationaleInput = {
  locale?: string | null;
  me: {
    themes?: string[] | null;
    mediums?: string[] | null;
    city?: string | null;
    /**
     * Wave 2: the viewer's own artworks — used so the rationales and
     * `suggestedArtworkIds` can pull from a concrete set instead of
     * hallucinating titles.
     */
    artworks?: Array<{ id: string; title?: string | null }> | null;
  };
  candidates: MatchmakerRationaleCandidate[];
};

export function buildMatchmakerRationaleContext(
  input: MatchmakerRationaleInput,
): string {
  const candidates = input.candidates.slice(0, 6).map((c) => ({
    profileId: c.profileId,
    display_name: c.display_name ?? "",
    role: c.role ?? "",
    themes: (c.themes ?? []).slice(0, 4),
    mediums: (c.mediums ?? []).slice(0, 4),
    city: c.city ?? "",
    sharedSignals: (c.sharedSignals ?? []).slice(0, 4),
  }));
  const myArtworks = (input.me.artworks ?? []).slice(0, 6).map((a) => ({
    id: a.id,
    title: a.title ?? "",
  }));
  return [
    `locale: ${input.locale ?? "ko"}`,
    `me: ${JSON.stringify({
      themes: (input.me.themes ?? []).slice(0, 6),
      mediums: (input.me.mediums ?? []).slice(0, 6),
      city: input.me.city ?? "",
      artworks: myArtworks,
    })}`,
    `candidates: ${JSON.stringify(candidates)}`,
  ].join("\n");
}
