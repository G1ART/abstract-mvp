/**
 * Central registry of usage event names. Each constant mirrors a member
 * of `UsageEventKey` in `./types.ts` so call sites pick string literals
 * the compiler checks.
 */

export const USAGE_KEYS = {
  // AI
  AI_BIO_ASSIST_GENERATED: "ai.bio_assist.generated",
  AI_INQUIRY_REPLY_ASSIST_GENERATED: "ai.inquiry_reply_assist.generated",
  AI_EXHIBITION_COPY_ASSIST_GENERATED: "ai.exhibition_copy_assist.generated",
  AI_INTRO_ASSIST_GENERATED: "ai.intro_assist.generated",
  AI_STUDIO_INTELLIGENCE_GENERATED: "ai.studio_intelligence.generated",
  AI_PROFILE_COPILOT_GENERATED: "ai.profile_copilot.generated",
  AI_PORTFOLIO_COPILOT_GENERATED: "ai.portfolio_copilot.generated",
  AI_STUDIO_DIGEST_GENERATED: "ai.studio_digest.generated",
  AI_MATCHMAKER_RATIONALES_GENERATED: "ai.matchmaker_rationales.generated",
  AI_BOARD_PITCH_PACK_GENERATED: "ai.board_pitch_pack.generated",
  AI_EXHIBITION_REVIEW_GENERATED: "ai.exhibition_review.generated",
  AI_DELEGATION_BRIEF_GENERATED: "ai.delegation_brief.generated",
  AI_CV_IMPORT_GENERATED: "ai.cv_import.generated",
  AI_ACCEPTED: "ai.accepted",
  // Boards
  BOARD_CREATED: "board.created",
  BOARD_SAVED_ARTWORK: "board.saved_artwork",
  BOARD_SAVED_EXHIBITION: "board.saved_exhibition",
  BOARD_PROMOTED_TO_EXHIBITION: "board.promoted_to_exhibition",
  BOARD_ROOM_VIEWED: "board.room_viewed",
  // Inquiries
  INQUIRY_CREATED: "inquiry.created",
  INQUIRY_REPLIED: "inquiry.replied",
  // Social
  CONNECTION_MESSAGE_SENT: "connection.message_sent",
  // Exhibitions
  EXHIBITION_CREATED: "exhibition.created",
  // Artwork
  ARTWORK_UPLOADED: "artwork.uploaded",
  IMPORT_WEBSITE_SCANNED: "import.website_scanned",
  IMPORT_WEBSITE_MATCHED: "import.website_matched",
  IMPORT_WEBSITE_APPLIED: "import.website_applied",
  // Delegation
  DELEGATION_ACTING_AS_ENTERED: "delegation.acting_as_entered",
  DELEGATION_ACTING_AS_EXITED: "delegation.acting_as_exited",
  // Resolver
  FEATURE_IMPRESSION: "feature.impression",
  FEATURE_UPGRADE_HINT_SHOWN: "feature.upgrade_hint_shown",
  FEATURE_UPGRADE_HINT_CLICKED: "feature.upgrade_hint_clicked",
  FEATURE_GATE_BLOCKED: "feature.gate_blocked",
  ENTITLEMENT_DECISION_LOGGED: "entitlement.decision_logged",
} as const;

/** Maps a canonical AI feature key to the meter event it should emit. */
export const AI_FEATURE_TO_METER_KEY: Record<string, string> = {
  bio_draft: USAGE_KEYS.AI_BIO_ASSIST_GENERATED,
  inquiry_reply_draft: USAGE_KEYS.AI_INQUIRY_REPLY_ASSIST_GENERATED,
  exhibition_draft: USAGE_KEYS.AI_EXHIBITION_COPY_ASSIST_GENERATED,
  intro_message_draft: USAGE_KEYS.AI_INTRO_ASSIST_GENERATED,
  profile_copilot: USAGE_KEYS.AI_PROFILE_COPILOT_GENERATED,
  portfolio_copilot: USAGE_KEYS.AI_PORTFOLIO_COPILOT_GENERATED,
  studio_digest: USAGE_KEYS.AI_STUDIO_DIGEST_GENERATED,
  matchmaker_rationales: USAGE_KEYS.AI_MATCHMAKER_RATIONALES_GENERATED,
  board_pitch_pack: USAGE_KEYS.AI_BOARD_PITCH_PACK_GENERATED,
  exhibition_review: USAGE_KEYS.AI_EXHIBITION_REVIEW_GENERATED,
  delegation_brief: USAGE_KEYS.AI_DELEGATION_BRIEF_GENERATED,
  cv_import: USAGE_KEYS.AI_CV_IMPORT_GENERATED,
};

/** Maps a canonical AI feature key to the entitlement feature key that
 *  governs it. Used by handleAiRoute to decide gating + quota shape. */
export const AI_FEATURE_TO_ENTITLEMENT_KEY: Record<string, string> = {
  bio_draft: "ai.bio_assist",
  inquiry_reply_draft: "ai.inquiry_reply_assist",
  exhibition_draft: "ai.exhibition_copy_assist",
  intro_message_draft: "ai.intro_assist",
  profile_copilot: "ai.studio_intelligence",
  portfolio_copilot: "ai.studio_intelligence",
  studio_digest: "ai.studio_intelligence",
  matchmaker_rationales: "ai.studio_intelligence",
  board_pitch_pack: "ai.board_pitch_pack",
  exhibition_review: "ai.exhibition_review",
  delegation_brief: "ai.delegation_brief",
};
