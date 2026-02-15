/**
 * Embedding provider interface (v0: no external calls).
 * Returns null for all; swap provider later for OpenAI/CLIP.
 */

export type ArtworkForEmbedding = {
  id: string;
  title?: string | null;
  medium?: string | null;
  story?: string | null;
};

/**
 * Get image embedding for artwork. v0: always returns null.
 */
export async function getImageEmbedding(
  _artwork: ArtworkForEmbedding
): Promise<number[] | null> {
  return null;
}

/**
 * Get text embedding for concatenated artwork metadata. v0: always returns null.
 */
export async function getTextEmbedding(_text: string): Promise<number[] | null> {
  return null;
}
