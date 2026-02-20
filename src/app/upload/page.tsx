"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, sendMagicLink } from "@/lib/supabase/auth";
import {
  attachArtworkImage,
  createArtwork,
  deleteArtwork,
  type CreateArtworkPayload,
} from "@/lib/supabase/artworks";
import { removeStorageFile, uploadArtworkImage } from "@/lib/supabase/storage";
import { searchPeople } from "@/lib/supabase/artists";
import {
  createClaimForExistingArtist,
  createExternalArtistAndClaim,
  searchWorksForDedup,
} from "@/lib/provenance/rpc";
import type { ClaimType } from "@/lib/provenance/types";
import { setArtworkBack } from "@/lib/artworkBack";
import { addWorkToExhibition } from "@/lib/supabase/exhibitions";
import { logSupabaseError } from "@/lib/supabase/errors";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";

type UploadStep = "intent" | "attribution" | "form" | "dedup";

type IntentType = "CREATED" | "OWNS" | "INVENTORY" | "CURATED";

const INTENTS: { value: IntentType; label: string }[] = [
  { value: "CREATED", label: "My work" },
  { value: "OWNS", label: "Collected work" },
  { value: "INVENTORY", label: "Gallery (inc. inventory)" },
  { value: "CURATED", label: "Curated/Exhibited" },
];

const OWNERSHIP_STATUSES = [
  { value: "available", label: "Available" },
  { value: "owned", label: "Owned" },
  { value: "sold", label: "Sold" },
  { value: "not_for_sale", label: "Not for sale" },
] as const;

const PRICING_MODES = [
  { value: "fixed", label: "Fixed price" },
  { value: "inquire", label: "Price upon request" },
] as const;

const PRICE_CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "KRW", label: "KRW" },
] as const;

