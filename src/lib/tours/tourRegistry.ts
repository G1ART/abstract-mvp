/**
 * Guided tour registry.
 *
 * This is the single source of truth for all onboarding tours. Each tour
 * is keyed by `id`, renders copy via i18n keys, and is rebroadcast to
 * returning users only when its numeric `version` is bumped.
 *
 * Guidelines for adding / editing tours:
 *   - keep steps short (ideally 4–7)
 *   - put all copy behind i18n keys so KR/EN stay natural
 *   - use stable `data-tour` anchors, not CSS/text selectors
 *   - bump `version` when copy or step list changes in a way returning
 *     users should see again
 */

import type { TourDefinition } from "./tourTypes";

export const TOUR_IDS = {
  studio: "studio.main",
  upload: "upload.main",
  exhibitionCreate: "exhibition.create",
  people: "people.main",
  delegation: "delegation.main",
  network: "network.main",
} as const;

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS];

export const TOURS: Record<TourId, TourDefinition> = {
  [TOUR_IDS.studio]: {
    id: TOUR_IDS.studio,
    version: 2,
    titleKey: "tour.studio.title",
    introKey: "tour.studio.intro",
    requiredAnchors: ["studio-hero", "studio-operating-grid"],
    steps: [
      {
        id: "hero",
        target: "studio-hero",
        titleKey: "tour.studio.hero.title",
        bodyKey: "tour.studio.hero.body",
        placement: "bottom",
      },
      {
        id: "next-steps",
        target: "studio-next-steps",
        titleKey: "tour.studio.nextSteps.title",
        bodyKey: "tour.studio.nextSteps.body",
        placement: "left",
      },
      {
        id: "grid",
        target: "studio-operating-grid",
        titleKey: "tour.studio.grid.title",
        bodyKey: "tour.studio.grid.body",
        placement: "top",
      },
      {
        id: "workshop",
        target: "studio-card-workshop",
        titleKey: "tour.studio.workshop.title",
        bodyKey: "tour.studio.workshop.body",
        placement: "right",
      },
      {
        id: "boards",
        target: "studio-card-boards",
        titleKey: "tour.studio.boards.title",
        bodyKey: "tour.studio.boards.body",
        placement: "right",
      },
      {
        id: "exhibitions",
        target: "studio-card-exhibitions",
        titleKey: "tour.studio.exhibitions.title",
        bodyKey: "tour.studio.exhibitions.body",
        placement: "right",
      },
      {
        id: "public-works",
        target: "studio-public-works",
        titleKey: "tour.studio.publicWorks.title",
        bodyKey: "tour.studio.publicWorks.body",
        placement: "top",
      },
      {
        id: "portfolio-tabs",
        target: "studio-portfolio-tabs",
        titleKey: "tour.studio.portfolioTabs.title",
        bodyKey: "tour.studio.portfolioTabs.body",
        placement: "top",
      },
    ],
  },

  [TOUR_IDS.upload]: {
    id: TOUR_IDS.upload,
    version: 1,
    titleKey: "tour.upload.title",
    introKey: "tour.upload.intro",
    requiredAnchors: ["upload-tabs"],
    steps: [
      {
        id: "tabs",
        target: "upload-tabs",
        titleKey: "tour.upload.tabs.title",
        bodyKey: "tour.upload.tabs.body",
        placement: "bottom",
      },
      {
        id: "single",
        target: "upload-tab-single",
        titleKey: "tour.upload.single.title",
        bodyKey: "tour.upload.single.body",
        placement: "bottom",
      },
      {
        id: "bulk",
        target: "upload-tab-bulk",
        titleKey: "tour.upload.bulk.title",
        bodyKey: "tour.upload.bulk.body",
        placement: "bottom",
      },
      {
        id: "exhibition",
        target: "upload-tab-exhibition",
        titleKey: "tour.upload.exhibition.title",
        bodyKey: "tour.upload.exhibition.body",
        placement: "bottom",
      },
      {
        id: "intent",
        target: "upload-intent-selector",
        titleKey: "tour.upload.intent.title",
        bodyKey: "tour.upload.intent.body",
        placement: "top",
      },
    ],
  },

  [TOUR_IDS.exhibitionCreate]: {
    id: TOUR_IDS.exhibitionCreate,
    version: 1,
    titleKey: "tour.exhibition.title",
    introKey: "tour.exhibition.intro",
    requiredAnchors: ["exhibition-form-title"],
    steps: [
      {
        id: "purpose",
        target: "exhibition-form-title",
        titleKey: "tour.exhibition.purpose.title",
        bodyKey: "tour.exhibition.purpose.body",
        placement: "bottom",
      },
      {
        id: "dates",
        target: "exhibition-form-dates",
        titleKey: "tour.exhibition.dates.title",
        bodyKey: "tour.exhibition.dates.body",
        placement: "top",
      },
      {
        id: "status",
        target: "exhibition-form-status",
        titleKey: "tour.exhibition.status.title",
        bodyKey: "tour.exhibition.status.body",
        placement: "top",
      },
      {
        id: "curator",
        target: "exhibition-form-curator",
        titleKey: "tour.exhibition.curator.title",
        bodyKey: "tour.exhibition.curator.body",
        placement: "top",
      },
    ],
  },

  [TOUR_IDS.people]: {
    id: TOUR_IDS.people,
    version: 1,
    titleKey: "tour.people.title",
    introKey: "tour.people.intro",
    requiredAnchors: ["people-search"],
    steps: [
      {
        id: "search",
        target: "people-search",
        titleKey: "tour.people.search.title",
        bodyKey: "tour.people.search.body",
        placement: "bottom",
      },
      {
        id: "lanes",
        target: "people-lane-tabs",
        titleKey: "tour.people.lanes.title",
        bodyKey: "tour.people.lanes.body",
        placement: "bottom",
      },
      {
        id: "roles",
        target: "people-role-filters",
        titleKey: "tour.people.roles.title",
        bodyKey: "tour.people.roles.body",
        placement: "bottom",
      },
      {
        id: "card",
        target: "people-card-actions",
        titleKey: "tour.people.card.title",
        bodyKey: "tour.people.card.body",
        placement: "top",
      },
    ],
  },

  [TOUR_IDS.delegation]: {
    id: TOUR_IDS.delegation,
    version: 1,
    titleKey: "tour.delegation.title",
    introKey: "tour.delegation.intro",
    requiredAnchors: ["delegation-invite"],
    steps: [
      {
        id: "what",
        target: "delegation-header",
        titleKey: "tour.delegation.what.title",
        bodyKey: "tour.delegation.what.body",
        placement: "bottom",
      },
      {
        id: "invite",
        target: "delegation-invite",
        titleKey: "tour.delegation.invite.title",
        bodyKey: "tour.delegation.invite.body",
        placement: "top",
      },
      {
        id: "received",
        target: "delegation-received",
        titleKey: "tour.delegation.received.title",
        bodyKey: "tour.delegation.received.body",
        placement: "bottom",
      },
      {
        id: "sent",
        target: "delegation-sent",
        titleKey: "tour.delegation.sent.title",
        bodyKey: "tour.delegation.sent.body",
        placement: "top",
      },
    ],
  },

  [TOUR_IDS.network]: {
    id: TOUR_IDS.network,
    version: 1,
    titleKey: "tour.network.title",
    introKey: "tour.network.intro",
    requiredAnchors: ["network-tabs"],
    steps: [
      {
        id: "tabs",
        target: "network-tabs",
        titleKey: "tour.network.tabs.title",
        bodyKey: "tour.network.tabs.body",
        placement: "bottom",
      },
      {
        id: "search",
        target: "network-search",
        titleKey: "tour.network.search.title",
        bodyKey: "tour.network.search.body",
        placement: "bottom",
      },
      {
        id: "list",
        target: "network-list",
        titleKey: "tour.network.list.title",
        bodyKey: "tour.network.list.body",
        placement: "top",
      },
    ],
  },
};

export function getTour(id: TourId | string): TourDefinition | null {
  return (TOURS as Record<string, TourDefinition>)[id] ?? null;
}
