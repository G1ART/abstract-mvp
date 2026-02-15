/**
 * Profile completeness scoring v0 — role-based weights.
 * Core 50 + primary role module 50 so collector/artist/curator are treated fairly.
 */

export type ProfileForCompleteness = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  themes?: string[] | null;
  mediums?: string[] | null;
  styles?: string[] | null;
  keywords?: string[] | null;
  education?: unknown[] | null;
  price_band?: string | null;
  acquisition_channels?: string[] | null;
  affiliation?: string | null;
  program_focus?: string[] | null;
};

export type CompletenessResult = {
  score: number;
  missingRecommendations: string[];
};

const CORE_WEIGHT = 50;
const MODULE_WEIGHT = 50;

function coreScore(p: ProfileForCompleteness): number {
  let n = 0;
  const total = 6;
  if (p.username && String(p.username).trim().length >= 3) n++;
  if (p.display_name && String(p.display_name).trim().length > 0) n++;
  if (p.avatar_url && String(p.avatar_url).trim().length > 0) n++;
  if (p.bio && String(p.bio).trim().length > 0) n++;
  const hasRoles =
    (p.main_role && String(p.main_role).trim().length > 0) ||
    (Array.isArray(p.roles) && p.roles.length > 0);
  if (hasRoles) n++;
  const hasLocation =
    (p.city && String(p.city).trim().length > 0) ||
    (p.region && String(p.region).trim().length > 0) ||
    (p.country && String(p.country).trim().length > 0);
  if (hasLocation) n++;
  return (n / total) * CORE_WEIGHT;
}

function artistModuleScore(p: ProfileForCompleteness): number {
  let n = 0;
  const total = 3;
  const themes = Array.isArray(p.themes) ? p.themes : [];
  if (themes.length >= 3) n++;
  const mediums = Array.isArray(p.mediums) ? p.mediums : [];
  if (mediums.length >= 1) n++;
  const styles = Array.isArray(p.styles) ? p.styles : [];
  if (styles.length >= 1) n++;
  const education = Array.isArray(p.education) ? p.education : [];
  if (education.length >= 1) n++;
  return (Math.min(n, total) / total) * MODULE_WEIGHT;
}

function collectorModuleScore(p: ProfileForCompleteness): number {
  let n = 0;
  const total = 3;
  const themes = Array.isArray(p.themes) ? p.themes : [];
  if (themes.length >= 2) n++;
  if (p.price_band && String(p.price_band).trim().length > 0) n++;
  const ch = Array.isArray(p.acquisition_channels) ? p.acquisition_channels : [];
  if (ch.length >= 1) n++;
  return (n / total) * MODULE_WEIGHT;
}

function curatorModuleScore(p: ProfileForCompleteness): number {
  let n = 0;
  const total = 2;
  if (p.affiliation && String(p.affiliation).trim().length > 0) n++;
  const pf = Array.isArray(p.program_focus) ? p.program_focus : [];
  if (pf.length >= 2) n++;
  return (n / total) * MODULE_WEIGHT;
}

export function computeCompleteness(
  profile: ProfileForCompleteness
): CompletenessResult {
  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  const main = profile.main_role ?? "";
  const hasArtist = roles.includes("artist") || main === "artist";
  const hasCollector = roles.includes("collector") || main === "collector";
  const hasCurator = roles.includes("curator") || main === "curator";
  const hasGallerist = roles.includes("gallerist") || main === "gallerist";

  const core = coreScore(profile);
  let moduleScore = 0;
  const missing: string[] = [];

  if (hasArtist) {
    const s = artistModuleScore(profile);
    if (s > moduleScore) moduleScore = s;
  }
  if (hasCollector) {
    const s = collectorModuleScore(profile);
    if (s > moduleScore) moduleScore = s;
  }
  if (hasCurator || hasGallerist) {
    const s = curatorModuleScore(profile);
    if (s > moduleScore) moduleScore = s;
  }

  const score = Math.min(100, Math.round(core + moduleScore));

  if (core < CORE_WEIGHT) missing.push("core");
  if (hasArtist && artistModuleScore(profile) < MODULE_WEIGHT) missing.push("artist_module");
  if (hasCollector && collectorModuleScore(profile) < MODULE_WEIGHT) missing.push("collector_module");
  if ((hasCurator || hasGallerist) && curatorModuleScore(profile) < MODULE_WEIGHT) missing.push("curator_module");

  return { score, missingRecommendations: missing };
}