type ArtistOption = { id: string; username: string | null; display_name: string | null };

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addToExhibitionId = searchParams.get("addToExhibition");
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<UploadStep>("intent");
  const [intent, setIntent] = useState<IntentType | null>(null);

  // Attribution (OWNS only)
  const [artistSearch, setArtistSearch] = useState("");
  const [artistResults, setArtistResults] = useState<ArtistOption[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [useExternalArtist, setUseExternalArtist] = useState(false);
  const [externalArtistName, setExternalArtistName] = useState("");
  const [externalArtistEmail, setExternalArtistEmail] = useState("");

  // Form
  const [image, setImage] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [medium, setMedium] = useState("");
  const [size, setSize] = useState("");
  const [story, setStory] = useState("");
  const [ownershipStatus, setOwnershipStatus] = useState("available");
  const [pricingMode, setPricingMode] = useState<"fixed" | "inquire">("fixed");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [priceAmount, setPriceAmount] = useState("");
  const [isPricePublic, setIsPricePublic] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<"past" | "current" | "future">("current");

  // Dedup
  const [similarWorks, setSimilarWorks] = useState<{ id: string; title: string | null }[]>([]);
  const [dedupLoading, setDedupLoading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToast, setInviteToast] = useState<"sent" | "failed" | null>(null);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  const doSearchArtists = useCallback(async () => {
    const q = artistSearch.trim();
    if (!q || q.length < 2) {
      setArtistResults([]);
      return;
    }
    setSearching(true);
    const { data } = await searchPeople({ q, roles: ["artist"], limit: 10 });
    setArtistResults((data ?? []).map((p) => ({ id: p.id, username: p.username, display_name: p.display_name })));
    setSearching(false);
  }, [artistSearch]);

  useEffect(() => {
    const t = setTimeout(doSearchArtists, 300);
    return () => clearTimeout(t);
  }, [artistSearch, doSearchArtists]);

  const needsAttribution = (v: IntentType | null) => v !== "CREATED";

  function handleIntentSelect(value: IntentType) {
    setIntent(value);
    setError(null);
    if (value === "CREATED") {
      setStep("form");
    } else {
      setStep("attribution");
      setSelectedArtist(null);
    }
  }

  function handleAttributionNext() {
    if (needsAttribution(intent)) {
      if (useExternalArtist) {
        if (!externalArtistName.trim()) {
          setError("Please enter the artist name");
          return;
        }
      } else if (!selectedArtist) {
        setError("Please select an artist");
        return;
      }
    }
    setError(null);
    setStep("form");
  }

  function handleFormNext(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!image || !title.trim() || !year || !medium.trim() || !size.trim()) {
      setError("Please fill required fields");
      return;
    }
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1000 || yearNum > 9999) {
      setError("Please enter a valid year (4 digits)");
      return;
    }
    if (pricingMode === "fixed" && (!priceAmount || parseFloat(priceAmount) <= 0)) {
      setError("Please enter a valid price");
      return;
    }
    setStep("dedup");
    fetchSimilarWorks();
  }

  async function fetchSimilarWorks() {
    setDedupLoading(true);
    const { data } = await searchWorksForDedup({
      artistProfileId: needsAttribution(intent) && selectedArtist ? selectedArtist.id : userId ?? undefined,
      q: title.trim(),
      limit: 5,
    });
    setSimilarWorks((data ?? []).map((w) => ({ id: w.id, title: w.title })));
    setDedupLoading(false);
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setError(null);

    if (!image || !userId) {
      setError(!userId ? "Not authenticated" : "Please select an image");
      return;
    }

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1000 || yearNum > 9999) {
      setError("Please enter a valid year (4 digits)");
      return;
    }

    const isExternal = needsAttribution(intent) && useExternalArtist;
    const payload: CreateArtworkPayload = {
      title: title.trim(),
      year: yearNum,
      medium: medium.trim(),
      size: size.trim(),
      story: story.trim() || null,
      ownership_status: ownershipStatus,
      pricing_mode: pricingMode,
      is_price_public: pricingMode === "fixed" ? isPricePublic : false,
      price_input_amount: pricingMode === "fixed" && priceAmount ? parseFloat(priceAmount) : undefined,
      price_input_currency: pricingMode === "fixed" ? priceCurrency : undefined,
      artist_id: needsAttribution(intent) && selectedArtist && !isExternal ? selectedArtist.id : undefined,
    };

    setIsSubmitting(true);

    let inviteSent = false;
    let inviteSendFailed = false;
    try {
      const { data: artworkId, error: createErr } = await createArtwork(payload);
      if (createErr) {
        const msg = (createErr as { message?: string; code?: string })?.message ?? String(createErr);
        const code = (createErr as { code?: string })?.code;
        setError(code ? `[${code}] ${msg}` : msg || "Failed to create artwork");
        setIsSubmitting(false);
        return;
      }
      if (!artworkId) {
        setError("Failed to create artwork");
        setIsSubmitting(false);
        return;
      }

      // Create claim BEFORE attaching image (RLS: artwork_images INSERT needs claim for lister)
      const claimType: ClaimType = intent === "CREATED" ? "CREATED" : (intent ?? "OWNS");
      const claimPayload: { period_status?: "past" | "current" | "future" } = {};
      if (claimType === "INVENTORY" || claimType === "CURATED") {
        claimPayload.period_status = periodStatus;
      }
      if (isExternal) {
        const { error: claimErr } = await createExternalArtistAndClaim({
          displayName: externalArtistName.trim(),
          inviteEmail: externalArtistEmail.trim() || null,
          claimType,
          workId: artworkId,
          visibility: "public",
          ...claimPayload,
        });
        if (claimErr) {
          await deleteArtwork(artworkId);
          const msg = (claimErr as { message?: string })?.message ?? String(claimErr);
          setError(`Claim failed: ${msg}`);
          setIsSubmitting(false);
          return;
        }
        if (externalArtistEmail?.trim()) {
          const { error: inviteErr } = await sendMagicLink(externalArtistEmail.trim());
          inviteSent = !inviteErr;
          if (inviteErr) inviteSendFailed = true;
        }
      } else {
        const artistProfileId = intent === "CREATED" ? userId : selectedArtist!.id;
        const { error: claimErr } = await createClaimForExistingArtist({
          artistProfileId,
          claimType,
          workId: artworkId,
          visibility: "public",
          ...claimPayload,
        });
        if (claimErr) {
          await deleteArtwork(artworkId);
          const msg = (claimErr as { message?: string })?.message ?? String(claimErr);
          setError(`Claim failed: ${msg}`);
          setIsSubmitting(false);
          return;
        }
      }

      let storagePath: string | null = null;
      try {
        storagePath = await uploadArtworkImage(image, userId);
      } catch (uploadErr) {
        await deleteArtwork(artworkId);
        setError(uploadErr instanceof Error ? uploadErr.message : "Failed to upload image");
        setIsSubmitting(false);
        return;
      }

      const { error: attachErr } = await attachArtworkImage(artworkId, storagePath);
      if (attachErr) {
        await removeStorageFile(storagePath);
        await deleteArtwork(artworkId);
        setError(attachErr instanceof Error ? attachErr.message : "Failed to attach image");
        setIsSubmitting(false);
        return;
      }

      if (addToExhibitionId?.trim()) {
        const { error: addExErr } = await addWorkToExhibition(addToExhibitionId.trim(), artworkId);
        if (addExErr) {
          logSupabaseError("addWorkToExhibition", addExErr);
        }
      }

      const { getMyProfile } = await import("@/lib/supabase/profiles");
      const { data: profile } = await getMyProfile();
      const username = (profile as { username?: string | null } | null)?.username?.trim();
      if (inviteSent || inviteSendFailed) {
        setInviteToast(inviteSent ? "sent" : "failed");
        setTimeout(() => {
          if (addToExhibitionId?.trim()) {
            router.push(`/my/exhibitions/${addToExhibitionId.trim()}`);
          } else if (username) {
            router.push(`/u/${username}`);
          } else {
            setArtworkBack("/upload");
            router.push(`/artwork/${artworkId}`);
          }
        }, 2000);
      } else {
        if (addToExhibitionId?.trim()) {
          router.push(`/my/exhibitions/${addToExhibitionId.trim()}`);
        } else if (username) {
          router.push(`/u/${username}`);
        } else {
          setArtworkBack("/upload");
          router.push(`/artwork/${artworkId}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-xl px-4 py-8">
        {inviteToast && (
          <div
            className={`fixed bottom-4 right-4 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
              inviteToast === "sent" ? "bg-zinc-900" : "bg-amber-600"
            }`}
          >
            {inviteToast === "sent" ? t("upload.inviteSent") : t("upload.inviteSentFailed")}
          </div>
        )}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("upload.title")}</h1>
          <Link href="/upload/bulk" className="text-sm text-zinc-600 hover:text-zinc-900">
            {t("bulk.linkToBulk")} →
          </Link>
        </div>

        {/* Step: Intent */}
        {step === "intent" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">What are you uploading?</p>
            <div className="grid gap-3">
              {INTENTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleIntentSelect(opt.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left font-medium text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Attribution (OWNS, INVENTORY, CURATED) */}
        {step === "attribution" && needsAttribution(intent) && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">{t("upload.linkArtist")}</p>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium">{t("upload.searchArtist")}</label>
              <button
                type="button"
                onClick={() => {
                  setUseExternalArtist(!useExternalArtist);
                  if (!useExternalArtist) {
                    setSelectedArtist(null);
                    setArtistSearch("");
                    setArtistResults([]);
                  } else {
                    setExternalArtistName("");
                    setExternalArtistEmail("");
                  }
                }}
                className="text-sm text-zinc-600 underline hover:text-zinc-900"
              >
                {useExternalArtist ? t("upload.searchArtist") : t("upload.inviteByEmail")}
              </button>
            </div>
            {useExternalArtist ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={externalArtistName}
                  onChange={(e) => setExternalArtistName(e.target.value)}
                  placeholder={t("upload.externalArtistNamePlaceholder")}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  value={externalArtistEmail}
                  onChange={(e) => setExternalArtistEmail(e.target.value)}
                  placeholder={t("upload.externalArtistEmailPlaceholder")}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-500">{t("upload.externalArtistEmailHint")}</p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={artistSearch}
                  onChange={(e) => setArtistSearch(e.target.value)}
                  placeholder={t("upload.artistSearchPlaceholder")}
                  className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                />
                {searching && <p className="text-sm text-zinc-500">{t("artists.loading")}</p>}
                {artistResults.length > 0 && (
                  <ul className="rounded border border-zinc-200 bg-white">
                    {artistResults.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArtist(a);
                            setArtistResults([]);
                            setArtistSearch("");
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-50 ${
                            selectedArtist?.id === a.id ? "bg-zinc-100 font-medium" : ""
                          }`}
                        >
                          {a.display_name || a.username || a.id}
                          {a.username && (
                            <span className="ml-2 text-zinc-500">@{a.username}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedArtist && (
                  <p className="text-sm text-zinc-600">
                    {t("upload.selectedArtist")}: {selectedArtist.display_name || selectedArtist.username}
                  </p>
                )}
              </>
            )}
            {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("intent")}
                className="rounded border border-zinc-300 px-4 py-2 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAttributionNext}
                className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Form */}
        {step === "form" && (
          <form onSubmit={handleFormNext} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Image *</label>
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Artwork title"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Year *</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                min={1000}
                max={9999}
                placeholder="2024"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Medium *</label>
              <input
                type="text"
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                required
                placeholder="e.g. Oil on canvas"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Size *</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                required
                placeholder="e.g. 100 x 80 cm"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Story</label>
              <textarea
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ownership status *</label>
              <select
                value={ownershipStatus}
                onChange={(e) => setOwnershipStatus(e.target.value)}
                required
                className="w-full rounded border border-zinc-300 px-3 py-2"
              >
                {OWNERSHIP_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {(intent === "INVENTORY" || intent === "CURATED") && (
              <div>
                <label className="mb-1 block text-sm font-medium">{t("artwork.periodLabel")} *</label>
                <select
                  value={periodStatus}
                  onChange={(e) => setPeriodStatus(e.target.value as "past" | "current" | "future")}
                  required
                  className="w-full rounded border border-zinc-300 px-3 py-2"
                >
                  <option value="past">{t("artwork.periodPast")}</option>
                  <option value="current">{t("artwork.periodCurrent")}</option>
                  <option value="future">{t("artwork.periodFuture")}</option>
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Pricing mode *</label>
              <select
                value={pricingMode}
                onChange={(e) => setPricingMode(e.target.value as "fixed" | "inquire")}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              >
                {PRICING_MODES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {pricingMode === "fixed" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Currency</label>
                    <select
                      value={priceCurrency}
                      onChange={(e) => setPriceCurrency(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-3 py-2"
                    >
                      {PRICE_CURRENCIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Amount *</label>
                    <input
                      type="number"
                      value={priceAmount}
                      onChange={(e) => setPriceAmount(e.target.value)}
                      required={pricingMode === "fixed"}
                      min={0}
                      step="any"
                      placeholder="0"
                      className="w-full rounded border border-zinc-300 px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pricePublic"
                    checked={isPricePublic}
                    onChange={(e) => setIsPricePublic(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="pricePublic" className="text-sm">
                    Show price publicly
                  </label>
                </div>
              </>
            )}
            {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => (needsAttribution(intent) ? setStep("attribution") : setStep("intent"))}
                className="rounded border border-zinc-300 px-4 py-2 text-sm"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800"
              >
                Next (check duplicates)
              </button>
            </div>
          </form>
        )}

        {/* Step: Dedup */}
        {step === "dedup" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">Similar works found</p>
            {dedupLoading && <p className="text-sm text-zinc-500">Searching...</p>}
            {!dedupLoading && similarWorks.length > 0 && (
              <ul className="rounded border border-zinc-200 bg-white">
                {similarWorks.map((w) => (
                  <li key={w.id} className="border-b border-zinc-100 px-4 py-2 last:border-0">
                    <Link
                      href={`/artwork/${w.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-900 hover:underline"
                    >
                      {w.title ?? "Untitled"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!dedupLoading && similarWorks.length === 0 && (
              <p className="text-sm text-zinc-500">No similar works found.</p>
            )}
            {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="rounded border border-zinc-300 px-4 py-2 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {isSubmitting ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        )}
      </main>
    </AuthGate>
  );
}
