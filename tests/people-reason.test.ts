import assert from "node:assert/strict";
import { reasonTagToI18n } from "../src/lib/people/reason";

/**
 * People-recommendation reason humanizer — deterministic.
 *
 * The RPC ships `reason_tags` (raw token list) + `reason_detail`
 * (contextual medium/city/etc). The humanizer turns those into the
 * single user-facing sentence shown under each card. The contract
 * that this test pins:
 *
 *   1. `follow_graph` always wins (network signal trumps everything).
 *   2. `likes_based` / `matches_liked` win over generic `expand`.
 *   3. `shared_medium` with a medium context wins over generic
 *      `expand` — the overlap tag IS the reason the card surfaced.
 *   4. `same_city` with a city context wins over generic `expand`.
 *   5. `similar_keywords` is preferred over a bare `expand`.
 *   6. A bare `expand` (no overlap tag) still resolves to a real
 *      copy line, not the generic fallback ("당신에게 추천해요"
 *      sounded too marketing-y for a discovery lane).
 *   7. Unknown tags fall through to fallback.
 */

function fakeT(key: string): string {
  // Identity translator: returns the key itself so tests can assert
  // on the exact i18n key resolved without depending on locale data.
  return key;
}

function check(label: string, got: string, want: string) {
  assert.equal(got, want, `${label}: got ${got}, want ${want}`);
}

// 1. follow_graph wins
check(
  "follow_graph beats every other tag",
  reasonTagToI18n(["follow_graph", "shared_medium", "same_city"], fakeT, {
    medium: "oil",
    city: "Seoul",
  }),
  "people.reason.followedArtistsConnected"
);

// 2. likes_based / matches_liked win over expand
check(
  "likes_based beats expand",
  reasonTagToI18n(["expand", "likes_based"], fakeT),
  "people.reason.matchesLiked"
);
check(
  "matches_liked beats expand",
  reasonTagToI18n(["expand", "matches_liked"], fakeT),
  "people.reason.matchesLiked"
);

// 3. shared_medium with context beats generic expand
check(
  "shared_medium with medium beats expand",
  reasonTagToI18n(["expand", "shared_medium"], fakeT, { medium: "oil" }),
  "people.reason.sharedMedium"
);
// Without medium context, shared_medium does NOT win — falls through
// to the next tag in the priority list.
check(
  "shared_medium without context does not match (falls through)",
  reasonTagToI18n(["expand", "shared_medium"], fakeT, {}),
  "people.reason.expand"
);

// 4. same_city with context beats expand
check(
  "same_city with city beats expand",
  reasonTagToI18n(["expand", "same_city"], fakeT, { city: "Seoul" }),
  "people.reason.sameCity"
);

// 5. similar_keywords beats bare expand
check(
  "similar_keywords beats bare expand",
  reasonTagToI18n(["expand", "similar_keywords"], fakeT),
  "people.reason.similarKeywords"
);

// 6. Bare expand resolves to its own copy, not fallback
check(
  "bare expand resolves to people.reason.expand",
  reasonTagToI18n(["expand"], fakeT),
  "people.reason.expand"
);

// 7. Unknown tags → fallback
check(
  "unknown tags fall through to fallback",
  reasonTagToI18n(["unknown", "tag"], fakeT),
  "people.reason.fallback"
);
check(
  "empty tags → fallback",
  reasonTagToI18n([], fakeT),
  "people.reason.fallback"
);
check(
  "null tags → fallback",
  reasonTagToI18n(null, fakeT),
  "people.reason.fallback"
);

console.log("people-reason.test.ts: ok");
