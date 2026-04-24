import assert from "node:assert/strict";
import {
  assignArtworksToCustomTab,
  buildSavePayload,
  dedupeCustomTabMemberships,
  parseStudioPortfolio,
  personaOrderForLegacySave,
  resolveTabStripOrderStrings,
} from "../src/lib/studio/studioPortfolioConfig";
import { getOrderedPersonaTabs, getPersonaCounts } from "../src/lib/provenance/personaTabs";

function personaItems(profileId: string) {
  const counts = getPersonaCounts([], profileId);
  return getOrderedPersonaTabs(counts, 0, { main_role: "artist", roles: ["artist"] }, undefined);
}

void (async () => {
  const pid = "00000000-0000-4000-8000-000000000001";
  const items = personaItems(pid);
  const order = resolveTabStripOrderStrings({
    portfolio: {
      version: 1,
      custom_tabs: [{ id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee", label: "T", public: true, artwork_ids: [] }],
      tab_strip_order: ["all", "c:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"],
    },
    personaItems: items,
    rootProfileDetails: { tab_order: ["all"] },
  });
  assert.ok(order.includes("all"));
  assert.ok(order.includes("c:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"));

  const p = parseStudioPortfolio(null);
  assert.equal(p.version, 1);

  const assigned = assignArtworksToCustomTab({
    portfolio: {
      version: 1,
      custom_tabs: [
        { id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee", label: "A", public: true, artwork_ids: ["w1"] },
        { id: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee", label: "B", public: true, artwork_ids: [] },
      ],
    },
    artworkIds: ["w1"],
    targetCustomId: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee",
  });
  const a = assigned.custom_tabs?.find((t) => t.id === "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
  const b = assigned.custom_tabs?.find((t) => t.id === "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee");
  assert.deepEqual(a?.artwork_ids, []);
  assert.deepEqual(b?.artwork_ids, ["w1"]);

  const deduped = dedupeCustomTabMemberships([
    { id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee", label: "A", public: true, artwork_ids: ["x", "x"] },
    { id: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee", label: "B", public: true, artwork_ids: ["x"] },
  ]);
  assert.equal(deduped[0].artwork_ids.length, 1);
  assert.equal(deduped[1].artwork_ids.length, 0);

  const save = buildSavePayload({
    version: 1,
    tab_strip_order: ["all", "c:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"],
    custom_tabs: [],
  });
  assert.ok(Array.isArray((save.tab_order as string[] | undefined) ?? []));
  assert.equal(personaOrderForLegacySave(["all", "c:aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"]).join(","), "all");

  console.log("studio-portfolio-config tests ok");
})();
