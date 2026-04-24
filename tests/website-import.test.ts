import assert from "node:assert/strict";
import { parseMetadataLine } from "../src/lib/websiteImport/metadataParse";
import { hammingDistanceHex, bucketMatch } from "../src/lib/websiteImport/dhash";
import { normalizeWebsiteUrl, isBlockedHostname } from "../src/lib/websiteImport/urlSafety";

// ── URL safety ─────────────────────────────────────────────
{
  const ok = normalizeWebsiteUrl("https://example.com/portfolio?utm_source=x");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.ok(!ok.url.searchParams.has("utm_source"));

  const bad = normalizeWebsiteUrl("ftp://example.com");
  assert.equal(bad.ok, false);

  assert.equal(isBlockedHostname("127.0.0.1"), true);
  assert.equal(isBlockedHostname("example.com"), false);
}

// ── Metadata parse (deterministic, source-backed) ───────────
{
  const p = parseMetadataLine("Wave I, 2016, acrylic on canvas, 36\"x36\"");
  assert.equal(p?.year, 2016);
  assert.ok(p?.medium?.toLowerCase().includes("acrylic"));
  assert.ok(p?.size?.includes("36"));
  assert.equal(p?.size_unit, "in");
}

{
  const p = parseMetadataLine("   ");
  assert.equal(p, null);
}

// ── Hamming / confidence buckets ───────────────────────────
{
  assert.equal(hammingDistanceHex("0".repeat(16), "0".repeat(16)), 0);
  assert.equal(hammingDistanceHex("f".repeat(16), "0".repeat(16)), 64);
}

{
  const high = bucketMatch([
    { hamming: 6, dimension_bonus: 0 },
    { hamming: 18, dimension_bonus: 0 },
  ]);
  assert.equal(high.status, "high_confidence");

  const amb = bucketMatch([
    { hamming: 12, dimension_bonus: 0 },
    { hamming: 14, dimension_bonus: 0 },
  ]);
  assert.equal(amb.status, "review_needed");

  const none = bucketMatch([
    { hamming: 40, dimension_bonus: 0 },
    { hamming: 41, dimension_bonus: 0 },
  ]);
  assert.equal(none.status, "no_match");
}

console.log("website-import tests: ok");
