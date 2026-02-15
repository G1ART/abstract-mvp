/**
 * Profile completeness score (0–100).
 * Rules: username +10, display_name +10, avatar +10, bio +10, roles +10,
 * city/region/country +10, themes>=3 +10, mediums>=1 +10, styles>=1 +10, education>=1 +10.
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
  education?: unknown[] | null;
};

const MAX = 100;
const STEP = 10;

export function computeProfileCompleteness(profile: ProfileForCompleteness): number {
  if (!profile) return 0;
  let score = 0;

  if (profile.username && profile.username.trim().length >= 3) score += STEP;
  if (profile.display_name && profile.display_name.trim().length > 0) score += STEP;
  if (profile.avatar_url && profile.avatar_url.trim().length > 0) score += STEP;
  if (profile.bio && profile.bio.trim().length > 0) score += STEP;
  const hasRoles =
    (profile.main_role && profile.main_role.trim().length > 0) ||
    (Array.isArray(profile.roles) && profile.roles.length > 0);
  if (hasRoles) score += STEP;

  const hasLocation =
    (profile.city && profile.city.trim().length > 0) ||
    (profile.region && profile.region.trim().length > 0) ||
    (profile.country && profile.country.trim().length > 0);
  if (hasLocation) score += STEP;

  const themes = Array.isArray(profile.themes) ? profile.themes : [];
  if (themes.length >= 3) score += STEP;

  const mediums = Array.isArray(profile.mediums) ? profile.mediums : [];
  if (mediums.length >= 1) score += STEP;

  const styles = Array.isArray(profile.styles) ? profile.styles : [];
  if (styles.length >= 1) score += STEP;

  const education = Array.isArray(profile.education) ? profile.education : [];
  if (education.length >= 1) score += STEP;

  return Math.min(MAX, score);
}
