"use client";

// Sprint 7 Phase B + E — First-Value Path Panel.
//
// Persona-aware "what to do next" panel rendered on `/my` in the
// rail slot next to the StudioHero. Replaces the old quiet status
// card ("프로필 완성도가 높고…") with a context-aware first-value
// translator:
//
//   [kicker] / [title] / [one-sentence] / [up to 3 calm CTA pills]
//
// The panel never ends in a dead "all clear" state — the selector
// (`getFirstValueActions` in src/lib/persona/actionGrammar.ts) always
// returns at least one deeper-value fallback action when basics are
// done. If the selector somehow returns 0 (e.g. unknown persona), the
// caller is expected to render the legacy `StudioNextStepsRail` as a
// defence-in-depth fallback so the slot is never empty.
//
// All telemetry routes through `logActivation` (allowlisted payload
// keys only). Principal IDs, profile names, and route tokens are
// never logged here.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getFirstValueActions,
  type FirstValueAction,
  type FirstValueSelectorInput,
  type PersonaMode,
} from "@/lib/persona/actionGrammar";
import {
  logFirstValueActionClicked,
  logFirstValuePanelViewed,
  logPersonaModeHintSeen,
} from "@/lib/persona/activationTelemetry";

export type FirstValuePathPanelProps = {
  selectorInput: FirstValueSelectorInput;
  /**
   * When the user is acting as a delegate, this name is shown in the
   * "You are acting for {name}" hint. Display-only — never logged.
   */
  delegateDisplayName?: string | null;
  /** Optional render slot rendered when selector returns 0 actions. */
  fallback?: React.ReactNode;
};

function titleKeyFor(persona: PersonaMode): MessageKey {
  switch (persona) {
    case "artist":
      return "firstValue.title.artist";
    case "gallery":
      return "firstValue.title.gallery";
    case "curator":
      return "firstValue.title.curator";
    case "collector":
      return "firstValue.title.collector";
    case "multi_persona":
      return "firstValue.title.multi_persona";
  }
}

function subtitleKeyFor(persona: PersonaMode): MessageKey {
  switch (persona) {
    case "artist":
      return "firstValue.subtitle.artist";
    case "gallery":
      return "firstValue.subtitle.gallery";
    case "curator":
      return "firstValue.subtitle.curator";
    case "collector":
      return "firstValue.subtitle.collector";
    case "multi_persona":
      return "firstValue.subtitle.multi_persona";
  }
}

function modeHintKeyFor(
  persona: PersonaMode,
  actingAs: boolean
): MessageKey | null {
  if (actingAs) return "studio.context.delegate";
  if (persona === "collector") return "studio.context.viewing";
  if (persona === "artist" || persona === "gallery")
    return "studio.context.studio";
  return null;
}

export function FirstValuePathPanel({
  selectorInput,
  delegateDisplayName,
  fallback,
}: FirstValuePathPanelProps) {
  const { t, locale } = useT();
  const actions = getFirstValueActions(selectorInput);
  const personaMode = selectorInput.personaMode;
  const actingAs = selectorInput.actingAs;
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    if (actions.length === 0) return;
    viewedRef.current = true;
    logFirstValuePanelViewed({
      personaMode,
      actingAs,
      locale,
    });
    if (modeHintKeyFor(personaMode, actingAs)) {
      logPersonaModeHintSeen({
        personaMode,
        actingAs,
        locale,
      });
    }
  }, [actions.length, personaMode, actingAs, locale]);

  if (actions.length === 0) {
    return <>{fallback ?? null}</>;
  }

  const kickerKey: MessageKey =
    personaMode === "collector"
      ? "firstValue.kicker.viewing"
      : actingAs
      ? "firstValue.kicker.delegate"
      : "firstValue.kicker";

  const hintKey = modeHintKeyFor(personaMode, actingAs);
  const hintCopy = hintKey
    ? hintKey === "studio.context.delegate" && delegateDisplayName
      ? t(hintKey).replace("{name}", delegateDisplayName)
      : t(hintKey).replace("{name}", "")
    : null;

  return (
    <aside
      data-tour="studio-first-value-panel"
      data-persona={personaMode}
      data-acting-as={actingAs ? "true" : "false"}
      aria-label={t(titleKeyFor(personaMode))}
      className="flex h-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {t(kickerKey)}
      </p>
      <p className="text-sm font-semibold text-zinc-900">
        {t(titleKeyFor(personaMode))}
      </p>
      <p className="text-xs leading-relaxed text-zinc-600 break-keep">
        {t(subtitleKeyFor(personaMode))}
      </p>

      <ul className="mt-1 flex flex-col gap-2">
        {actions.map((action, idx) => (
          <li key={action.id}>
            <ActionPill action={action} primary={idx === 0} actingAs={actingAs} />
          </li>
        ))}
      </ul>

      {hintCopy && (
        <p className="mt-auto pt-2 text-[11px] text-zinc-500">{hintCopy}</p>
      )}
    </aside>
  );
}

function ActionPill({
  action,
  primary,
  actingAs,
}: {
  action: FirstValueAction;
  primary: boolean;
  actingAs: boolean;
}) {
  const { t, locale } = useT();
  const baseClass =
    "group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors";
  const tone = primary
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "border border-transparent bg-white text-zinc-800 shadow-[inset_0_0_0_1px_rgb(228_228_231)] hover:shadow-[inset_0_0_0_1px_rgb(161_161_170)]";
  return (
    <Link
      href={action.href}
      data-action-kind={action.actionKind}
      data-action-id={action.id}
      onClick={() =>
        logFirstValueActionClicked({
          action,
          actingAs,
          locale,
        })
      }
      className={`${baseClass} ${tone}`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {t(action.titleKey as MessageKey)}
        </span>
        <span
          className={`truncate text-[11px] ${
            primary ? "text-zinc-300" : "text-zinc-500"
          }`}
        >
          {t(action.descriptionKey as MessageKey)}
        </span>
      </span>
      <span
        aria-hidden
        className={`shrink-0 ${
          primary
            ? "text-zinc-200 group-hover:text-white"
            : "text-zinc-300 group-hover:text-zinc-500"
        }`}
      >
        →
      </span>
    </Link>
  );
}
