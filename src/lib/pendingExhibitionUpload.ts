/**
 * In-memory store for image files dropped on exhibition add page,
 * so we can pass them to single/bulk upload after navigation (same tab only).
 */

export type PendingExhibitionFiles = {
  exhibitionId: string;
  artistId?: string;
  artistName?: string;
  artistUsername?: string;
  externalName?: string;
  externalEmail?: string;
  files: File[];
};

let pending: PendingExhibitionFiles | null = null;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function isImageFile(f: File): boolean {
  return IMAGE_TYPES.includes(f.type);
}

export function setPendingExhibitionFiles(params: {
  exhibitionId: string;
  artistId?: string;
  artistName?: string;
  artistUsername?: string;
  externalName?: string;
  externalEmail?: string;
  files: File[];
}): void {
  const files = Array.from(params.files).filter(isImageFile);
  if (files.length === 0) return;
  pending = {
    exhibitionId: params.exhibitionId,
    artistId: params.artistId,
    artistName: params.artistName,
    artistUsername: params.artistUsername,
    externalName: params.externalName,
    externalEmail: params.externalEmail,
    files,
  };
}

/**
 * Returns and clears pending files if they match the given exhibition (and optionally artist/external).
 * Call once on upload/bulk page mount.
 */
export function getAndClearPendingExhibitionFiles(match: {
  exhibitionId: string;
  artistId?: string | null;
  externalName?: string | null;
}): PendingExhibitionFiles | null {
  const p = pending;
  pending = null;
  if (!p || p.exhibitionId !== match.exhibitionId) return null;
  if (match.artistId != null && p.artistId !== match.artistId) return null;
  if (match.externalName != null && (p.externalName ?? "") !== (match.externalName ?? "")) return null;
  return p;
}
