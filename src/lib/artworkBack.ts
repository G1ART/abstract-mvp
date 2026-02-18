const KEY = "ab_artwork_back";

export function setArtworkBack(pathname: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, pathname);
  } catch {
    // ignore
  }
}

export function getArtworkBack(): { path: string; labelKey: string } {
  if (typeof window === "undefined") return { path: "/feed?tab=all&sort=latest", labelKey: "nav.feed" };
  try {
    const path = window.sessionStorage.getItem(KEY) || "/feed?tab=all&sort=latest";
    if (path.startsWith("/my")) return { path: "/my", labelKey: "nav.myProfile" };
    if (path.startsWith("/feed")) return { path: "/feed?tab=all&sort=latest", labelKey: "nav.feed" };
    if (path.startsWith("/people")) return { path: "/people", labelKey: "nav.people" };
    if (path.startsWith("/upload")) return { path: "/upload", labelKey: "nav.upload" };
    if (path.startsWith("/u/")) return { path, labelKey: "nav.profile" };
    return { path: "/feed?tab=all&sort=latest", labelKey: "nav.feed" };
  } catch {
    return { path: "/feed?tab=all&sort=latest", labelKey: "nav.feed" };
  }
}
