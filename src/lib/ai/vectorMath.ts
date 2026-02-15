/**
 * Vector math helpers for taste/profile similarity.
 */

export function normalize(v: number[]): number[] {
  const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (len === 0) return v;
  return v.map((x) => x / len);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function averageVectors(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

export function weightedAverage(
  a: number[],
  b: number[],
  weightA: number
): number[] | null {
  if (a.length !== b.length || a.length === 0) return null;
  const weightB = 1 - weightA;
  return a.map((x, i) => weightA * x + weightB * b[i]);
}
