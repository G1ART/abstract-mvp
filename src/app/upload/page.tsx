"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/supabase/auth";
import {
  attachArtworkImage,
  createArtwork,
  deleteArtwork,
  type CreateArtworkPayload,
} from "@/lib/supabase/artworks";
import { removeStorageFile, uploadArtworkImage } from "@/lib/supabase/storage";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";

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

export default function UploadPage() {
  const router = useRouter();
  const { t } = useT();
  const [userId, setUserId] = useState<string | null>(null);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (!image) {
      setError("Please select an image");
      return;
    }
    if (!userId) {
      setError("Not authenticated");
      return;
    }

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1000 || yearNum > 9999) {
      setError("Please enter a valid year (4 digits)");
      return;
    }

    const payload: CreateArtworkPayload = {
      title: title.trim(),
      year: yearNum,
      medium: medium.trim(),
      size: size.trim(),
      story: story.trim() || null,
      ownership_status: ownershipStatus,
      pricing_mode: pricingMode,
      is_price_public: pricingMode === "fixed" ? isPricePublic : false,
      price_input_amount:
        pricingMode === "fixed" && priceAmount
          ? parseFloat(priceAmount)
          : undefined,
      price_input_currency:
        pricingMode === "fixed" ? priceCurrency : undefined,
    };

    if (pricingMode === "fixed" && (!priceAmount || parseFloat(priceAmount) <= 0)) {
      setError("Please enter a valid price");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: artworkId, error: createErr } = await createArtwork(payload);
      if (createErr) {
        setError(
          createErr instanceof Error ? createErr.message : "Failed to create artwork"
        );
        setIsSubmitting(false);
        return;
      }
      if (!artworkId) {
        setError("Failed to create artwork");
        setIsSubmitting(false);
        return;
      }

      let storagePath: string | null = null;
      try {
        storagePath = await uploadArtworkImage(image, userId);
      } catch (uploadErr) {
        await deleteArtwork(artworkId);
        setError(
          uploadErr instanceof Error ? uploadErr.message : "Failed to upload image"
        );
        setIsSubmitting(false);
        return;
      }

      const { error: attachErr } = await attachArtworkImage(artworkId, storagePath);
      if (attachErr) {
        await removeStorageFile(storagePath);
        await deleteArtwork(artworkId);
        setError(
          attachErr instanceof Error ? attachErr.message : "Failed to attach image"
        );
        setIsSubmitting(false);
        return;
      }

      const { getMyProfile } = await import("@/lib/supabase/profiles");
      const { data: profile } = await getMyProfile();
      const username = (profile as { username?: string | null } | null)?.username?.trim();
      if (username) {
        router.push(`/u/${username}`);
      } else {
        router.push(`/artwork/${artworkId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Upload artwork</h1>
          <Link
            href="/upload/bulk"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            {t("bulk.linkToBulk")} →
          </Link>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="image" className="mb-1 block text-sm font-medium">
              Image *
            </label>
            <input
              id="image"
              type="file"
              accept="image/*"
              required
              disabled={isSubmitting}
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="Artwork title"
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="year" className="mb-1 block text-sm font-medium">
              Year *
            </label>
            <input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              disabled={isSubmitting}
              min={1000}
              max={9999}
              placeholder="2024"
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="medium" className="mb-1 block text-sm font-medium">
              Medium *
            </label>
            <input
              id="medium"
              type="text"
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="e.g. Oil on canvas"
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="size" className="mb-1 block text-sm font-medium">
              Size *
            </label>
            <input
              id="size"
              type="text"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="e.g. 100 x 80 cm"
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="story" className="mb-1 block text-sm font-medium">
              Story
            </label>
            <textarea
              id="story"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              disabled={isSubmitting}
              placeholder="Optional description"
              rows={3}
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="ownership" className="mb-1 block text-sm font-medium">
              Ownership status *
            </label>
            <select
              id="ownership"
              value={ownershipStatus}
              onChange={(e) => setOwnershipStatus(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
            >
              {OWNERSHIP_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pricing" className="mb-1 block text-sm font-medium">
              Pricing mode *
            </label>
            <select
              id="pricing"
              value={pricingMode}
              onChange={(e) =>
                setPricingMode(e.target.value as "fixed" | "inquire")
              }
              disabled={isSubmitting}
              className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
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
                  <label
                    htmlFor="currency"
                    className="mb-1 block text-sm font-medium"
                  >
                    Currency
                  </label>
                  <select
                    id="currency"
                    value={priceCurrency}
                    onChange={(e) => setPriceCurrency(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
                  >
                    {PRICE_CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="price"
                    className="mb-1 block text-sm font-medium"
                  >
                    Amount *
                  </label>
                  <input
                    id="price"
                    type="number"
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(e.target.value)}
                    required={pricingMode === "fixed"}
                    disabled={isSubmitting}
                    min={0}
                    step="any"
                    placeholder="0"
                    className="w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="pricePublic"
                  type="checkbox"
                  checked={isPricePublic}
                  onChange={(e) => setIsPricePublic(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded disabled:opacity-50"
                />
                <label htmlFor="pricePublic" className="text-sm">
                  Show price publicly
                </label>
              </div>
            </>
          )}

          {error && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {isSubmitting ? "Uploading..." : "Upload"}
          </button>
        </form>
      </main>
    </AuthGate>
  );
}
