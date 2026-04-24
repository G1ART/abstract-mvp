// Result shapes for the AI-Native Studio Layer (Wave 1).
// Each route returns a typed JSON body that the UI renders into editable
// preview cards. All variants carry a `degraded` flag so the UI can fall
// back to static copy when OpenAI is unavailable, the soft cap is hit, or
// JSON parsing fails.

export type AiDegradation = {
  degraded?: boolean;
  reason?:
    | "no_key"
    | "timeout"
    | "cap"
    | "parse"
    | "error"
    | "unauthorized"
    | "invalid_input";
  /**
   * Row id of the `ai_events` record for this call. Clients send this back
   * to `/api/ai/accept` when the user adopts the draft so the analytics row
   * flips from `accepted IS NULL` → `accepted = true`. Absent on degraded
   * or pre-request failures.
   */
  aiEventId?: string;
  /** Present on some `invalid_input` responses from `/api/ai/*` routes. */
  validation?: string;
  /** Optional machine-readable error from the server (do not show raw to users). */
  error?: string;
};

export type AiLocale = "en" | "ko";

/** Optional grouping for profile copilot suggestions (model-supplied). */
export type ProfileSuggestionCategory =
  | "basics"
  | "public_clarity"
  | "discoverability"
  | "other";

export type ProfileViewerLens = "curator" | "collector" | "gallery";

export type ProfileViewerNote = {
  lens: ProfileViewerLens;
  note: string;
};

export type ProfileSuggestion = {
  id: string;
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  /** When absent, UI groups under “other”. */
  category?: ProfileSuggestionCategory;
};

export type ProfileSuggestionsResult = AiDegradation & {
  completeness: number; // 0-100 (may be computed client-side if degraded)
  missing: string[]; // short bullet points describing what's weak
  suggestions: ProfileSuggestion[];
  /**
   * Wave 2: 1–3 alternative bios the artist can adopt wholesale. Abstract
   * does not store these server-side; adoption happens through the
   * settings page.
   */
  bioDrafts?: string[];
  /**
   * Wave 2: 1–2 short one-liners (≤ 90 chars) the artist can use on
   * portfolios, exhibition invites, or external bios.
   */
  headlineDrafts?: string[];
  /**
   * Wave 2: short paragraph explaining why the suggested changes would
   * improve discoverability (themes, mediums, locale density, etc.).
   */
  discoverabilityRationale?: string;
  /**
   * Up to three short “visitor perspective” notes — humble tone, no scoring.
   */
  viewerNotes?: ProfileViewerNote[];
};

/** Deterministic counts from the client; sent with portfolio copilot context. */
export type PortfolioMetadataGaps = {
  missing_title: number;
  missing_year: number;
  missing_medium: number;
  missing_size: number;
  no_image: number;
  drafts_not_public: number;
};

export type PortfolioSuggestion = {
  id: string;
  kind: "reorder" | "series" | "metadata" | "exhibition_link" | "feature";
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
  /**
   * Wave 2: ids the artist's own works referenced by this suggestion
   * (series grouping, featured picks, exhibition links). UI renders
   * per-artwork deep links instead of free-form prose.
   */
  artworkIds?: string[];
};

export type PortfolioSuggestionsResult = AiDegradation & {
  suggestions: PortfolioSuggestion[];
  /**
   * Wave 2: optional ordering hint. Abstract never auto-reorders — the
   * UI shows the rationale and links, and the artist still chooses.
   */
  ordering?: {
    rationale: string;
    artworkIds: string[];
  };
};

export type StudioDigestResult = AiDegradation & {
  headline: string;
  changes: string[]; // 2–3 bullet points
  nextActions: Array<{ label: string; href?: string }>;
};

export type BioDraftResult = AiDegradation & {
  tone: "concise" | "warm" | "curatorial";
  drafts: string[]; // up to 3 alternatives
};

export type ExhibitionDraftKind =
  | "title"
  | "description"
  | "wall_text"
  | "invite_blurb";

export type ExhibitionDraftResult = AiDegradation & {
  kind: ExhibitionDraftKind;
  drafts: string[]; // 1–3 alternatives
};

export type InquiryReplyDraftLength = "short" | "long";

export type InquiryReplyDraft = {
  body: string;
  length?: InquiryReplyDraftLength;
};

export type InquiryTriagePriority = "normal" | "time_sensitive" | "opportunity";

/** Lightweight triage before reply drafts (model-supplied, optional). */
export type InquiryReplyTriage = {
  /** Short intent label (e.g. price, availability); UI maps known values to i18n. */
  intent?: string;
  priority?: InquiryTriagePriority;
  missingInfo?: string[];
};

export type InquiryReplyDraftResult = AiDegradation & {
  tone: "concise" | "warm" | "curatorial";
  kind: "reply" | "followup";
  triage?: InquiryReplyTriage;
  /**
   * Wave 2: drafts are objects carrying an optional length badge. Until
   * the model adopts the new shape everywhere we keep the UI layer
   * tolerant of bare strings via a normalizer (see InquiryReplyAssist).
   */
  drafts: InquiryReplyDraft[];
};

export type IntroMessageDraftResult = AiDegradation & {
  drafts: string[]; // 1–3 alternatives
};

export type MatchmakerSuggestedAction =
  | "follow"
  | "intro_note"
  | "exhibition_share"
  | "save_for_later";

export type MatchmakerRationale = {
  profileId: string;
  rationale: string;
  /**
   * Wave 2: the single action most relevant to this peer. The card
   * renders a matching 2nd-tier chip button; auto-sending is never
   * permitted — everything is copy / inline drafts / local saves.
   */
  suggestedAction?: MatchmakerSuggestedAction;
  /**
   * Wave 2: up to 3 of the *viewer's* own artwork ids that would make
   * a natural mention in the outreach note.
   */
  suggestedArtworkIds?: string[];
};

export type MatchmakerRationalesResult = AiDegradation & {
  rationales: MatchmakerRationale[];
};

export type AiFeatureKey =
  | "profile_copilot"
  | "portfolio_copilot"
  | "studio_digest"
  | "bio_draft"
  | "exhibition_draft"
  | "inquiry_reply_draft"
  | "intro_message_draft"
  | "matchmaker_rationales";
