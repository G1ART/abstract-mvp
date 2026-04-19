/**
 * Provenance label humanizer (Track 5.2)
 *
 * Converts raw claim_type + context into user-facing sentences. Replace
 * every surface that used to render raw "delegated_by_artist" / "CREATED"
 * etc. with a call into this module.
 */

import type { ClaimType } from "./types";

export type ProvenanceKind =
  | "created"
  | "delegated_by_artist"
  | "delegated_by_gallery"
  | "curator_managed"
  | "gallery_managed"
  | "owns"
  | "inventory"
  | "exhibited"
  | "claim_pending"
  | "claim_confirmed"
  | "external_artist"
  | "unknown";

export type ProvenanceContext = {
  hasExternalArtist?: boolean;
  delegationRole?: "curator" | "gallery" | null;
  claimStatus?: "pending" | "confirmed" | "rejected" | null;
};

export function claimTypeToProvenanceKind(
  type: ClaimType | string | null | undefined,
  ctx: ProvenanceContext = {}
): ProvenanceKind {
  if (ctx.hasExternalArtist) return "external_artist";
  if (ctx.claimStatus === "pending") return "claim_pending";
  if (ctx.claimStatus === "confirmed") return "claim_confirmed";
  if (ctx.delegationRole === "curator") return "delegated_by_artist";
  if (ctx.delegationRole === "gallery") return "delegated_by_gallery";

  switch (type) {
    case "CREATED":
      return "created";
    case "OWNS":
      return "owns";
    case "INVENTORY":
      return "inventory";
    case "EXHIBITED":
      return "exhibited";
    case "CURATED":
      return "curator_managed";
    case "HOSTS_PROJECT":
    case "INCLUDES_WORK":
      return "gallery_managed";
    default:
      return "unknown";
  }
}

/** User-facing label for a provenance kind via i18n. */
export function provenanceLabel(
  kind: ProvenanceKind,
  t: (k: string) => string
): string {
  switch (kind) {
    case "delegated_by_artist":
      return t("provenance.label.delegatedByArtist");
    case "delegated_by_gallery":
      return t("provenance.label.delegatedByGallery");
    case "curator_managed":
      return t("provenance.label.curatorManaged");
    case "gallery_managed":
      return t("provenance.label.galleryManaged");
    case "created":
    case "owns":
      return t("provenance.label.artistOwned");
    case "inventory":
      return t("provenance.label.galleryManaged");
    case "exhibited":
      return t("provenance.label.curatorManaged");
    case "claim_pending":
      return t("provenance.label.claimPending");
    case "claim_confirmed":
      return t("provenance.label.claimConfirmed");
    case "external_artist":
      return t("provenance.label.externalArtist");
    case "unknown":
    default:
      return t("provenance.label.unknown");
  }
}
