/**
 * Centralized column selectors for Supabase queries.
 * Ensures profile_completeness and profile_details are always included for /my and /settings.
 */

export const PROFILE_ME_SELECT =
  "id, username, display_name, avatar_url, bio, location, website, main_role, roles, is_public, profile_details, profile_completeness, profile_updated_at, education, career_stage, age_band, city, region, country, themes, mediums, styles, keywords, price_band, acquisition_channels, affiliation, program_focus, residencies, exhibitions, awards";
