import type { HosuType } from "./hosu";
import { findHosuSize } from "./hosu";

export type ParsedSize = {
  widthCm: number;
  heightCm: number;
  hosuNumber?: number;
  hosuType?: HosuType;
};

export function cmToIn(cm: number): number {
  return cm / 2.54;
}

export function formatSizeForLocale(size: string | null | undefined, locale: string): string | null {
  if (!size || !size.trim()) return null;
  const parsed = parseSize(size);
  if (!parsed) return size.trim();

  const { widthCm, heightCm, hosuNumber, hosuType } = parsed;
  const isKo = locale.startsWith("ko");
  if (isKo) {
    const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
    if (hosuNumber != null && hosuType) {
      return `${hosuNumber}${hosuType} · ${base}`;
    }
    return base;
  }
  const widthIn = cmToIn(widthCm);
  const heightIn = cmToIn(heightCm);
  const base = `${widthIn.toFixed(1)} × ${heightIn.toFixed(1)} in`;
  if (hosuNumber != null && hosuType) {
    return `${hosuNumber}${hosuType} · ${base}`;
  }
  return base;
}

export function parseSize(size: string): ParsedSize | null {
  const raw = size.trim();

  // 1) 호수 패턴: "30F" 또는 "30F (90.9 x 72.7 cm)"
  const hosuMatch = raw.match(/(\d+)\s*([FPMScfmps])/);
  if (hosuMatch) {
    const num = parseInt(hosuMatch[1], 10);
    const type = hosuMatch[2].toUpperCase() as HosuType;
    const hosu = findHosuSize(num, type);
    if (hosu) {
      return {
        widthCm: hosu.widthCm,
        heightCm: hosu.heightCm,
        hosuNumber: hosu.number,
        hosuType: hosu.type,
      };
    }
  }

  // 2) "W x H cm" 패턴
  const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*cm)?/i);
  if (cmMatch) {
    const w = parseFloat(cmMatch[1]);
    const h = parseFloat(cmMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { widthCm: w, heightCm: h };
    }
  }

  // 3) "W x H in" 패턴
  const inMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*in(?:ch(?:es)?)?)?/i);
  if (inMatch) {
    const wIn = parseFloat(inMatch[1]);
    const hIn = parseFloat(inMatch[2]);
    if (Number.isFinite(wIn) && Number.isFinite(hIn)) {
      const w = wIn * 2.54;
      const h = hIn * 2.54;
      return { widthCm: w, heightCm: h };
    }
  }

  return null;
}
