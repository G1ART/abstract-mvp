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

/** Upload exhibition media image. Path: exhibition-media/{exhibitionId}/{uuid}-{name}. Uses same bucket as artworks. */
export async function uploadExhibitionMedia(
  file: File,
  exhibitionId: string
): Promise<string> {
  const safeName = sanitizeFilename(file.name);
  const path = `exhibition-media/${exhibitionId}/${crypto.randomUUID()}-${safeName}`;
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

// ─── P1-0 Profile media (avatar / cover / artist statement hero) ─────────
//
// Reuses the `artworks` bucket. The existing RLS policy
// `can_manage_artworks_storage_path()` allows write/delete when the path
// starts with `{auth.uid()}/...`, so we keep paths under
// `{userId}/profile/{kind}/{uuid}-{safeName}` and don't need a new bucket
// or new RLS migration.

const PROFILE_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Per-kind size + mime limits. Keep avatars tighter (5 MB) since they ship inline. */
export const PROFILE_MEDIA_LIMITS = {
  avatar: { maxBytes: 5 * 1024 * 1024, mimes: PROFILE_IMAGE_MIMES },
  cover: { maxBytes: 10 * 1024 * 1024, mimes: PROFILE_IMAGE_MIMES },
  statement: { maxBytes: 10 * 1024 * 1024, mimes: PROFILE_IMAGE_MIMES },
} as const;

export type ProfileMediaKind = keyof typeof PROFILE_MEDIA_LIMITS;

export class ProfileMediaValidationError extends Error {
  readonly code: "size" | "mime" | "kind" | "user";
  readonly limitBytes?: number;
  constructor(code: "size" | "mime" | "kind" | "user", message: string, limitBytes?: number) {
    super(message);
    this.code = code;
    this.limitBytes = limitBytes;
    this.name = "ProfileMediaValidationError";
  }
}

/**
 * Upload a profile media file (avatar, cover, or statement hero).
 *
 * Throws `ProfileMediaValidationError` on bad mime/size/kind, or the raw
 * Supabase error on storage failure. On success returns the storage path
 * (e.g. `4f8c…/profile/avatar/abcd-1234-photo.jpg`) which callers should
 * persist via `updateMyProfileBasePatch({ avatar_url, cover_image_url, ... })`.
 */
export async function uploadProfileMedia(
  file: File,
  kind: ProfileMediaKind,
  userId: string
): Promise<string> {
  if (!userId) {
    throw new ProfileMediaValidationError("user", "userId is required");
  }
  const limits = PROFILE_MEDIA_LIMITS[kind];
  if (!limits) {
    throw new ProfileMediaValidationError("kind", `Unknown profile media kind: ${String(kind)}`);
  }
  if (!limits.mimes.has(file.type)) {
    throw new ProfileMediaValidationError(
      "mime",
      `Unsupported image type (${file.type || "unknown"}). Use JPEG, PNG, or WebP.`
    );
  }
  if (file.size > limits.maxBytes) {
    throw new ProfileMediaValidationError(
      "size",
      `File is too large (limit ${(limits.maxBytes / (1024 * 1024)).toFixed(0)} MB).`,
      limits.maxBytes
    );
  }

  const safeName = sanitizeFilename(file.name);
  const path = `${userId}/profile/${kind}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

/**
 * Best-effort delete of a previously uploaded profile media path. Idempotent —
 * silently ignores "not found" / RLS errors so the caller's UI flow doesn't
 * stall when the source path was already cleared. Returns true when the
 * Supabase call succeeded (no error), false otherwise.
 */
export async function removeProfileMedia(path: string | null | undefined): Promise<boolean> {
  if (!path || !path.trim()) return true;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return !error;
}
