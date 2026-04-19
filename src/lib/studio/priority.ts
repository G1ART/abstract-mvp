import type { NextAction } from "@/components/studio/StudioNextActions";

export type StudioPriorityInput = {
  profileCompleteness: number | null;
  artworkCount: number;
  pendingClaimsCount: number;
  priceInquiryCount: number;
  unreadInbox?: number | null;
  hasAvatar: boolean;
  hasRoles: boolean;
  hasExhibitions: boolean;
  t: (key: string) => string;
};

/**
 * Studio Next Actions priority engine (Track 3.2)
 *
 * Deterministic scoring: lowest priority number wins. Keeps empty
 * portfolios from burying inbox alerts, and avoids duplicating the
 * same nudge when the user has already taken it.
 */
export function computeStudioNextActions(input: StudioPriorityInput): NextAction[] {
  const { t } = input;
  const actions: NextAction[] = [];

  if (input.pendingClaimsCount > 0) {
    actions.push({
      key: "claims",
      label: t("studio.next.reviewClaims"),
      href: "/my/claims",
      priority: 10,
    });
  }
  if ((input.unreadInbox ?? 0) > 0 || input.priceInquiryCount > 0) {
    actions.push({
      key: "inbox",
      label: t("studio.next.replyInquiries"),
      href: "/my/inquiries",
      priority: 20,
    });
  }
  if (!input.hasAvatar || (input.profileCompleteness ?? 0) < 50) {
    actions.push({
      key: "profile",
      label: t("studio.next.completeProfile"),
      href: "/settings",
      priority: 30,
    });
  }
  if (!input.hasRoles) {
    actions.push({
      key: "roles",
      label: t("studio.next.pickRoles"),
      href: "/settings",
      priority: 35,
    });
  }
  if (input.artworkCount === 0) {
    actions.push({
      key: "upload",
      label: t("studio.next.uploadFirstArtwork"),
      href: "/upload",
      priority: 40,
    });
  } else if (input.artworkCount < 3) {
    actions.push({
      key: "upload-more",
      label: t("studio.next.addMoreArtworks"),
      href: "/upload",
      priority: 50,
    });
  }
  if (!input.hasExhibitions) {
    actions.push({
      key: "exhibition",
      label: t("studio.next.addExhibition"),
      href: "/my/exhibitions",
      priority: 60,
    });
  }

  return actions;
}
