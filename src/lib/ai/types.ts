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
};

export type AiLocale = "en" | "ko";

export type ProfileSuggestion = {
  id: string;
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
};

export type ProfileSuggestionsResult = AiDegradation & {
  completeness: number; // 0-100 (may be computed client-side if degraded)
  missing: string[]; // short bullet points describing what's weak
  suggestions: ProfileSuggestion[];
};

export type PortfolioSuggestion = {
  id: string;
  kind: "reorder" | "series" | "metadata" | "exhibition_link";
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
};

export type PortfolioSuggestionsResult = AiDegradation & {
  suggestions: PortfolioSuggestion[];
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

export type InquiryReplyDraftResult = AiDegradation & {
  tone: "concise" | "warm" | "curatorial";
  kind: "reply" | "followup";
  drafts: string[]; // 1–3 alternatives
};

export type IntroMessageDraftResult = AiDegradation & {
  drafts: string[]; // 1–3 alternatives
};

export type MatchmakerRationale = {
  profileId: string;
  rationale: string;
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
