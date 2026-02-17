"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import {
  type ArtworkWithLikes,
  canEditArtwork,
  getArtworkById,
  getMyClaim,
  updateArtwork,
  type UpdateArtworkPayload,
} from "@/lib/supabase/artworks";
import { searchPeople } from "@/lib/supabase/artists";
import {
  createClaimForExistingArtist,
  createExternalArtist,
  createExternalArtistAndClaim,
  updateClaim,
} from "@/lib/provenance/rpc";
import { sendMagicLink } from "@/lib/supabase/auth";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";

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

function EditArtworkContent() {
  const params = useParams();
  const router = useRouter();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";

  const [artwork, setArtwork] = useState<ArtworkWithLikes | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteSentToast, setInviteSentToast] = useState(false);

  // Base form
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

  // Provenance
  const [claimType, setClaimType] = useState<IntentType>("CREATED");
  const [artistSearch, setArtistSearch] = useState("");
  const [artistResults, setArtistResults] = useState<ArtistOption[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [useExternalArtist, setUseExternalArtist] = useState(false);
  const [externalArtistName, setExternalArtistName] = useState("");
  const [externalArtistEmail, setExternalArtistEmail] = useState("");

  const myClaim = artwork && userId ? getMyClaim(artwork, userId) : null;
  const needsArtistLink = claimType !== "CREATED";

  const doSearchArtists = useCallback(async () => {
    const q = artistSearch.trim();
    if (!q || q.length < 2) {
      setArtistResults([]);
      return;
    }
    setSearching(true);
    const { data } = await searchPeople({ q, roles: ["artist"], limit: 10 });
    setArtistResults(
      (data ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
      }))
    );
    setSearching(false);
  }, [artistSearch]);

  useEffect(() => {
    const tm = setTimeout(doSearchArtists, 300);
    return () => clearTimeout(tm);
  }, [artistSearch, doSearchArtists]);

  useEffect(() => {
    if (!id) return;
    getArtworkById(id).then(({ data, error: err }) => {
      setLoading(false);
      if (err) {
        setError(
          (err as { message?: string })?.message ?? "Failed to load artwork"
        );
        return;
      }
      const a = data as ArtworkWithLikes | null;
      setArtwork(a);
      if (a) {
        setTitle(a.title ?? "");
        setYear(String(a.year ?? ""));
        setMedium(a.medium ?? "");
        setSize(a.size ?? "");
        setStory(a.story ?? "");
        setOwnershipStatus(a.ownership_status ?? "available");
        setPricingMode((a.pricing_mode as "fixed" | "inquire") ?? "fixed");
        setPriceCurrency(a.price_input_currency ?? "USD");
        setPriceAmount(
          a.price_input_amount != null ? String(a.price_input_amount) : ""
        );
        setIsPricePublic(a.is_price_public ?? false);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!artwork || !userId) return;
    const claim = getMyClaim(artwork, userId);
    if (claim) {
      setClaimType(claim.claim_type as IntentType);
      if (claim.external_artist_id && claim.external_artists) {
        setUseExternalArtist(true);
        setExternalArtistName(claim.external_artists.display_name ?? "");
        setExternalArtistEmail(claim.external_artists.invite_email ?? "");
      }
    } else if (artwork.artist_id === userId) {
      setClaimType("CREATED");
    }
    const needsArtist = claim?.claim_type !== "CREATED" || artwork.artist_id !== userId;
    if (artwork.profiles && needsArtist && !claim?.external_artist_id) {
      setSelectedArtist({
        id: artwork.artist_id,
        username: artwork.profiles.username ?? null,
        display_name: artwork.profiles.display_name ?? null,
      });
    }
  }, [artwork, userId]);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (artwork && userId && !canEditArtwork(artwork, userId)) {
      router.replace(`/artwork/${id}`);
    }
  }, [artwork, userId, id, router]);


  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || !userId || !artwork) return;
    setError(null);

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1000 || yearNum > 9999) {
      setError("Please enter a valid year (4 digits)");
      return;
    }
    if (needsArtistLink) {
      if (useExternalArtist) {
        if (!externalArtistName.trim()) {
          setError("Please enter the artist name");
          return;
        }
      } else if (!selectedArtist) {
        setError("Please select the artist who created this work");
        return;
      }
    }
    if (pricingMode === "fixed" && (!priceAmount || parseFloat(priceAmount) <= 0)) {
      setError("Please enter a valid price");
      return;
    }

    setSaving(true);

    let inviteSent = false;
    const payload: UpdateArtworkPayload = {
      title: title.trim() || null,
      year: yearNum,
      medium: medium.trim() || null,
      size: size.trim() || null,
      story: story.trim() || null,
      ownership_status: ownershipStatus,
      pricing_mode: pricingMode,
      is_price_public: pricingMode === "fixed" ? isPricePublic : false,
      price_input_amount:
        pricingMode === "fixed" && priceAmount
          ? parseFloat(priceAmount)
          : null,
      price_input_currency: pricingMode === "fixed" ? priceCurrency : null,
    };

    const { error: updateErr } = await updateArtwork(id, payload);
    if (updateErr) {
      setError(
        (updateErr as { message?: string })?.message ?? "Failed to save artwork"
      );
      setSaving(false);
      return;
    }

    if (claimType === "CREATED") {
      const artistProfileId = userId;
      if (myClaim?.id) {
        const { error: claimErr } = await updateClaim(myClaim.id, {
          claim_type: claimType,
          artist_profile_id: artistProfileId,
          external_artist_id: null,
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to update provenance"
          );
          setSaving(false);
          return;
        }
      } else {
        const { error: claimErr } = await createClaimForExistingArtist({
          artistProfileId,
          claimType,
          workId: id,
          visibility: "public",
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to add provenance"
          );
          setSaving(false);
          return;
        }
      }
    } else if (useExternalArtist) {
      if (myClaim?.id) {
        const { data: extId, error: extErr } = await createExternalArtist({
          displayName: externalArtistName.trim(),
          inviteEmail: externalArtistEmail.trim() || null,
        });
        if (extErr || !extId) {
          setError(
            (extErr as { message?: string })?.message ?? "Failed to add artist"
          );
          setSaving(false);
          return;
        }
        const { error: claimErr } = await updateClaim(myClaim.id, {
          claim_type: claimType,
          artist_profile_id: null,
          external_artist_id: extId,
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to update provenance"
          );
          setSaving(false);
          return;
        }
        if (externalArtistEmail?.trim()) {
          const { error: inviteErr } = await sendMagicLink(externalArtistEmail.trim());
          inviteSent = !inviteErr;
        }
      } else {
        const { error: claimErr } = await createExternalArtistAndClaim({
          displayName: externalArtistName.trim(),
          inviteEmail: externalArtistEmail.trim() || null,
          claimType,
          workId: id,
          visibility: "public",
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to add provenance"
          );
          setSaving(false);
          return;
        }
        if (externalArtistEmail?.trim()) {
          const { error: inviteErr } = await sendMagicLink(externalArtistEmail.trim());
          inviteSent = !inviteErr;
        }
      }
    } else {
      const artistProfileId = selectedArtist!.id;
      if (myClaim?.id) {
        const { error: claimErr } = await updateClaim(myClaim.id, {
          claim_type: claimType,
          artist_profile_id: artistProfileId,
          external_artist_id: null,
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to update provenance"
          );
          setSaving(false);
          return;
        }
      } else {
        const { error: claimErr } = await createClaimForExistingArtist({
          artistProfileId,
          claimType,
          workId: id,
          visibility: "public",
        });
        if (claimErr) {
          setError(
            (claimErr as { message?: string })?.message ?? "Failed to add provenance"
          );
          setSaving(false);
          return;
        }
      }
    }

    if (inviteSent) {
      setInviteSentToast(true);
      setTimeout(() => router.push(`/artwork/${id}`), 2000);
    } else {
      router.push(`/artwork/${id}`);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-zinc-600">{t("common.loading")}</p>
      </div>
    );
  }

  if (error && !artwork) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{error}</p>
        <Link href={`/artwork/${id}`} className="mt-4 inline-block text-sm text-zinc-600 hover:text-zinc-900">
          ← Back to artwork
        </Link>
      </div>
    );
  }

  if (!artwork) {
    return null;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      {inviteSentToast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {t("upload.inviteSent")}
        </div>
      )}
      <Link
        href={`/artwork/${id}`}
        className="mb-6 inline-block text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Back to artwork
      </Link>
      <h1 className="mb-6 text-xl font-semibold">{t("artwork.editTitle")}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
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
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
          <h2 className="mb-2 font-medium text-zinc-900">{t("artwork.provenanceTitle")}</h2>
          <p className="mb-4 text-sm text-zinc-600">{t("artwork.provenanceHint")}</p>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">{t("artwork.claimType")}</label>
              <div className="grid gap-2">
                {INTENTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setClaimType(opt.value)}
                    className={`w-full rounded-lg border px-4 py-2 text-left text-sm font-medium ${
                      claimType === opt.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {needsArtistLink && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium">{t("artwork.linkArtist")}</label>
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
                    {useExternalArtist
                      ? t("artwork.searchArtist")
                      : t("artwork.artistNotOnPlatform")}
                  </button>
                </div>
                {useExternalArtist ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={externalArtistName}
                      onChange={(e) => setExternalArtistName(e.target.value)}
                      placeholder={t("artwork.externalArtistNamePlaceholder")}
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="email"
                      value={externalArtistEmail}
                      onChange={(e) => setExternalArtistEmail(e.target.value)}
                      placeholder={t("artwork.externalArtistEmailPlaceholder")}
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-zinc-500">
                      {t("artwork.externalArtistEmailHint")}
                    </p>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={artistSearch}
                      onChange={(e) => setArtistSearch(e.target.value)}
                      placeholder="Name or username"
                      className="mb-2 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                    />
                    {searching && <p className="text-sm text-zinc-500">Searching...</p>}
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
                      <p className="mt-2 text-sm text-zinc-600">
                        Selected: {selectedArtist.display_name || selectedArtist.username}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex gap-3">
          <Link
            href={`/artwork/${id}`}
            className="rounded border border-zinc-300 px-4 py-2 text-sm"
          >
            {t("common.cancel")}
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>
    </main>
  );
}

export default function EditArtworkPage() {
  return (
    <AuthGate>
      <EditArtworkContent />
    </AuthGate>
  );
}
