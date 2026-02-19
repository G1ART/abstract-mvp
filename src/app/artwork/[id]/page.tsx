"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useParams } from "next/navigation";
import { getArtworkBack } from "@/lib/artworkBack";
import { getSession } from "@/lib/supabase/auth";
import {
  type ArtworkWithLikes,
  canDeleteArtwork,
  canEditArtwork,
  canViewProvenance,
  deleteArtworkCascade,
  getArtworkById,
  getArtworkImageUrl,
  getMyClaim,
  getProvenanceClaims,
  recordArtworkView,
} from "@/lib/supabase/artworks";
import { isLiked } from "@/lib/supabase/likes";
import { isFollowing } from "@/lib/supabase/follows";
import { FollowButton } from "@/components/FollowButton";
import { LikeButton } from "@/components/LikeButton";
import { ArtworkProvenanceBlock } from "@/components/ArtworkProvenanceBlock";
import {
  claimTypeToByPhrase,
  createClaimRequest,
  confirmClaim,
  rejectClaim,
  listPendingClaimsForWork,
  type PendingClaimRow,
} from "@/lib/provenance/rpc";
import type { ClaimType } from "@/lib/provenance/types";
import {
  createPriceInquiry,
  getMyInquiryForArtwork,
  listPriceInquiriesForArtwork,
  replyToPriceInquiry,
  resendPriceInquiryNotification,
  canReplyToPriceInquiry,
  type PriceInquiryRow,
} from "@/lib/supabase/priceInquiries";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProvenanceHistory, setShowProvenanceHistory] = useState(false);
  const [requestingClaim, setRequestingClaim] = useState<ClaimType | null>(null);
  /** When set, user is choosing period before sending CURATED/EXHIBITED request. */
  const [claimTypeToRequest, setClaimTypeToRequest] = useState<ClaimType | null>(null);
  const [requestPeriodStatus, setRequestPeriodStatus] = useState<"past" | "current" | "future">("current");
  const [pendingClaims, setPendingClaims] = useState<PendingClaimRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** When set, artist is editing period before confirming a CURATED/EXHIBITED claim. */
  const [confirmingClaimId, setConfirmingClaimId] = useState<string | null>(null);
  const [confirmPeriodStatus, setConfirmPeriodStatus] = useState<"past" | "current" | "future">("current");
  const [claimDropdownOpen, setClaimDropdownOpen] = useState(false);
  const [fullSizeOpen, setFullSizeOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [myPriceInquiry, setMyPriceInquiry] = useState<PriceInquiryRow | null>(null);
  const [priceInquiryLoading, setPriceInquiryLoading] = useState(false);
  const [priceInquirySubmitting, setPriceInquirySubmitting] = useState(false);
  const [priceInquiryMessage, setPriceInquiryMessage] = useState("");
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [artistInquiries, setArtistInquiries] = useState<PriceInquiryRow[]>([]);
  const [artistInquiriesLoading, setArtistInquiriesLoading] = useState(false);
  const [canReplyToInquiriesFromBackend, setCanReplyToInquiriesFromBackend] = useState<boolean | null>(null);
  const [replyingInquiryId, setReplyingInquiryId] = useState<string | null>(null);
  const [resendingNotificationInquiryId, setResendingNotificationInquiryId] = useState<string | null>(null);
  const [artistReplyText, setArtistReplyText] = useState<Record<string, string>>({});
  const claimDropdownRef = useRef<HTMLDivElement>(null);
  const VIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const fn = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (!fullSizeOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullSizeOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullSizeOpen]);

  const isOwner = Boolean(artwork && userId && artwork.artist_id === userId);
  const canEdit = Boolean(artwork && userId && canEditArtwork(artwork, userId));
  const canDelete = Boolean(artwork && userId && canDeleteArtwork(artwork, userId));
  const myClaim = artwork && userId ? getMyClaim(artwork, userId) : null;
  const myClaimsByType = artwork?.claims?.filter((c) => c.subject_profile_id === userId) ?? [];
  const hasPendingRequest = myClaim?.status === "pending";
  const hasOwnsClaim = myClaimsByType.some((c) => c.claim_type === "OWNS");
  const canRequestClaim = Boolean(userId && artwork && !isOwner);
  const provenanceClaims = artwork ? getProvenanceClaims(artwork) : [];
  const hasProvenanceHistory = provenanceClaims.length > 1;
  const showProvenance = artwork && canViewProvenance(artwork, userId);

  async function handleDelete() {
    if (!id || !canDelete) return;
    setDeleting(true);
    const { error: err } = await deleteArtworkCascade(id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (err) {
      logSupabaseError("deleteArtwork", err);
      setError(formatSupabaseError(err, "Delete failed"));
      return;
    }
    router.push("/my");
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

  useEffect(() => {
    if (!id || !isOwner) return;
    listPendingClaimsForWork(id).then(({ data }) => setPendingClaims(data ?? []));
  }, [id, isOwner]);

  useEffect(() => {
    if (!claimDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (claimDropdownRef.current && !claimDropdownRef.current.contains(e.target as Node)) {
        setClaimDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [claimDropdownOpen]);

  const showPriceInquiryBlock =
    Boolean(userId && artwork && userId !== artwork.artist_id) &&
    (artwork?.pricing_mode === "inquire" || artwork?.is_price_public === false);

  const showArtistInquiryBlock =
    Boolean(userId && artwork && (artwork.pricing_mode === "inquire" || artwork.is_price_public === false)) &&
    canReplyToInquiriesFromBackend === true;

  useEffect(() => {
    if (!id || !showPriceInquiryBlock) return;
    setPriceInquiryLoading(true);
    getMyInquiryForArtwork(id).then(({ data }) => {
      setMyPriceInquiry(data ?? null);
      setPriceInquiryLoading(false);
    });
  }, [id, showPriceInquiryBlock]);

  useEffect(() => {
    if (!id || !userId || !artwork) return;
    if (artwork.pricing_mode !== "inquire" && artwork.is_price_public !== false) {
      setCanReplyToInquiriesFromBackend(false);
      return;
    }
    canReplyToPriceInquiry(id).then(({ data, error }) => {
      if (error) setCanReplyToInquiriesFromBackend(false);
      else setCanReplyToInquiriesFromBackend(!!data);
    });
  }, [id, userId, artwork?.id, artwork?.pricing_mode, artwork?.is_price_public]);

  useEffect(() => {
    if (!id || !showArtistInquiryBlock) return;
    setArtistInquiriesLoading(true);
    listPriceInquiriesForArtwork(id).then(({ data }) => {
      setArtistInquiries(data ?? []);
      setArtistInquiriesLoading(false);
    });
  }, [id, showArtistInquiryBlock]);

  async function handleAskPrice() {
    if (!id || !artwork || priceInquirySubmitting) return;
    setPriceInquirySubmitting(true);
    const { data, error } = await createPriceInquiry(id, priceInquiryMessage || undefined);
    setPriceInquirySubmitting(false);
    setShowInquiryForm(false);
    setPriceInquiryMessage("");
    if (error) {
      logSupabaseError("createPriceInquiry", error);
      setError(formatSupabaseError(error, "Failed to send inquiry"));
      return;
    }
    const { data: inquiry } = await getMyInquiryForArtwork(id);
    setMyPriceInquiry(inquiry ?? null);
  }

  async function handleResendNotification(inquiryId: string) {
    setResendingNotificationInquiryId(inquiryId);
    const { data, error } = await resendPriceInquiryNotification(inquiryId);
    setResendingNotificationInquiryId(null);
    if (error) {
      logSupabaseError("resendPriceInquiryNotification", error);
      setError(formatSupabaseError(error, t("priceInquiry.resendFailed")));
      return;
    }
    if (data > 0) {
      setError(null);
      setSuccessMessage(t("priceInquiry.resendSuccess"));
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  }

  async function handleArtistReply(inquiryId: string) {
    const text = artistReplyText[inquiryId]?.trim();
    if (!text) return;
    setReplyingInquiryId(inquiryId);
    const { error: err } = await replyToPriceInquiry(inquiryId, text);
    setReplyingInquiryId(null);
    if (err) {
      logSupabaseError("replyToPriceInquiry", err);
      setError(formatSupabaseError(err, "Failed to send reply"));
      return;
    }
    setArtistReplyText((prev) => {
      const next = { ...prev };
      delete next[inquiryId];
      return next;
    });
    const { data } = await listPriceInquiriesForArtwork(id);
    setArtistInquiries(data ?? []);
  }

  /** One-click for OWNS; for CURATED/EXHIBITED we show period picker (claimTypeToRequest) first. */
  function handleRequestClaimClick(claimType: ClaimType) {
    if (claimType === "OWNS") {
      handleRequestClaim(claimType);
      return;
    }
    if (claimType === "CURATED" || claimType === "EXHIBITED") {
      setClaimTypeToRequest(claimType);
      setRequestPeriodStatus("current");
      setClaimDropdownOpen(false);
    }
  }

  async function handleRequestClaim(claimType: ClaimType, periodStatus?: "past" | "current" | "future") {
    if (!id || !artwork?.artist_id || !userId) return;
    setRequestingClaim(claimType);
    const payload: Parameters<typeof createClaimRequest>[0] = {
      workId: id,
      claimType,
      artistProfileId: artwork.artist_id,
    };
    if (claimType === "CURATED" || claimType === "EXHIBITED") {
      payload.period_status = periodStatus ?? "current";
    }
    const { data, error } = await createClaimRequest(payload);
    setRequestingClaim(null);
    setClaimTypeToRequest(null);
    setClaimDropdownOpen(false);
    if (error) {
      logSupabaseError("createClaimRequest", error);
      setError(formatSupabaseError(error, "Request failed"));
      return;
    }
    const { data: refreshed } = await getArtworkById(id);
    setArtwork(refreshed as ArtworkWithLikes | null);
  }

  async function handleConfirm(
    claimId: string,
    payload?: { period_status?: "past" | "current" | "future"; start_date?: string | null; end_date?: string | null }
  ) {
    setConfirmingId(claimId);
    const { error } = await confirmClaim(claimId, payload);
    setConfirmingId(null);
    setConfirmingClaimId(null);
    if (error) {
      logSupabaseError("confirmClaim", error);
      setError(formatSupabaseError(error, "Confirm failed"));
      return;
    }
    setPendingClaims((prev) => prev.filter((c) => c.id !== claimId));
    if (id) {
      const { data } = await getArtworkById(id);
      setArtwork(data as ArtworkWithLikes | null);
    }
  }

  /** Open period form for CURATED/EXHIBITED; for OWNS confirm immediately. */
  function handleApproveClick(row: PendingClaimRow) {
    if (row.claim_type === "OWNS") {
      handleConfirm(row.id);
      return;
    }
    if (row.claim_type === "CURATED" || row.claim_type === "EXHIBITED") {
      setConfirmingClaimId(row.id);
      setConfirmPeriodStatus((row.period_status ?? "current") as "past" | "current" | "future");
    }
  }

  async function handleReject(claimId: string) {
    setConfirmingId(claimId);
    const { error } = await rejectClaim(claimId);
    setConfirmingId(null);
    if (error) {
      logSupabaseError("rejectClaim", error);
      setError(formatSupabaseError(error, "Reject failed"));
      return;
    }
    setPendingClaims((prev) => prev.filter((c) => c.id !== claimId));
  }

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

  const { path: backPath, labelKey: backLabelKey } = getArtworkBack();

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={backPath}
        className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← {t("common.backTo")} {t(backLabelKey)}
      </Link>
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div
            className={`aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 ${isDesktop && sortedImages.length > 0 ? "cursor-zoom-in" : ""}`}
            role={isDesktop && sortedImages.length > 0 ? "button" : undefined}
            tabIndex={isDesktop && sortedImages.length > 0 ? 0 : undefined}
            onClick={() => isDesktop && sortedImages.length > 0 && setFullSizeOpen(true)}
            onKeyDown={(e) => isDesktop && sortedImages.length > 0 && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setFullSizeOpen(true))}
          >
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
          {fullSizeOpen && sortedImages.length > 0 && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              role="dialog"
              aria-modal="true"
              aria-label={artwork.title ?? "Artwork"}
              onClick={() => setFullSizeOpen(false)}
            >
              <img
                src={getArtworkImageUrl(sortedImages[0].storage_path, "original")}
                alt={artwork.title ?? "Artwork"}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
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
            {showPriceInquiryBlock && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                {priceInquiryLoading ? (
                  <p className="text-sm text-zinc-500">{t("common.loading")}</p>
                ) : myPriceInquiry ? (
                  <div className="text-sm text-zinc-700">
                    {myPriceInquiry.artist_reply ? (
                      <>
                        <p className="font-medium text-zinc-800">{t("priceInquiry.replyFromArtist")}</p>
                        <p className="mt-1 whitespace-pre-wrap">{myPriceInquiry.artist_reply}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-zinc-600">{t("priceInquiry.sent")}</p>
                        <button
                          type="button"
                          onClick={() => handleResendNotification(myPriceInquiry.id)}
                          disabled={resendingNotificationInquiryId === myPriceInquiry.id}
                          className="mt-2 text-sm font-medium text-zinc-600 underline hover:text-zinc-800 disabled:opacity-50"
                        >
                          {resendingNotificationInquiryId === myPriceInquiry.id ? "..." : t("priceInquiry.resendNotification")}
                        </button>
                        {successMessage && <p className="mt-1 text-sm text-green-600">{successMessage}</p>}
                      </>
                    )}
                  </div>
                ) : showInquiryForm ? (
                  <div className="space-y-2">
                    <textarea
                      value={priceInquiryMessage}
                      onChange={(e) => setPriceInquiryMessage(e.target.value)}
                      placeholder={t("priceInquiry.messagePlaceholder")}
                      rows={2}
                      className="w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleAskPrice}
                        disabled={priceInquirySubmitting}
                        className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
                      >
                        {priceInquirySubmitting ? "..." : t("priceInquiry.submit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowInquiryForm(false); setPriceInquiryMessage(""); }}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInquiryForm(true)}
                    className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t("priceInquiry.ask")}
                  </button>
                )}
              </div>
            )}
            {showArtistInquiryBlock && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-800">{t("priceInquiry.title")}</p>
                {artistInquiriesLoading ? (
                  <p className="text-sm text-zinc-500">{t("common.loading")}</p>
                ) : artistInquiries.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t("priceInquiry.empty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {artistInquiries.map((row) => (
                      <li key={row.id} className="rounded border border-zinc-200 bg-white p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-zinc-700">
                            {row.inquirer?.display_name?.trim() || row.inquirer?.username || "Someone"}
                            {row.inquirer?.username && (
                              <span className="font-normal text-zinc-500"> @{row.inquirer.username}</span>
                            )}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {new Date(row.created_at).toLocaleString()}
                          </span>
                        </div>
                        {row.message && (
                          <p className="mb-2 text-sm text-zinc-600">{row.message}</p>
                        )}
                        {row.artist_reply ? (
                          <div className="rounded bg-zinc-100 p-2 text-sm text-zinc-800">
                            <span className="font-medium text-zinc-600">{t("priceInquiry.replyFromArtist")}:</span>{" "}
                            <span className="whitespace-pre-wrap">{row.artist_reply}</span>
                          </div>
                        ) : (
                          <div>
                            <textarea
                              placeholder={t("priceInquiry.replyPlaceholder")}
                              value={artistReplyText[row.id] ?? ""}
                              onChange={(e) =>
                                setArtistReplyText((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              rows={2}
                              className="w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              disabled={!artistReplyText[row.id]?.trim() || replyingInquiryId === row.id}
                              onClick={() => handleArtistReply(row.id)}
                              className="mt-2 rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
                            >
                              {replyingInquiryId === row.id ? t("common.loading") : t("priceInquiry.reply")}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
            {canRequestClaim && (
              <div className="mt-4" ref={claimDropdownRef}>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setClaimDropdownOpen((open) => !open)}
                    disabled={requestingClaim !== null}
                    className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {requestingClaim ? "..." : t("artwork.thisArtworkIs")}
                    <span className="text-zinc-400" aria-hidden>{claimDropdownOpen ? " ▲" : " ▼"}</span>
                  </button>
                  {claimDropdownOpen && (
                    <div className="absolute left-0 top-full z-10 mt-1 min-w-[12rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                      {!hasOwnsClaim && (
                        <button
                          type="button"
                          onClick={() => handleRequestClaimClick("OWNS")}
                          disabled={requestingClaim !== null}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {t("artwork.ownedByMe")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRequestClaimClick("CURATED")}
                        disabled={requestingClaim !== null}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {t("artwork.curatedByMe")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestClaimClick("EXHIBITED")}
                        disabled={requestingClaim !== null}
                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {t("artwork.exhibitedByMe")}
                      </button>
                    </div>
                  )}
                </div>
                {claimTypeToRequest && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50/50 px-3 py-2">
                    <label className="text-sm text-zinc-600">
                      {t("artwork.periodLabel")}:
                      <select
                        value={requestPeriodStatus}
                        onChange={(e) => setRequestPeriodStatus(e.target.value as "past" | "current" | "future")}
                        className="ml-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
                      >
                        <option value="past">{t("artwork.periodPast")}</option>
                        <option value="current">{t("artwork.periodCurrent")}</option>
                        <option value="future">{t("artwork.periodFuture")}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRequestClaim(claimTypeToRequest, requestPeriodStatus)}
                      disabled={requestingClaim !== null}
                      className="rounded bg-zinc-800 px-2 py-1 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
                    >
                      {t("artwork.sendRequest")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setClaimTypeToRequest(null)}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
                {hasPendingRequest && (
                  <p className="mt-2 text-sm text-zinc-500">{t("artwork.requestPending")}</p>
                )}
              </div>
            )}
            {isOwner && pendingClaims.length > 0 && (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                <p className="mb-2 text-sm font-medium text-zinc-700">{t("artwork.pendingRequests")}</p>
                <ul className="space-y-2">
                  {pendingClaims.map((row) => {
                    const name = row.profiles?.display_name?.trim() || row.profiles?.username || "—";
                    const typeLabel =
                      row.claim_type === "OWNS"
                        ? t("artwork.ownedByMe")
                        : row.claim_type === "CURATED"
                          ? t("artwork.curatedByMe")
                          : row.claim_type === "EXHIBITED"
                            ? t("artwork.exhibitedByMe")
                            : row.claim_type;
                    const showConfirmForm =
                      confirmingClaimId === row.id &&
                      (row.claim_type === "CURATED" || row.claim_type === "EXHIBITED");
                    return (
                      <li key={row.id} className="flex flex-col gap-2 text-sm text-zinc-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{name} — {typeLabel}</span>
                          {!showConfirmForm && (
                            <span className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleApproveClick(row)}
                                disabled={confirmingId !== null}
                                className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
                              >
                                {t("artwork.approve")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(row.id)}
                                disabled={confirmingId !== null}
                                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                              >
                                {t("artwork.reject")}
                              </button>
                            </span>
                          )}
                        </div>
                        {showConfirmForm && (
                          <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-white p-2">
                            <label className="text-zinc-600">
                              {t("artwork.periodLabel")}:
                              <select
                                value={confirmPeriodStatus}
                                onChange={(e) =>
                                  setConfirmPeriodStatus(e.target.value as "past" | "current" | "future")
                                }
                                className="ml-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                              >
                                <option value="past">{t("artwork.periodPast")}</option>
                                <option value="current">{t("artwork.periodCurrent")}</option>
                                <option value="future">{t("artwork.periodFuture")}</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleConfirm(row.id, { period_status: confirmPeriodStatus })}
                              disabled={confirmingId !== null}
                              className="rounded bg-zinc-800 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
                            >
                              {t("artwork.confirmWithPeriod")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingClaimId(null)}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {(canEdit || canDelete) && (
              <div className="mt-4 flex items-center gap-4">
                {canEdit && (
                  <Link
                    href={`/artwork/${id}/edit`}
                    className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
                  >
                    {t("common.edit")}
                  </Link>
                )}
                {canDelete && (
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
