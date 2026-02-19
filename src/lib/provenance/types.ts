/**
 * Provenance v1 types.
 * Work = artworks; Claims = relationship declarations.
 */

export const CLAIM_TYPES = [
  "CREATED",
  "OWNS",
  "INVENTORY",
  "EXHIBITED",
  "CURATED",
  "INCLUDES_WORK",
  "HOSTS_PROJECT",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const VISIBILITY_OPTIONS = ["public", "connections", "private"] as const;
export type Visibility = (typeof VISIBILITY_OPTIONS)[number];

export const PROJECT_TYPES = ["exhibition"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUS = ["planned", "live", "ended"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const EXTERNAL_ARTIST_STATUS = ["invited", "claimed", "merged"] as const;
export type ExternalArtistStatus = (typeof EXTERNAL_ARTIST_STATUS)[number];

export type ExternalArtist = {
  id: string;
  display_name: string;
  website: string | null;
  instagram: string | null;
  invite_email: string | null;
  invited_by: string;
  created_at: string;
  status: ExternalArtistStatus;
  claimed_profile_id: string | null;
};

export type Project = {
  id: string;
  project_type: ProjectType;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  curator_id: string;
  host_name: string | null;
  host_profile_id: string | null;
  created_at: string;
};

export type Claim = {
  id: string;
  subject_profile_id: string;
  claim_type: ClaimType;
  work_id: string | null;
  project_id: string | null;
  artist_profile_id: string | null;
  external_artist_id: string | null;
  visibility: Visibility;
  note: string | null;
  created_at: string;
};

export type CreateExternalArtistAndClaimArgs = {
  displayName: string;
  website?: string | null;
  instagram?: string | null;
  inviteEmail?: string | null;
  claimType: ClaimType;
  workId?: string | null;
  projectId?: string | null;
  visibility?: Visibility;
  /** For INVENTORY/CURATED/EXHIBITED: past/current/future */
  period_status?: "past" | "current" | "future" | null;
};

export type CreateClaimForExistingArtistArgs = {
  artistProfileId: string;
  claimType: ClaimType;
  workId?: string | null;
  projectId?: string | null;
  visibility?: Visibility;
  /** For INVENTORY/CURATED/EXHIBITED: past/current/future */
  period_status?: "past" | "current" | "future" | null;
};

export type SearchWorksForDedupArgs = {
  artistProfileId?: string | null;
  externalArtistId?: string | null;
  q?: string | null;
  limit?: number;
};
