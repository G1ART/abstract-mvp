"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useT } from "@/lib/i18n/useT";
import {
  PROFILE_MEDIA_LIMITS,
  ProfileMediaValidationError,
  removeProfileMedia,
  uploadProfileMedia,
  type ProfileMediaKind,
} from "@/lib/supabase/storage";
import { getArtworkImageUrl } from "@/lib/supabase/artworks";

type Props = {
  /** "avatar" | "cover" | "statement" — drives mime/size limits + storage subpath */
  kind: ProfileMediaKind;
  /** Current storage path (or empty/null if none). Storage path, not URL. */
  value: string | null | undefined;
  /** Called with the new storage path on successful upload, or null when the user clears the image. */
  onChange: (nextPath: string | null) => Promise<void> | void;
  /** Authenticated user id — must match auth.uid() for RLS. */
  userId: string;
  /** Visible label / aria-label for the uploader. */
  label: string;
  /** Helper text displayed under the picker. */
  hint?: string;
  /** Preview aspect ratio. cover bands are wide; avatars are square. */
  shape?: "square" | "wide";
  /** When true the remove button is hidden (e.g. avatar fallback exists upstream). */
  hideRemove?: boolean;
};

const SHAPE_CLASSES: Record<"square" | "wide", { box: string; img: string }> = {
  square: { box: "h-24 w-24 rounded-full", img: "h-full w-full object-cover" },
  wide: {
    box: "aspect-[3/1] w-full max-w-md rounded-lg",
    img: "h-full w-full object-cover",
  },
};

function resolvePreviewUrl(path: string | null | undefined): string | null {
  if (!path || !path.trim()) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
  return getArtworkImageUrl(path, "medium");
}

/**
 * Uploader for profile media (avatar / cover / statement hero).
 *
 * Owns its own busy + error state but never persists the path itself — the
 * parent decides where the storage path lands (avatar_url, cover_image_url,
 * artist_statement_hero_image_url). The uploader does best-effort cleanup of
 * the previous path on replace + clear.
 */
export function ProfileMediaUploader({
  kind,
  value,
  onChange,
  userId,
  label,
  hint,
  shape = "square",
  hideRemove,
}: Props) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith("blob:")) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  const previewUrl = localPreview ?? resolvePreviewUrl(value);

  const onPick = useCallback(
    async (file: File) => {
      setErr(null);
      const objectUrl = URL.createObjectURL(file);
      setLocalPreview(objectUrl);
      setBusy(true);
      try {
        const nextPath = await uploadProfileMedia(file, kind, userId);
        const previousPath = value ?? null;
        await onChange(nextPath);
        if (previousPath && previousPath !== nextPath) {
          await removeProfileMedia(previousPath);
        }
      } catch (e) {
        if (e instanceof ProfileMediaValidationError) {
          if (e.code === "size") {
            setErr(t("profile.media.errorSize").replace("{mb}", String(Math.round(PROFILE_MEDIA_LIMITS[kind].maxBytes / (1024 * 1024)))));
          } else if (e.code === "mime") {
            setErr(t("profile.media.errorMime"));
          } else {
            setErr(e.message);
          }
        } else {
          setErr(t("profile.media.errorGeneric"));
          console.error("[profile media] upload failed", e);
        }
        URL.revokeObjectURL(objectUrl);
        setLocalPreview(null);
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [kind, userId, value, onChange, t]
  );

  const onRemove = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const previousPath = value ?? null;
      await onChange(null);
      if (previousPath) await removeProfileMedia(previousPath);
      setLocalPreview(null);
    } catch (e) {
      setErr(t("profile.media.errorGeneric"));
      console.error("[profile media] remove failed", e);
    } finally {
      setBusy(false);
    }
  }, [value, onChange, t]);

  const shapeClasses = SHAPE_CLASSES[shape];
  const accept = "image/jpeg,image/png,image/webp";

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-zinc-800">{label}</span>
      <div className="flex items-start gap-3">
        <div
          className={`overflow-hidden border border-zinc-200 bg-zinc-100 ${shapeClasses.box}`}
          aria-hidden={!previewUrl}
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt=""
              width={shape === "square" ? 96 : 480}
              height={shape === "square" ? 96 : 160}
              sizes={shape === "square" ? "96px" : "(max-width: 480px) 100vw, 480px"}
              className={shapeClasses.img}
              unoptimized={previewUrl.startsWith("blob:")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              {t("profile.media.noImage")}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={busy}
            aria-label={label}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:cursor-pointer file:rounded file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-zinc-800 file:hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          {!hideRemove && previewUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="self-start text-xs font-medium text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50"
            >
              {t("profile.media.remove")}
            </button>
          )}
          {hint && <p className="text-xs text-zinc-500">{hint}</p>}
          {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
          {busy && <p className="text-xs text-zinc-500">{t("profile.media.uploading")}</p>}
        </div>
      </div>
    </div>
  );
}
