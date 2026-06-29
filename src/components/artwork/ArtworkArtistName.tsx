"use client";

/**
 * ArtworkArtistName — single SSOT for rendering an artwork's artist name and
 * its (optional) profile link across every surface (feed cards, artwork
 * detail header, future grids).
 *
 * The hard rule it enforces:
 *   - The displayed name is ALWAYS the artist's name (external invited artist
 *     name when the work was uploaded for a not-yet-onboarded artist, or the
 *     onboarded artist's profile name otherwise). It must never collapse to
 *     the uploading gallery / account name.
 *   - Linking behavior depends on who the artist is:
 *       • onboarded artist with a public handle → direct link to /u/<handle>
 *       • external (not-yet-onboarded) artist     → clicking opens a confirm
 *         dialog explaining the artist hasn't joined yet, and only on confirm
 *         navigates to the account that uploaded the work.
 *       • no linkable target                       → plain text.
 *
 * This removes the long-standing confusion where tapping "김수철" / "이의연"
 * silently dropped the viewer onto the gallery account ("지원닷아트코리아").
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/useT";
import { ConfirmActionDialog } from "@/components/ds";
import { hasPublicLinkableUsername } from "@/lib/identity/format";

type UploaderLite = {
  username?: string | null;
  display_name?: string | null;
} | null;

type Props = {
  /** The artist name to display (already resolved to external/onboarded). */
  name: string;
  /** True when the credited artist has not completed onboarding (external). */
  isExternal: boolean;
  /** Onboarded artist's public handle, when available (non-external only). */
  artistUsername?: string | null;
  /** The account/gallery that uploaded the work — redirect target for external. */
  uploader?: UploaderLite;
  /** Extra classes applied to the name element (link/button/span). */
  className?: string;
  /**
   * Stop click propagation. Required when this renders inside a clickable
   * card (e.g. feed tile) so tapping the name doesn't also trigger the card.
   */
  stopPropagation?: boolean;
};

export function ArtworkArtistName({
  name,
  isExternal,
  artistUsername,
  uploader,
  className,
  stopPropagation = false,
}: Props) {
  const { t } = useT();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onboardedHandle =
    !isExternal && hasPublicLinkableUsername({ username: artistUsername ?? null })
      ? (artistUsername ?? "").replace(/^@+/, "")
      : null;

  const uploaderHandle =
    uploader && hasPublicLinkableUsername(uploader)
      ? (uploader.username ?? "").replace(/^@+/, "")
      : null;

  // Onboarded artist with a real profile → direct link (canonical behavior).
  if (onboardedHandle) {
    return (
      <Link
        href={`/u/${onboardedHandle}`}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        className={className}
      >
        {name}
      </Link>
    );
  }

  // External (not-yet-onboarded) artist with a known uploader → confirm first,
  // then redirect to the uploading account.
  if (isExternal && uploaderHandle) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            setConfirmOpen(true);
          }}
          className={`max-w-full truncate text-left ${className ?? ""}`}
        >
          {name}
        </button>
        {confirmOpen && (
          <span
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ConfirmActionDialog
              open={confirmOpen}
              title={t("artwork.externalArtistRedirect.title")}
              description={t("artwork.externalArtistRedirect.body")}
              confirmLabel={t("artwork.externalArtistRedirect.confirm")}
              cancelLabel={t("common.cancel")}
              tone="neutral"
              onConfirm={() => {
                setConfirmOpen(false);
                router.push(`/u/${uploaderHandle}`);
              }}
              onCancel={() => setConfirmOpen(false)}
            />
          </span>
        )}
      </>
    );
  }

  // No linkable target → plain text (still the artist's name).
  return <span className={className}>{name}</span>;
}
