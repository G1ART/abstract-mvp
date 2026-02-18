"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useParams } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import {
  type ArtworkWithLikes,
  canEditArtwork,
  canViewProvenance,
  deleteArtworkCascade,
  getArtworkById,
  getArtworkImageUrl,
  getProvenanceClaims,
  getMyClaim,
  recordArtworkView,
} from "@/lib/supabase/artworks";
import { isLiked } from "@/lib/supabase/likes";
import { isFollowing } from "@/lib/supabase/follows";
import { FollowButton } from "@/components/FollowButton";
import { LikeButton } from "@/components/LikeButton";
import { ArtworkProvenanceBlock } from "@/components/ArtworkProvenanceBlock";
import { createClaimForExistingArtist, claimTypeToByPhrase } from "@/lib/provenance/rpc";
import type { ClaimType } from "@/lib/provenance/types";
import { useT } from "@/lib/i18n/useT";

function getPriceDisplay(artwork: ArtworkWithLikes): string {
  if (artwork.pricing_mode === "inquire") return "Price upon request";
  if (artwork.is_price_public && artwork.price_usd != null) {
    return `$${Number(artwork.price_usd).toLocaleString()} USD`;
  }
  return "Price hidden";
}

function ArtworkDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [artwork, setArtwork] = useState<ArtworkWithLikes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [claimingOwn, setClaimingOwn] = useState(false);
  const [showProvenanceHistory, setShowProvenanceHistory] = useState(false);
  const VIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes

  const isOwner = Boolean(artwork && userId && artwork.artist_id === userId);
  const canEdit = Boolean(artwork && userId && canEditArtwork(artwork, userId));
  const myClaim = artwork && userId ? getMyClaim(artwork, userId) : null;
  const isInNetwork = Boolean(artwork && userId && (artwork.artist_id === userId || myClaim));
  const canShowClaimIOwn = Boolean(userId && artwork && isInNetwork && myClaim?.claim_type !== "OWNS");
  const provenanceClaims = artwork ? getProvenanceClaims(artwork) : [];
  const hasProvenanceHistory = provenanceClaims.length > 1;
  const showProvenance = artwork && canViewProvenance(artwork, userId);

  async function handleDelete() {
    if (!id || !isOwner) return;
    setDeleting(true);
    const { error: err } = await deleteArtworkCascade(id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      return;
    }
    router.push("/my");
  }

  async function handleClaimIOwn() {
    if (!id || !userId || !artwork) return;
    setClaimingOwn(true);
    setError(null);
    const { error: err } = await createClaimForExistingArtist({
      artistProfileId: artwork.artist_id,
      claimType: "OWNS",
      workId: id,
      visibility: "public",
    });
    setClaimingOwn(false);
    if (err) {
      setError((err as { message?: string })?.message ?? "Failed to add claim");
      return;
    }
    const { data } = await getArtworkById(id);
    setArtwork(data as ArtworkWithLikes | null);
  }

  const recordView = useCallback(async () => {
    if (!id || typeof window === "undefined") return;
    const key = `viewed_artwork_${id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!isNaN(ts) && Date.now() - ts < VIEW_TTL_MS) return;
    }
    await recordArtworkView(id);
    localStorage.setItem(key, Date.now().toString());
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getArtworkById(id).then(({ data, error: err }) => {
      setLoading(false);
      if (err) {
        const msg =
          (err as { message?: string })?.message ??
          (err as { error?: { message?: string } })?.error?.message ??
          (typeof err === "string" ? err : JSON.stringify(err));
        setError(msg);
        return;
      }
      setArtwork(data as ArtworkWithLikes | null);
    });
  }, [id]);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (artwork?.artist_id && userId && userId !== artwork.artist_id) {
      isFollowing(artwork.artist_id).then(({ data }) => setFollowing(data ?? false));
    }
  }, [artwork?.artist_id, userId]);

  useEffect(() => {
    if (id && userId) {
      isLiked(id).then(setLiked);
    }
  }, [id, userId]);

  useEffect(() => {
    if (artwork && userId) {
      recordView();
    }
  }, [artwork, userId, recordView]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-zinc-600">Loading...</p>
      </div>
    );
  }

  if (error || !artwork) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{error ? String(error) : "Artwork not found"}</p>
      </div>
    );
  }

  const images = artwork.artwork_images ?? [];
  const sortedImages = [...images].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const artist = artwork.profiles;
  const username = artist?.username ?? "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/feed?tab=all&sort=latest"
        className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Back to feed
      </Link>
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-100">
            {sortedImages.length > 0 ? (
              <Image
                src={getArtworkImageUrl(sortedImages[0].storage_path, "medium")}
                alt={artwork.title ?? "Artwork"}
                width={600}
                height={600}
                sizes="(max-width: 768px) 100vw, 600px"
                priority
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                No image
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {artwork.title ?? "Untitled"}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {[artwork.year, artwork.medium].filter(Boolean).join(" · ")}
            </p>
            {artwork.ownership_status && (
              <p className="mt-2 font-medium text-zinc-700">
                {artwork.ownership_status}
              </p>
            )}
            <p className="mt-2 text-sm text-zinc-600">
              {getPriceDisplay(artwork)}
            </p>
            <div className="mt-2">
              <LikeButton
                artworkId={artwork.id}
                likesCount={Number(artwork.likes_count) || 0}
                isLiked={liked}
                onUpdate={(newLiked, newCount) => {
                  setLiked(newLiked);
                  setArtwork((prev) =>
                    prev ? { ...prev, likes_count: newCount } : null
                  );
                }}
                showLoginCta={!userId}
              />
            </div>
            {username && (
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={`/u/${username}`}
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
                >
                  @{username}
                  {artist?.display_name && ` (${artist.display_name})`}
                </Link>
                {userId && userId !== artwork.artist_id && (
                  <FollowButton
                    targetProfileId={artwork.artist_id}
                    initialFollowing={following}
                    size="sm"
                  />
                )}
              </div>
            )}
            {showProvenance && (
              <div className="mt-4">
                <ArtworkProvenanceBlock artwork={artwork} viewerId={userId} variant="full" />
                {hasProvenanceHistory && (
                  <button
                    type="button"
                    onClick={() => setShowProvenanceHistory((v) => !v)}
                    className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-700"
                  >
                    {showProvenanceHistory ? t("artwork.hideHistory") : t("artwork.viewHistory")}
                  </button>
                )}
                {showProvenanceHistory && provenanceClaims.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-sm text-zinc-600">
                    {provenanceClaims.map((c, i) => {
                      const byPhrase = claimTypeToByPhrase(c.claim_type as ClaimType);
                      const label = byPhrase
                        ? `${byPhrase} ${c.profiles?.display_name?.trim() || c.profiles?.username || "—"}`
                        : (c.claim_type === "CREATED" && artwork?.profiles?.display_name) || "—";
                      const date = c.created_at
                        ? new Date(c.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                        : "";
                      return (
                        <li key={c.id ?? i} className="flex justify-between gap-2">
                          <span>{c.claim_type === "CREATED" ? `by ${artwork?.profiles?.display_name ?? artwork?.profiles?.username ?? "Artist"}` : label}</span>
                          {date && <span className="text-zinc-400">{date}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {canShowClaimIOwn && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleClaimIOwn}
                  disabled={claimingOwn}
                  className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {claimingOwn ? t("common.loading") : t("artwork.claimIOwn")}
                </button>
              </div>
            )}
            {canEdit && (
              <div className="mt-4 flex items-center gap-4">
                <Link
                  href={`/artwork/${id}/edit`}
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
                >
                  {t("common.edit")}
                </Link>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    {t("common.delete")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
              <p className="mb-4 text-sm text-zinc-700">{t("common.confirmDelete")}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded border border-zinc-300 px-4 py-2 text-sm"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
        {artwork.story && (
          <p className="text-sm text-zinc-600">{artwork.story}</p>
        )}
      </div>
    </main>
  );
}

export default function ArtworkDetailPage() {
  return <ArtworkDetailContent />;
}
