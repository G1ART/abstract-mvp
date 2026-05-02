"use client";

/**
 * Client-only PDF → PNG renderer for the CV import wizard's vision
 * fallback path. We deliberately keep this on the client so the
 * server doesn't need a `canvas` native dependency (which is a poor
 * fit for Vercel's serverless runtime).
 *
 * Flow (used by `CvImportWizard`):
 *  1. User uploads `resume.pdf`.
 *  2. Server runs pdf-parse. If it returns empty text, the route
 *     replies with `{visionFallback: true}`.
 *  3. The wizard calls `renderPdfPagesToPng(base64)` here, then
 *     re-POSTs to `/api/ai/cv-import` with `images: [...]` instead
 *     of `file`.
 *
 * Caps:
 *  - max 6 pages (token cost grows fast).
 *  - target 1240px wide JPEG-ish PNG (low-detail vision is enough for
 *    text legibility on a CV page).
 */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const lib = await import("pdfjs-dist");
    // pdfjs-dist v4 ships an ES-module worker. Next.js bundles it via
    // `new URL(..., import.meta.url)` which the framework rewrites into
    // an asset URL at build time. Falling back to a same-origin
    // worker keeps us off any CDN.
    if (typeof window !== "undefined") {
      const workerUrl = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return lib;
  })();
  return pdfjsPromise;
}

export type RenderedPage = {
  mime: "image/png";
  base64: string;
};

export async function renderPdfPagesToPng(
  base64: string,
  opts: { maxPages?: number; targetWidthPx?: number; signal?: AbortSignal } = {},
): Promise<{ pages: RenderedPage[]; totalPages: number }> {
  const maxPages = Math.max(1, Math.min(opts.maxPages ?? 6, 8));
  const targetWidthPx = Math.max(640, Math.min(opts.targetWidthPx ?? 1240, 2000));

  const lib = await loadPdfjs();
  const data = base64ToUint8Array(base64);
  const doc = await lib.getDocument({ data }).promise;
  const totalPages = doc.numPages;
  const pageLimit = Math.min(maxPages, totalPages);

  const pages: RenderedPage[] = [];
  for (let i = 1; i <= pageLimit; i += 1) {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    // Pick a scale that lands close to the target render width; cap
    // upper end so a wide page doesn't blow past the 3MB image cap.
    const scale = Math.max(
      0.8,
      Math.min(targetWidthPx / baseViewport.width, 2.5),
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    await page.render({
      canvasContext: ctx,
      viewport,
      // Newer pdfjs requires an explicit `canvas` field in some builds;
      // we cast through unknown so the call works across v4 minor
      // versions without us hard-pinning a private type.
    } as unknown as Parameters<typeof page.render>[0]).promise;

    // JPEG would be smaller but PNG keeps text edges crisp for vision.
    // We still cap by re-encoding to JPEG when the PNG goes past 2.5MB.
    let dataUrl = canvas.toDataURL("image/png");
    let comma = dataUrl.indexOf(",");
    let b64 = dataUrl.slice(comma + 1);
    let mime: "image/png" | "image/jpeg" = "image/png";
    if (b64.length > 2_500_000) {
      dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      comma = dataUrl.indexOf(",");
      b64 = dataUrl.slice(comma + 1);
      mime = "image/jpeg";
    }
    pages.push({ mime: mime as "image/png", base64: b64 });
    // Free up canvas memory eagerly (Safari is quite tight on this).
    canvas.width = 0;
    canvas.height = 0;
  }

  await doc.cleanup();
  await doc.destroy();

  return { pages, totalPages };
}

/* ----------------------------- file → image ----------------------------- */

/**
 * Browser-side base64 of a File (image/jpg/png/webp). Mirrors the
 * encoder in `CvImportWizard` so we don't pull `arrayBufferToBase64`
 * out of that file just to share a 6-line helper.
 */
export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
