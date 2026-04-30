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
export type ParsedSizeWithUnit = { parsed: ParsedSize; unit: SizeUnit | null };

/**
 * parseSize와 동일하되, 입력 문자열에서 감지한 단위를 함께 반환.
 * unit은 suffix가 명시적으로 존재할 때만 설정됨:
 * - "20 x 30 in" / "24 x 18 inches" → unit: "in"
 * - "50 x 40 cm" / "100×80cm" → unit: "cm"
 * - "30F" → unit: "cm" (호수는 항상 cm)
 * - "100 x 80" (suffix 없음) → unit: null (unitless)
 */
export function parseSizeWithUnit(size: string): ParsedSizeWithUnit | null {
  const raw = size.trim();

  // 1) 호수 → cm (항상 cm)
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

  // 2) "W x H in" / "W x H inches" — explicit inch suffix required
  const inMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s+in(?:ch(?:es)?)?\s*$/i);
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
  // Also match "WxHin" (no space before unit)
  const inMatchNoSpace = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)in(?:ch(?:es)?)?\s*$/i);
  if (inMatchNoSpace) {
    const wIn = parseFloat(inMatchNoSpace[1]);
    const hIn = parseFloat(inMatchNoSpace[2]);
    if (Number.isFinite(wIn) && Number.isFinite(hIn)) {
      return {
        parsed: { widthCm: wIn * 2.54, heightCm: hIn * 2.54 },
        unit: "in",
      };
    }
  }

  // 3) "W x H cm" — explicit cm suffix required
  const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\s*$/i);
  if (cmMatch) {
    const w = parseFloat(cmMatch[1]);
    const h = parseFloat(cmMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { parsed: { widthCm: w, heightCm: h }, unit: "cm" };
    }
  }

  // 4) "W x H" — unitless, no conversion
  const plainMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/);
  if (plainMatch) {
    const w = parseFloat(plainMatch[1]);
    const h = parseFloat(plainMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { parsed: { widthCm: w, heightCm: h }, unit: null };
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

  // size_unit 없음. 입력에 *호수가 명기* 된 경우만 단위(cm)가 확정 — 호수
  // 자체가 cm 기반 표준이라 안전. 그 외 순수 숫자(`120 × 80`)는 단위가
  // cm 인지 in 인지 알 수 없어 임의로 부여하면 2.5배 오차로 사용자에게
  // 잘못된 정보를 주게 된다. 호출처(예: 피드 사이즈 pill)에서 단위 부재
  // 게이트로 미렌더 처리하도록 *수치만* 반환한다.
  if (hosuNumber != null && hosuType) {
    if (isKo) {
      const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
      return `${hosuNumber}${hosuType} · ${base}`;
    }
    const wIn = cmToIn(widthCm);
    const hIn = cmToIn(heightCm);
    const base = `${wIn.toFixed(1)} × ${hIn.toFixed(1)} in`;
    return `${hosuNumber}${hosuType} · ${base}`;
  }
  // 호수 명기가 없으면 단위 미상 — 수치만 보존.
  const base = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)}`;
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

  // 2) "W x H in" / "W x H inches" — explicit inch suffix
  const inMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*in(?:ch(?:es)?)?\b/i);
  if (inMatch) {
    const wIn = parseFloat(inMatch[1]);
    const hIn = parseFloat(inMatch[2]);
    if (Number.isFinite(wIn) && Number.isFinite(hIn)) {
      return { widthCm: wIn * 2.54, heightCm: hIn * 2.54 };
    }
  }

  // 3) "W x H cm" / "W x H" — treat as cm (display parser, not unit-aware)
  const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (cmMatch) {
    const w = parseFloat(cmMatch[1]);
    const h = parseFloat(cmMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { widthCm: w, heightCm: h };
    }
  }

  return null;
}
