import { supabase } from "./client";

const BUCKET = "artworks";

function sanitizeFilename(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.includes(".")
    ? name.slice(0, name.lastIndexOf("."))
    : name;
  const sanitized = base
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return (sanitized || "image") + ext;
}

export async function uploadArtworkImage(
  file: File,
  userId: string
): Promise<string> {
  const safeName = sanitizeFilename(file.name);
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeStorageFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function removeStorageFiles(paths: string[]): Promise<{ error: unknown }> {
  if (paths.length === 0) return { error: null };
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  return { error };
}

export function getPublicImageUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
