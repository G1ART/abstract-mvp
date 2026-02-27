"use client";

import { getMyProfile } from "@/lib/supabase/profiles";

type InviterRole = "gallery" | "curator" | "both" | "other";

function inferInviterRole(mainRole: string | null, roles: string[] | null): InviterRole {
  const all = new Set<string>(
    [mainRole, ...(roles ?? [])].filter((v): v is string => !!v).map((v) => v.toLowerCase())
  );
  const hasGallery = all.has("gallerist") || all.has("gallery");
  const hasCurator = all.has("curator");
  if (hasGallery && hasCurator) return "both";
  if (hasGallery) return "gallery";
  if (hasCurator) return "curator";
  return "other";
}

export async function sendArtistInviteEmailClient(params: {
  toEmail: string;
  artistName?: string | null;
  exhibitionTitle?: string | null;
}) {
  try {
    const email = params.toEmail.trim();
    if (!email) return;

    const { data: profile } = await getMyProfile();
    const inviterName = profile?.display_name || profile?.username || null;
    const inviterRole = inferInviterRole(profile?.main_role ?? null, profile?.roles ?? null);

    await fetch("/api/artist-invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail: email,
        artistName: params.artistName ?? null,
        inviterName,
        inviterRole,
        exhibitionTitle: params.exhibitionTitle ?? null,
      }),
    });
  } catch (error) {
    // 초대 이메일 실패는 업로드/전시 기능에 영향을 주지 않아야 하므로, 콘솔만 남긴다.
    console.error("sendArtistInviteEmailClient failed", error);
  }
}

