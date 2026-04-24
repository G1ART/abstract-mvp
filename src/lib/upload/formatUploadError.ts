import { UPLOAD_MAX_IMAGE_MB_LABEL } from "./limits";

type T = (key: string) => string;

function norm(msg: string): string {
  return msg.toLowerCase();
}

/** Classify common browser / Supabase storage failure strings. */
export function classifyUploadFailureMessage(message: string): "oversized" | "payload" | "network" | "auth" | "unknown" {
  const m = norm(message);
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("jwt")) return "auth";
  if (m.includes("413") || m.includes("payload too large") || m.includes("request entity too large")) return "payload";
  if (
    m.includes("too large") ||
    m.includes("exceeds") ||
    (m.includes("maximum") && m.includes("size")) ||
    m.includes("file size") ||
    m.includes("object too large")
  ) {
    return "oversized";
  }
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed") || m.includes("timeout")) {
    return "network";
  }
  return "unknown";
}

/** User-facing sentence for a single failed file in bulk upload. */
export function formatBulkFileUploadFailure(fileName: string, err: unknown, t: T): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const kind = classifyUploadFailureMessage(raw);
  const safeName = fileName || t("bulk.uploadFailedUnnamedFile");
  switch (kind) {
    case "oversized":
    case "payload":
      return t("bulk.uploadFailedFileOversized").replace("{name}", safeName).replace("{maxMb}", String(UPLOAD_MAX_IMAGE_MB_LABEL));
    case "network":
      return t("bulk.uploadFailedFileNetwork").replace("{name}", safeName);
    case "auth":
      return t("bulk.uploadFailedFileAuth").replace("{name}", safeName);
    default:
      return t("bulk.uploadFailedFileGeneric").replace("{name}", safeName);
  }
}

/** Single-upload form: short line for storage rejection. */
export function formatSingleUploadFailure(err: unknown, t: T): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const kind = classifyUploadFailureMessage(raw);
  switch (kind) {
    case "oversized":
    case "payload":
      return t("upload.failedOversized").replace("{maxMb}", String(UPLOAD_MAX_IMAGE_MB_LABEL));
    case "network":
      return t("upload.failedNetwork");
    case "auth":
      return t("upload.failedAuth");
    default:
      return t("upload.failedGeneric");
  }
}
