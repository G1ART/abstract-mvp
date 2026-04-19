// Context builders turn raw DB rows into the minimal, sanitized summaries we
// send to the model. Keep these pure (no DB calls) so they stay easy to test
// and so routes can audit exactly what text is shipped across the wire.

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
};

export function buildPortfolioCopilotContext(input: PortfolioContextInput): string {
  const summarized = input.artworks.slice(0, 20).map((a) => ({
    id: a.id,
    title: a.title ?? "",
    year: a.year ?? "",
    medium: a.medium ?? "",
    dimensions: a.dimensions ?? "",
    keywords: (a.keywords ?? []).slice(0, 4),
  }));
  const ex = input.exhibitions.slice(0, 10).map((e) => ({
    id: e.id,
    title: e.title ?? "",
    year: e.year ?? "",
    venue: e.venue ?? "",
  }));
  return `username: ${input.username ?? ""}\nartworks: ${JSON.stringify(summarized)}\nexhibitions: ${JSON.stringify(ex)}`;
}

export type StudioDigestInput = {
  views7d?: number;
  views30d?: number;
  followsDelta7d?: number;
  inquiries7d?: number;
  shortlistEvents7d?: number;
  recentExhibitions?: Array<{ title: string; year?: string | number }>;
  locale?: string | null;
};

export function buildStudioDigestContext(input: StudioDigestInput): string {
  return [
    `locale: ${input.locale ?? "ko"}`,
    `views7d: ${input.views7d ?? 0}`,
    `views30d: ${input.views30d ?? 0}`,
    `followsDelta7d: ${input.followsDelta7d ?? 0}`,
    `inquiries7d: ${input.inquiries7d ?? 0}`,
    `shortlistEvents7d: ${input.shortlistEvents7d ?? 0}`,
    `recentExhibitions: ${JSON.stringify((input.recentExhibitions ?? []).slice(0, 5))}`,
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
  return [
    `locale: ${input.locale ?? "ko"}`,
    `me: ${JSON.stringify({
      themes: (input.me.themes ?? []).slice(0, 6),
      mediums: (input.me.mediums ?? []).slice(0, 6),
      city: input.me.city ?? "",
    })}`,
    `candidates: ${JSON.stringify(candidates)}`,
  ].join("\n");
}
