import type { PageShellVariant } from "./PageShell";
import { PAGE_SHELL_TOKENS } from "./PageShell";

/**
 * Server-renderable, textless skeleton used for Suspense fallbacks and
 * first-render shimmers. Reads the same in any locale (no `t()` call)
 * and lines up with `PageShell` width / padding tokens, so the swap
 * from skeleton to live content is geometrically invisible.
 *
 * For *in-tab* shimmers (e.g. when the feed grid is repopulating but the
 * page header is already painted), use the `FeedGridSkeleton` /
 * `ListCardSkeleton` exports below directly — `PageShellSkeleton` just
 * composes them under a header + chip rail for the full-page case.
 */

type Variant = PageShellVariant;

type Props = {
  variant?: Variant;
  /** When the parent already renders a `<main>`, drop this to a `<div>`. */
  as?: "main" | "div";
};

export function PageShellSkeleton({
  variant = "default",
  as = "main",
}: Props) {
  const Tag = as;
  const widthCls = PAGE_SHELL_TOKENS.WIDTH[variant];
  const cls = [
    "mx-auto w-full",
    widthCls,
    PAGE_SHELL_TOKENS.HORIZONTAL,
    PAGE_SHELL_TOKENS.VERTICAL,
  ].join(" ");
  return (
    <Tag aria-hidden="true" className={cls}>
      <Header variant={variant} />
      {variant === "feed" && <FeedBody />}
      {variant === "default" && <ListBody />}
      {variant === "narrow" && <FormBody />}
      {variant === "studio" && <StudioBody />}
      {variant === "library" && <LibraryBody />}
    </Tag>
  );
}

function Header({ variant }: { variant: Variant }) {
  // Feed surfaces use a plain header (no kicker); editorial surfaces get
  // the 2px accent. Both render at the same height so the swap is even.
  const isEditorial = variant === "default";
  return (
    <header className="mb-8">
      {isEditorial && (
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-[2px] bg-zinc-300" />
          <span className="h-2 w-16 rounded bg-zinc-200" />
        </div>
      )}
      <div className={isEditorial ? "mt-3" : ""}>
        <span className="block h-7 w-40 rounded bg-zinc-200" />
        <span className="mt-2.5 block h-3 w-2/3 max-w-md rounded bg-zinc-100" />
      </div>
    </header>
  );
}

/**
 * In-tab list skeleton — used for People in-tab loading and any other
 * surface whose body is "card rows on white". Card geometry mirrors the
 * real `PeopleResultCard` so the swap is invisible.
 */
export function ListCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5"
        >
          <div className="h-14 w-14 shrink-0 rounded-full bg-zinc-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-zinc-200" />
            <div className="h-2.5 w-1/4 rounded bg-zinc-100" />
            <div className="h-2.5 w-2/3 rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * In-tab feed grid skeleton — mirrors the editorial salon grid (a
 * 2×2 spotlight on lg + standard tiles + one full-width context strip).
 * Borderless to match the loaded grid.
 */
export function FeedGridSkeleton() {
  return (
    <div className="grid auto-rows-min grid-cols-2 items-start gap-x-6 gap-y-10 [grid-auto-flow:dense] md:grid-cols-3 lg:grid-cols-4">
      <div
        className="col-span-1 aspect-square animate-pulse bg-zinc-100 lg:col-span-2 lg:row-span-2"
        aria-hidden
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={`s-art-top-${i}`}
          className="col-span-1 aspect-[4/5] animate-pulse bg-zinc-100"
          aria-hidden
        />
      ))}
      <div
        className="col-span-2 h-28 animate-pulse bg-zinc-100 md:col-span-3 lg:col-span-4"
        aria-hidden
      />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={`s-art-bot-${i}`}
          className="col-span-1 aspect-[4/5] animate-pulse bg-zinc-100"
          aria-hidden
        />
      ))}
    </div>
  );
}

function ListBody() {
  return (
    <>
      <div className="mb-8 h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50" />
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="h-9 w-32 rounded-full bg-zinc-200" />
        <span className="h-9 w-32 rounded-full bg-zinc-100" />
        <span className="h-9 w-32 rounded-full bg-zinc-100" />
      </div>
      <ListCardSkeleton rows={3} />
    </>
  );
}

function FeedBody() {
  return (
    <>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <span className="h-9 w-44 rounded-full bg-zinc-100" />
        <span className="h-7 w-24 rounded-full bg-zinc-100" />
        <span className="h-7 w-24 rounded-full bg-zinc-100" />
      </div>
      <FeedGridSkeleton />
    </>
  );
}

function FormBody() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full rounded-xl bg-zinc-100" />
      <div className="h-12 w-full rounded-xl bg-zinc-100" />
      <div className="h-32 w-full rounded-xl bg-zinc-100" />
      <div className="h-9 w-32 rounded-full bg-zinc-200" />
    </div>
  );
}

function StudioBody() {
  return (
    <>
      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-zinc-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-zinc-200" />
            <div className="h-2.5 w-1/2 rounded bg-zinc-100" />
          </div>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-zinc-200 bg-white"
          />
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="h-3 w-1/4 rounded bg-zinc-200" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-zinc-100" />
          ))}
        </div>
      </div>
    </>
  );
}

function LibraryBody() {
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <span className="h-9 w-28 rounded-full bg-zinc-200" />
        <span className="h-9 w-28 rounded-full bg-zinc-100" />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-zinc-100 px-5 py-4 last:border-b-0"
          >
            <div className="h-10 w-10 rounded bg-zinc-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/4 rounded bg-zinc-200" />
              <div className="h-2.5 w-1/3 rounded bg-zinc-100" />
            </div>
            <div className="h-7 w-20 rounded-full bg-zinc-100" />
          </div>
        ))}
      </div>
    </>
  );
}
