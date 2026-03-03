export type HosuType = "F" | "P" | "M" | "S";

export type HosuSize = {
  number: number;
  type: HosuType;
  widthCm: number;
  heightCm: number;
};

// 참고: 프랑스식 F/P/M 표준 캔버스 규격 + 한국에서 자주 쓰이는 정방형(S) 대표 값.
// (출처: 프랑스식 캔버스 규격표 / 국내 블로그 자료 등)
export const HOSU_SIZES: HosuSize[] = [
  // 0호
  { number: 0, type: "F", widthCm: 18, heightCm: 14 },
  { number: 0, type: "P", widthCm: 18, heightCm: 12 },
  { number: 0, type: "M", widthCm: 18, heightCm: 10 },
  { number: 0, type: "S", widthCm: 14, heightCm: 14 },
  // 1호
  { number: 1, type: "F", widthCm: 22, heightCm: 16 },
  { number: 1, type: "P", widthCm: 22, heightCm: 14 },
  { number: 1, type: "M", widthCm: 22, heightCm: 12 },
  { number: 1, type: "S", widthCm: 15.8, heightCm: 15.8 },
  // 2호
  { number: 2, type: "F", widthCm: 24, heightCm: 19 },
  { number: 2, type: "P", widthCm: 24, heightCm: 16 },
  { number: 2, type: "M", widthCm: 24, heightCm: 14 },
  { number: 2, type: "S", widthCm: 17.9, heightCm: 17.9 },
  // 3호
  { number: 3, type: "F", widthCm: 27, heightCm: 22 },
  { number: 3, type: "P", widthCm: 27, heightCm: 19 },
  { number: 3, type: "M", widthCm: 27, heightCm: 16 },
  { number: 3, type: "S", widthCm: 22, heightCm: 22 },
  // 4호
  { number: 4, type: "F", widthCm: 33, heightCm: 24 },
  { number: 4, type: "P", widthCm: 33, heightCm: 22 },
  { number: 4, type: "M", widthCm: 33, heightCm: 19 },
  { number: 4, type: "S", widthCm: 24.2, heightCm: 24.2 },
  // 5호
  { number: 5, type: "F", widthCm: 35, heightCm: 27 },
  { number: 5, type: "P", widthCm: 35, heightCm: 24 },
  { number: 5, type: "M", widthCm: 35, heightCm: 22 },
  { number: 5, type: "S", widthCm: 27.3, heightCm: 27.3 },
  // 6호
  { number: 6, type: "F", widthCm: 41, heightCm: 33 },
  { number: 6, type: "P", widthCm: 41, heightCm: 27 },
  { number: 6, type: "M", widthCm: 41, heightCm: 24 },
  { number: 6, type: "S", widthCm: 31.8, heightCm: 31.8 },
  // 8호
  { number: 8, type: "F", widthCm: 46, heightCm: 38 },
  { number: 8, type: "P", widthCm: 46, heightCm: 33 },
  { number: 8, type: "M", widthCm: 46, heightCm: 27 },
  { number: 8, type: "S", widthCm: 37.9, heightCm: 37.9 },
  // 10호
  { number: 10, type: "F", widthCm: 55, heightCm: 46 },
  { number: 10, type: "P", widthCm: 55, heightCm: 38 },
  { number: 10, type: "M", widthCm: 55, heightCm: 33 },
  { number: 10, type: "S", widthCm: 45.5, heightCm: 45.5 },
  // 12호
  { number: 12, type: "F", widthCm: 61, heightCm: 50 },
  { number: 12, type: "P", widthCm: 61, heightCm: 46 },
  { number: 12, type: "M", widthCm: 61, heightCm: 38 },
  { number: 12, type: "S", widthCm: 50, heightCm: 50 },
  // 15호
  { number: 15, type: "F", widthCm: 65, heightCm: 54 },
  { number: 15, type: "P", widthCm: 65, heightCm: 50 },
  { number: 15, type: "M", widthCm: 65, heightCm: 46 },
  { number: 15, type: "S", widthCm: 53, heightCm: 53 },
  // 20호
  { number: 20, type: "F", widthCm: 73, heightCm: 60 },
  { number: 20, type: "P", widthCm: 73, heightCm: 54 },
  { number: 20, type: "M", widthCm: 73, heightCm: 50 },
  { number: 20, type: "S", widthCm: 60.6, heightCm: 60.6 },
  // 25호
  { number: 25, type: "F", widthCm: 81, heightCm: 65 },
  { number: 25, type: "P", widthCm: 81, heightCm: 60 },
  { number: 25, type: "M", widthCm: 81, heightCm: 54 },
  // 30호
  { number: 30, type: "F", widthCm: 92, heightCm: 73 },
  { number: 30, type: "P", widthCm: 92, heightCm: 65 },
  { number: 30, type: "M", widthCm: 92, heightCm: 60 },
  { number: 30, type: "S", widthCm: 72.7, heightCm: 72.7 },
  // 40호
  { number: 40, type: "F", widthCm: 100, heightCm: 81 },
  { number: 40, type: "P", widthCm: 100, heightCm: 73 },
  { number: 40, type: "M", widthCm: 100, heightCm: 65 },
  // 50호
  { number: 50, type: "F", widthCm: 116, heightCm: 89 },
  { number: 50, type: "P", widthCm: 116, heightCm: 81 },
  { number: 50, type: "M", widthCm: 116, heightCm: 73 },
  // 60호
  { number: 60, type: "F", widthCm: 130, heightCm: 97 },
  { number: 60, type: "P", widthCm: 130, heightCm: 89 },
  { number: 60, type: "M", widthCm: 130, heightCm: 81 },
  // 80호
  { number: 80, type: "F", widthCm: 146, heightCm: 114 },
  { number: 80, type: "P", widthCm: 146, heightCm: 97 },
  { number: 80, type: "M", widthCm: 146, heightCm: 89 },
  // 100호
  { number: 100, type: "F", widthCm: 162.2, heightCm: 130.3 },
  { number: 100, type: "P", widthCm: 162.2, heightCm: 112.1 },
  { number: 100, type: "M", widthCm: 162.2, heightCm: 97.0 },
  // 120호
  { number: 120, type: "F", widthCm: 193.9, heightCm: 130.3 },
  { number: 120, type: "P", widthCm: 193.9, heightCm: 112.1 },
  { number: 120, type: "M", widthCm: 193.9, heightCm: 97.0 },
  // 150호
  { number: 150, type: "F", widthCm: 227.3, heightCm: 181.8 },
  { number: 150, type: "P", widthCm: 227.3, heightCm: 162.1 },
  { number: 150, type: "M", widthCm: 227.3, heightCm: 145.5 },
  { number: 150, type: "S", widthCm: 181.8, heightCm: 181.8 },
  // 200호
  { number: 200, type: "F", widthCm: 259.1, heightCm: 193.9 },
  { number: 200, type: "P", widthCm: 259.1, heightCm: 181.8 },
  { number: 200, type: "M", widthCm: 259.1, heightCm: 162.1 },
  { number: 200, type: "S", widthCm: 193.9, heightCm: 193.9 },
];

export function findHosuSizesByNumber(number: number): HosuSize[] {
  return HOSU_SIZES.filter((h) => h.number === number);
}

export function findHosuSize(number: number, type: HosuType): HosuSize | undefined {
  return HOSU_SIZES.find((h) => h.number === number && h.type === type);
}
