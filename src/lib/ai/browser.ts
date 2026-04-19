"use client";

import { supabase } from "@/lib/supabase/client";
import type {
  AiDegradation,
  AiFeatureKey,
  BioDraftResult,
  ExhibitionDraftResult,
  InquiryReplyDraftResult,
  IntroMessageDraftResult,
  MatchmakerRationalesResult,
  PortfolioSuggestionsResult,
  ProfileSuggestionsResult,
  StudioDigestResult,
} from "./types";

const FEATURE_TO_PATH: Record<AiFeatureKey, string> = {
  profile_copilot: "/api/ai/profile-copilot",
  portfolio_copilot: "/api/ai/portfolio-copilot",
  studio_digest: "/api/ai/studio-digest",
  bio_draft: "/api/ai/bio-draft",
  exhibition_draft: "/api/ai/exhibition-draft",
  inquiry_reply_draft: "/api/ai/inquiry-reply-draft",
  intro_message_draft: "/api/ai/intro-message-draft",
  matchmaker_rationales: "/api/ai/matchmaker-rationales",
};

export type CallAiOptions = {
  signal?: AbortSignal;
};

function degradedFallback<T extends AiDegradation>(
  reason: AiDegradation["reason"],
  base: Omit<T, keyof AiDegradation>,
): T {
  return { ...(base as object), degraded: true, reason } as T;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Mark an AI event as "accepted" — this is the canonical truth for
 * ai_events.accepted. Call this anywhere a user adopts a draft (insert /
 * replace / append / copy / click an AI-proposed action). Fails silently —
 * the draft must still be applied even if telemetry is unreachable.
 */
export async function acceptAiEvent(aiEventId: string | null | undefined): Promise<void> {
  if (!aiEventId) return;
  const token = await getAccessToken();
  if (!token) return;
  try {
    await fetch("/api/ai/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ aiEventId }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // telemetry must never block UX
  }
}

export async function callAi<T extends AiDegradation>(
  feature: AiFeatureKey,
  body: Record<string, unknown>,
  fallback: Omit<T, keyof AiDegradation>,
  opts?: CallAiOptions,
): Promise<T> {
  const path = FEATURE_TO_PATH[feature];
  const token = await getAccessToken();
  if (!token) return degradedFallback<T>("unauthorized", fallback);

  try {
    const resp = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
      cache: "no-store",
    });
    if (resp.status === 400) {
      return degradedFallback<T>("invalid_input", fallback);
    }
    if (resp.status === 429) {
      return degradedFallback<T>("cap", fallback);
    }
    if (resp.status === 503) {
      try {
        const body = (await resp.json()) as T;
        return body;
      } catch {
        return degradedFallback<T>("no_key", fallback);
      }
    }
    if (!resp.ok) {
      return degradedFallback<T>("error", fallback);
    }
    const json = (await resp.json()) as T;
    return json;
  } catch (err) {
    const name = (err as { name?: string } | null)?.name ?? "";
    if (name === "AbortError") return degradedFallback<T>("timeout", fallback);
    return degradedFallback<T>("error", fallback);
  }
}

// Typed shortcuts consumers can import.
export const aiApi = {
  profileCopilot: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<ProfileSuggestionsResult>(
      "profile_copilot",
      body,
      { completeness: 0, missing: [], suggestions: [] },
      opts,
    ),
  portfolioCopilot: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<PortfolioSuggestionsResult>(
      "portfolio_copilot",
      body,
      { suggestions: [] },
      opts,
    ),
  studioDigest: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<StudioDigestResult>(
      "studio_digest",
      body,
      { headline: "", changes: [], nextActions: [] },
      opts,
    ),
  bioDraft: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<BioDraftResult>(
      "bio_draft",
      body,
      { tone: (body.tone as BioDraftResult["tone"]) || "concise", drafts: [] },
      opts,
    ),
  exhibitionDraft: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<ExhibitionDraftResult>(
      "exhibition_draft",
      body,
      { kind: (body.kind as ExhibitionDraftResult["kind"]) || "description", drafts: [] },
      opts,
    ),
  inquiryReplyDraft: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<InquiryReplyDraftResult>(
      "inquiry_reply_draft",
      body,
      {
        tone: (body.tone as InquiryReplyDraftResult["tone"]) || "warm",
        kind: (body.kind as InquiryReplyDraftResult["kind"]) || "reply",
        drafts: [],
      },
      opts,
    ),
  introMessageDraft: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<IntroMessageDraftResult>(
      "intro_message_draft",
      body,
      { drafts: [] },
      opts,
    ),
  matchmakerRationales: (body: Record<string, unknown>, opts?: CallAiOptions) =>
    callAi<MatchmakerRationalesResult>(
      "matchmaker_rationales",
      body,
      { rationales: [] },
      opts,
    ),
};
