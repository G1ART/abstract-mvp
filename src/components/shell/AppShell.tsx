import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { RightRail } from "./RightRail";

/**
 * Theo 3-column app shell (wireframe redesign).
 *
 * Layout:
 *   - lg+  : [ left sidebar | center content | right rail (xl+) ]
 *   - < lg : center content only — the global top Header + hamburger (kept
 *            in the root layout, hidden on desktop for shell routes) handles
 *            mobile navigation, so we don't duplicate it here.
 *
 * `rightRail` defaults to the Theo News placeholder rail; pass `false` to
 * drop the right column (e.g. artwork detail keeps only search per wireframe —
 * but by default we render the shared rail for consistency).
 */
export function AppShell({
  children,
  rightRail = true,
}: {
  children: ReactNode;
  rightRail?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px]">
      <aside className="hidden w-52 shrink-0 pl-6 lg:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto">
          <AppSidebar />
        </div>
      </aside>

      {/* Center keeps each page's own <main>/container (padding, max-width,
          centering), so wrapping a page in <AppShell> needs no internal edits
          and avoids nested <main> landmarks. */}
      <div className="min-w-0 flex-1">{children}</div>

      {rightRail && (
        <aside className="hidden w-[340px] shrink-0 pr-6 xl:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto">
            <RightRail />
          </div>
        </aside>
      )}
    </div>
  );
}
