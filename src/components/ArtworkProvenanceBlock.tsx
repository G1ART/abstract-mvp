"use client";

import Link from "next/link";
import type { Artwork, ArtworkClaim } from "@/lib/supabase/artworks";
import { getProvenanceClaims, canViewProvenance } from "@/lib/supabase/artworks";
import { claimTypeToByPhrase } from "@/lib/provenance/rpc";
import type { ClaimType } from "@/lib/provenance/types";

type Props = {
  artwork: Artwork;
  viewerId: string | null;
  /** Compact = one line; full = list */
  variant?: "compact" | "full";
  className?: string;
  /** Prevent navigation (e.g. inside card click) */
  stopPropagation?: boolean;
};

function ClaimLine({ claim, stopPropagation }: { claim: ArtworkClaim; stopPropagation?: boolean }) {
  const byPhrase = claimTypeToByPhrase(claim.claim_type as ClaimType);
  if (!byPhrase) return null;
  const prof = claim.profiles;
  const label = prof?.display_name?.trim() || (prof?.username ? `@${prof.username}` : null) || "—";
  const content = (
    <>
      {byPhrase}{" "}
      {prof?.username ? (
        <Link
          href={`/u/${prof.username}`}
          onClick={(e) => stopPropagation && e.stopPropagation()}
          className="hover:text-zinc-900"
        >
          {label}
        </Link>
      ) : (
        label
      )}
    </>
  );
  return <span>{content}</span>;
}

export function ArtworkProvenanceBlock({
  artwork,
  viewerId,
  variant = "compact",
  className = "",
  stopPropagation = false,
}: Props) {
  if (!canViewProvenance(artwork, viewerId)) return null;
  const claims = getProvenanceClaims(artwork);
  const nonCreated = claims.filter((c) => c.claim_type !== "CREATED");
  if (nonCreated.length === 0) return null;

  if (variant === "compact") {
    return (
      <p className={`mt-1 text-sm text-zinc-500 ${className}`}>
        {nonCreated.map((c, i) => (
          <span key={c.id ?? i}>
            {i > 0 && " · "}
            <ClaimLine claim={c} stopPropagation={stopPropagation} />
          </span>
        ))}
      </p>
    );
  }

  return (
    <ul className={`mt-2 space-y-1 text-sm text-zinc-600 ${className}`}>
      {nonCreated.map((c, i) => (
        <li key={c.id ?? i}>
          <ClaimLine claim={c} stopPropagation={stopPropagation} />
        </li>
      ))}
    </ul>
  );
}
