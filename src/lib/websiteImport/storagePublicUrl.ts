/** Build public object URL for artworks bucket (bucket is world-readable). */
export function publicArtworkObjectUrl(storagePath: string): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const base = raw.replace(/\/+$/, "");
  const path = storagePath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/artworks/${encodeURI(path)}`;
}
