/**
 * Compute patch: only keys where value differs from initial.
 * For arrays/objects use JSON.stringify for comparison (stable for our payloads).
 */

export function makePatch<T extends Record<string, unknown>>(
  initial: T | null,
  current: T
): Partial<T> {
  const init = initial ?? ({} as T);
  const out: Partial<T> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    const curr = current[key];
    const prev = init[key];
    if (valueEqual(prev, curr)) continue;
    (out as Record<string, unknown>)[key] = curr;
  }
  return out;
}

function valueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
