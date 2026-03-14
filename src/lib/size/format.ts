import type { HosuType } from "./hosu";
import { findHosuSize, findNearestHosu } from "./hosu";

export type ParsedSize = {
  widthCm: number;
  heightCm: number;
  hosuNumber?: number;
  hosuType?: HosuType;
};

export type SizeUnit = "cm" | "in";

export function cmToIn(cm: number): number {
  return cm / 2.54;
}

export function inToCm(inVal: number): number {
  return inVal * 2.54;
}

/** 파싱 결과 + 사용자 입력 단위. 표시 시 locale 변환에 사용 */
export type ParsedSizeWithUnit = { parsed: ParsedSize; unit: SizeUnit };

/** parseSize와 동일하되, 입력 문자열에서 감지한 단위(cm | in)를 함께 반환. 호수는 cm. */
export function parseSizeWithUnit(size: string): ParsedSizeWithUnit | null {
  const raw = size.trim();
  // 3) "W x H in" 패턴 먼저 (in이 명시된 경우)
  const inMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*in(?:ch(?:es)?)?)?/i);
  if (inMatch) {
    const wIn = parseFloat(inMatch[1]);
    const hIn = parseFloat(inMatch[2]);
    if (Number.isFinite(wIn) && Number.isFinite(hIn)) {
      return {
        parsed: { widthCm: wIn * 2.54, heightCm: hIn * 2.54 },
        unit: "in",
      };
    }
  }
  // 1) 호수 → cm
  const hosuMatch = raw.match(/(\d+)\s*([FPMScfmps])/);
  if (hosuMatch) {
    const num = parseInt(hosuMatch[1], 10);
    const type = hosuMatch[2].toUpperCase() as HosuType;
    const hosu = findHosuSize(num, type);
    if (hosu) {
      return {
        parsed: {
          widthCm: hosu.widthCm,
          heightCm: hosu.heightCm,
          hosuNumber: hosu.number,
          hosuType: hosu.type,
        },
        unit: "cm",
      };
    }
  }
  // 2) "W x H cm" 패턴
  const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*cm)?/i);
  if (cmMatch) {
    const w = parseFloat(cmMatch[1]);
    const h = parseFloat(cmMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { parsed: { widthCm: w, heightCm: h }, unit: "cm" };
    }
  }
  return null;
}

/**
 * 저장된 size + size_unit을 locale에 맞게 표시.
 * - size_unit === 'in': 참값은 inch. KO에서만 cm로 변환 표시, EN은 inch 그대로.
 * - size_unit === 'cm': 참값은 cm. EN에서만 inch로 변환 표시, KO는 cm 그대로.
 * - size_unit == null: 기존 동작(파싱 가능하면 locale에 따라 cm/in 결정).
 */
export function formatSizeForLocale(
  size: string | null | undefined,
  locale: string,
  sizeUnit?: SizeUnit | null
): string | null {
  if (!size || !size.trim()) return null;
  const parsed = parseSize(size);
  if (!parsed) return size.trim();

  const { widthCm, heightCm, hosuNumber, hosuType } = parsed;
  const isKo = locale.startsWith("ko");
  /** 사용자 입력에 호수가 없을 때, cm 기준 치수로 가장 가까운 호수(표시용). */
  const nearestHosu =
    hosuNumber != null && hosuType ? null : findNearestHosu(widthCm, heightCm);
  const hosuPrefix = (h: { number: number; type: HosuType }) =>
    isKo ? `약 ${h.number}${h.type} · ` : `~${h.number}${h.type} · `;

  if (sizeUnit === "in") {
    const wIn = cmToIn(widthCm);
    const hIn = cmToIn(heightCm);
    if (isKo) {
      const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
      if (hosuNumber != null && hosuType) return `${hosuNumber}${hosuType} · ${base}`;
      if (nearestHosu) return `${hosuPrefix(nearestHosu)}${base}`;
      return base;
    }
    const base = `${wIn.toFixed(1)} × ${hIn.toFixed(1)} in`;
    if (hosuNumber != null && hosuType) return `${hosuNumber}${hosuType} · ${base}`;
    if (nearestHosu) return `${hosuPrefix(nearestHosu)}${base}`;
    return base;
  }

  if (sizeUnit === "cm") {
    const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
    if (hosuNumber != null && hosuType) return `${hosuNumber}${hosuType} · ${base}`;
    if (nearestHosu && isKo) return `${hosuPrefix(nearestHosu)}${base}`;
    if (isKo) return base;
    const wIn = cmToIn(widthCm);
    const hIn = cmToIn(heightCm);
    const inBase = `${wIn.toFixed(1)} × ${hIn.toFixed(1)} in`;
    if (nearestHosu) return `${hosuPrefix(nearestHosu)}${inBase}`;
    return inBase;
  }

  // size_unit 없음: 기존 동작 (locale만 보고 출력)
  if (isKo) {
    const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
    if (hosuNumber != null && hosuType) return `${hosuNumber}${hosuType} · ${base}`;
    if (nearestHosu) return `${hosuPrefix(nearestHosu)}${base}`;
    return base;
  }
  const widthIn = cmToIn(widthCm);
  const heightIn = cmToIn(heightCm);
  const base = `${widthIn.toFixed(1)} × ${heightIn.toFixed(1)} in`;
  if (hosuNumber != null && hosuType) return `${hosuNumber}${hosuType} · ${base}`;
  if (nearestHosu) return `${hosuPrefix(nearestHosu)}${base}`;
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
