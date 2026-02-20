"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  getExhibitionById,
  listWorksInExhibition,
  removeWorkFromExhibition,
  type ExhibitionRow,
  type ExhibitionWorkRow,
} from "@/lib/supabase/exhibitions";
import { getArtworksByIds, getArtworkImageUrl, type ArtworkWithLikes } from "@/lib/supabase/artworks";
import { formatSupabaseError, logSupabaseError } from "@/lib/supabase/errors";

const STATUS_LABELS: Record<string, string> = {
  planned: "exhibition.statusPlanned",
  live: "exhibition.statusLive",
  ended: "exhibition.statusEnded",
};

export default function ExhibitionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useT();
  const id = typeof params.id === "string" ? params.id : "";
  const [exhibition, setExhibition] = useState<ExhibitionRow | null>(null);
  const [works, setWorks] = useState<ExhibitionWorkRow[]>([]);
  const [artworks, setArtworks] = useState<ArtworkWithLikes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [exRes, worksRes] = await Promise.all([
      getExhibitionById(id),
      listWorksInExhibition(id),
    ]);
    if (exRes.error || !exRes.data) {
      setLoading(false);
      setError(exRes.error ? (exRes.error instanceof Error ? exRes.error.message : "Not found") : "Not found");
      return;
    }
    setExhibition(exRes.data);
    setWorks(worksRes.data ?? []);
    if ((worksRes.data ?? []).length === 0) {
      setArtworks([]);
      setLoading(false);
      return;
    }
    const { data: artList } = await getArtworksByIds(worksRes.data!.map((w) => w.work_id));
    setArtworks(artList ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRemove(workId: string) {
    if (!id) return;
    setRemovingId(workId);
    const { error: err } = await removeWorkFromExhibition(id, workId);
    setRemovingId(null);
    if (err) {
      logSupabaseError("removeWorkFromExhibition", err);
      setError(formatSupabaseError(err, "Failed to remove"));
      return;
    }
    setError(null);
    await fetchData();
  }

  if (!id) {
    return (
      <AuthGate>
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-zinc-600">Invalid exhibition.</p>
        </main>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href="/my?tab=exhibitions" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← {t("common.backTo")} {t("nav.myProfile")}
          </Link>
          <span className="text-zinc-400">|</span>
          <Link href="/my/exhibitions" className="text-sm text-zinc-600 hover:text-zinc-900">
            {t("exhibition.myExhibitions")}
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">{t("common.loading")}</p>
        ) : !exhibition ? (
          <p className="text-zinc-600">{error ?? "Exhibition not found."}</p>
        ) : (
          <>
            <header className="mb-8">
              <h1 className="text-xl font-semibold text-zinc-900">{exhibition.title}</h1>
              <p className="mt-1 text-sm text-zinc-500">
                {exhibition.start_date && exhibition.end_date
                  ? `${exhibition.start_date} – ${exhibition.end_date}`
                  : exhibition.start_date ?? ""}
                {exhibition.host_name && ` · ${exhibition.host_name}`}
                {" · "}
                {t(STATUS_LABELS[exhibition.status] ?? "exhibition.statusPlanned")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/my/exhibitions/${id}/edit`}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {t("common.edit")}
                </Link>
                <Link
                  href={`/my/exhibitions/${id}/add`}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("exhibition.addWork")}
                </Link>
              </div>
            </header>

            <h2 className="mb-3 text-sm font-medium text-zinc-700">{t("exhibition.works")}</h2>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

            {artworks.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-8 text-center">
                <p className="mb-4 text-sm text-zinc-600">{t("exhibition.noWorks")}</p>
                <Link
                  href={`/my/exhibitions/${id}/add`}
                  className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {t("exhibition.addWork")}
                </Link>
              </div>
            ) : (
              <ul className="max-w-2xl space-y-6">
                {artworks.map((art) => {
                  const img = art.artwork_images?.[0]?.storage_path;
                  return (
                    <li key={art.id} className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
                      <Link href={`/artwork/${art.id}`} className="block">
                        {img ? (
                          <div className="relative aspect-[4/3] bg-zinc-100 sm:aspect-[3/2]">
                            <Image
                              src={getArtworkImageUrl(img, "thumb")}
                              alt={art.title ?? ""}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, 672px"
                            />
                          </div>
                        ) : (
                          <div className="aspect-[4/3] flex items-center justify-center bg-zinc-100 text-sm text-zinc-400 sm:aspect-[3/2]">
                            No image
                          </div>
                        )}
                        <div className="p-4">
                          <p className="font-semibold text-zinc-900">{art.title ?? "Untitled"}</p>
                          <p className="mt-1 text-sm text-zinc-500">{art.year ?? ""}</p>
                        </div>
                      </Link>
                      <div className="border-t border-zinc-100 px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemove(art.id)}
                          disabled={removingId === art.id}
                          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {removingId === art.id ? "..." : t("exhibition.removeFromExhibition")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </AuthGate>
  );
}
