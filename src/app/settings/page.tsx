"use client";

import { FormEvent, useEffect, useState, KeyboardEvent, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import {
  getMyProfile,
  updateMyProfile,
  type UpdateProfileParams,
  type EducationEntry,
} from "@/lib/supabase/profiles";
import { getMyProfileDetails, upsertMyProfileDetails } from "@/lib/supabase/profileDetails";
import { computeCompleteness } from "@/lib/profile/completeness";
import { sanitizeProfileDetails } from "@/lib/profile/sanitizeProfileDetails";
import {
  TAXONOMY,
  TAXONOMY_LIMITS,
  type TaxonomyOption,
} from "@/lib/profile/taxonomy";

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;
const ROLES = [...MAIN_ROLES];
const PROFILE_UPDATED_KEY = "profile_updated";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  main_role: string | null;
  roles: string[] | null;
  is_public: boolean | null;
  career_stage?: string | null;
  age_band?: string | null;
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

function ChipInput({
  values,
  onChange,
  placeholder,
  max,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max?: number;
}) {
  const [input, setInput] = useState("");
  const addChip = useCallback(() => {
    const v = input.trim();
    if (v && !values.includes(v)) {
      const limit = max ?? 999;
      if (values.length >= limit) return;
      onChange([...values, v]);
      setInput("");
    }
  }, [input, values, onChange, max]);
  const removeChip = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip();
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      removeChip(values.length - 1);
    }
  };
  return (
    <div className="flex flex-wrap gap-2 rounded border border-zinc-300 bg-white px-3 py-2">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-sm"
        >
          {v}
          <button
            type="button"
            onClick={() => removeChip(i)}
            className="text-zinc-500 hover:text-zinc-800"
            aria-label="Remove"
          >
            ×
          </button>
        </span>
      ))}
      {(max == null || values.length < max) && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addChip}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 border-0 bg-transparent px-0 py-0 text-sm focus:outline-none focus:ring-0"
        />
      )}
    </div>
  );
}

function TaxonomyChipSelect({
  options,
  value,
  onChange,
  max,
  t,
  onMaxReached,
}: {
  options: readonly TaxonomyOption[];
  value: string[];
  onChange: (v: string[]) => void;
  max: number;
  t: (key: string) => string;
  onMaxReached: () => void;
}) {
  const toggle = (slug: string) => {
    if (value.includes(slug)) {
      onChange(value.filter((x) => x !== slug));
    } else {
      if (value.length >= max) {
        onMaxReached();
        return;
      }
      onChange([...value, slug]);
    }
  };
  const others = value.filter((v) => !options.some((o) => o.value === v));
  const removeOther = (i: number) => {
    const list = value.filter((x) => !options.some((o) => o.value === x));
    const removed = list[i];
    onChange(value.filter((x) => x !== removed));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`rounded-full px-2.5 py-1 text-sm ${
                selected
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
      {others.length < 2 && value.length < max && (
        <ChipInput
          values={others}
          onChange={(otherList) => {
            const fromOpts = value.filter((v) => options.some((o) => o.value === v));
            onChange([...fromOpts, ...otherList].slice(0, max));
          }}
          placeholder="Other (type + Enter)"
          max={2}
        />
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {others.map((v, i) => (
            <span
              key={`o-${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm"
            >
              {v}
              <button type="button" onClick={() => removeOther(i)} className="text-zinc-500 hover:text-zinc-800" aria-label="Remove">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useT();
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [mainRole, setMainRole] = useState<string>("");
  const [roles, setRoles] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [careerStage, setCareerStage] = useState<string>("");
  const [ageBand, setAgeBand] = useState<string>("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [themes, setThemes] = useState<string[]>([]);
  const [mediums, setMediums] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [education, setEducation] = useState<EducationEntry[]>([{ school: "", program: "", year: "", type: null }]);
  const [priceBand, setPriceBand] = useState("");
  const [acquisitionChannels, setAcquisitionChannels] = useState<string[]>([]);
  const [affiliation, setAffiliation] = useState("");
  const [programFocus, setProgramFocus] = useState<string[]>([]);
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [maxSelectMessage, setMaxSelectMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (maxSelectMessage) {
      const tid = setTimeout(() => setMaxSelectMessage(null), 3000);
      return () => clearTimeout(tid);
    }
  }, [maxSelectMessage]);

  useEffect(() => {
    Promise.all([getMyProfile(), getMyProfileDetails()]).then(
      ([profileRes, detailsRes]) => {
        setLoading(false);
        const err = profileRes.error;
        if (err) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
          return;
        }
        const p = profileRes.data as Profile | null;
        const d = detailsRes.data;
        if (p) {
          setUsername(p.username ?? null);
          setAvatarUrl(p.avatar_url ?? null);
          setDisplayName(p.display_name ?? "");
          setBio(p.bio ?? "");
          setLocation(p.location ?? "");
          setWebsite(p.website ?? "");
          setMainRole(p.main_role ?? "");
          setRoles((p.roles as string[]) ?? []);
          setIsPublic(p.is_public ?? true);
          const ed = (p.education as EducationEntry[] | null) ?? [];
          setEducation(ed.length ? ed : [{ school: "", program: "", year: "", type: null }]);
        }
        if (d) {
          setCareerStage(d.career_stage ?? "");
          setAgeBand(d.age_band ?? "");
          setCity(d.city ?? "");
          setRegion(d.region ?? "");
          setCountry(d.country ?? "");
          setThemes(d.themes ?? []);
          setMediums(d.mediums ?? []);
          setStyles(d.styles ?? []);
          setKeywords(d.keywords ?? []);
          setPriceBand(d.collector_price_band ?? "");
          setAcquisitionChannels(d.collector_acquisition_channels ?? []);
          setAffiliation(d.affiliation ?? "");
          setProgramFocus(d.program_focus ?? []);
        } else if (p) {
          setCareerStage((p as Profile).career_stage ?? "");
          setAgeBand((p as Profile).age_band ?? "");
          setCity((p as Profile).city ?? "");
          setRegion((p as Profile).region ?? "");
          setCountry((p as Profile).country ?? "");
          setThemes((p as Profile).themes ?? []);
          setMediums((p as Profile).mediums ?? []);
          setStyles((p as Profile).styles ?? []);
          setKeywords((p as Profile).keywords ?? []);
          setPriceBand((p as Profile).price_band ?? "");
          setAcquisitionChannels((p as Profile).acquisition_channels ?? []);
          setAffiliation((p as Profile).affiliation ?? "");
          setProgramFocus((p as Profile).program_focus ?? []);
        }
      }
    );
  }, []);

  const { score: completeness } = computeCompleteness({
    username: username ?? undefined,
    display_name: displayName,
    avatar_url: avatarUrl ?? undefined,
    bio,
    main_role: mainRole,
    roles,
    city: city || undefined,
    region: region || undefined,
    country: country || undefined,
    themes,
    mediums,
    styles,
    education,
    price_band: priceBand || undefined,
    acquisition_channels: acquisitionChannels,
    affiliation: affiliation || undefined,
    program_focus: programFocus,
  });

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  function addEducation() {
    setEducation((prev) => [...prev, { school: "", program: "", year: "", type: null }]);
  }
  function removeEducation(i: number) {
    setEducation((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function updateEducation(i: number, field: keyof EducationEntry, value: string | null) {
    setEducation((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e))
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const finalRoles = [...roles];
    if (mainRole && !finalRoles.includes(mainRole)) {
      finalRoles.push(mainRole);
    }
    if (finalRoles.length < 1) {
      setError(t("common.selectRole"));
      return;
    }

    const sanitized = sanitizeProfileDetails({
      display_name: displayName,
      bio,
      location,
      website,
      career_stage: careerStage,
      age_band: ageBand,
      city,
      region,
      country,
      themes,
      mediums,
      styles,
      keywords,
      education,
      price_band: priceBand,
      acquisition_channels: acquisitionChannels,
      affiliation,
      program_focus: programFocus,
    });

    const fullProfile = {
      username: username ?? undefined,
      display_name: sanitized.display_name ?? undefined,
      avatar_url: avatarUrl ?? undefined,
      bio: sanitized.bio ?? undefined,
      main_role: mainRole,
      roles: finalRoles,
      city: sanitized.city ?? undefined,
      region: sanitized.region ?? undefined,
      country: sanitized.country ?? undefined,
      themes: sanitized.themes ?? undefined,
      mediums: sanitized.mediums ?? undefined,
      styles: sanitized.styles ?? undefined,
      education: sanitized.education ?? undefined,
      price_band: sanitized.price_band ?? undefined,
      acquisition_channels: sanitized.acquisition_channels ?? undefined,
      affiliation: sanitized.affiliation ?? undefined,
      program_focus: sanitized.program_focus ?? undefined,
    };
    const { score } = computeCompleteness(fullProfile);

    const basicsPayload: UpdateProfileParams = {
      display_name: sanitized.display_name,
      bio: sanitized.bio,
      location: sanitized.location,
      website: sanitized.website,
      main_role: mainRole || null,
      roles: finalRoles,
      is_public: isPublic,
      education:
        sanitized.education?.map((row) => ({
          school: row.school,
          program: row.program,
          year: row.year,
          type: row.type,
        })) ?? null,
      profile_completeness: score,
      profile_updated_at: new Date().toISOString(),
    };

    const detailsPayload = {
      career_stage: careerStage,
      age_band: ageBand,
      city,
      region,
      country,
      themes,
      mediums,
      styles,
      keywords,
      price_band: priceBand,
      acquisition_channels: acquisitionChannels,
      affiliation,
      program_focus: programFocus,
    };

    setSaving(true);
    const [profileErr, detailsErr] = await Promise.all([
      updateMyProfile(basicsPayload).then((r) => r.error),
      upsertMyProfileDetails(detailsPayload).then((r) => r.error),
    ]);
    setSaving(false);

    const err = profileErr ?? detailsErr;
    if (profileErr) {
      if (process.env.NODE_ENV === "development") {
        const detail = profileErr as { code?: string; details?: string; hint?: string; message?: string };
        console.warn("profile-details-save-failed", { payload: basicsPayload, error: profileErr, code: detail?.code, details: detail?.details, hint: detail?.hint });
        const msg = profileErr instanceof Error ? profileErr.message : String(profileErr);
        setError(detail?.details ? `${msg} — ${detail.details}` : detail?.hint ? `${msg} (${detail.hint})` : msg);
      } else {
        setError("Failed to save");
      }
      return;
    }
    if (detailsErr) {
      if (process.env.NODE_ENV === "development") {
        const detail = detailsErr as { code?: string; details?: string; hint?: string; message?: string };
        console.warn("profile-details-save-failed", { payload: detailsPayload, error: detailsErr, code: detail?.code, details: detail?.details, hint: detail?.hint });
        const msg = detailsErr instanceof Error ? detailsErr.message : String(detailsErr);
        setError(detail?.details ? `${msg} — ${detail.details}` : detail?.hint ? `${msg} (${detail.hint})` : msg);
      } else {
        setError("Failed to save");
      }
      return;
    }

    const { data: refreshed } = await getMyProfile();
    const profileUsername =
      (refreshed as Profile | null)?.username?.trim().toLowerCase() ?? "";

    if (profileUsername) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PROFILE_UPDATED_KEY, "true");
      }
      router.push(`/u/${profileUsername}`);
    } else {
      setSaved(true);
    }
  }

  return (
    <AuthGate>
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t("settings.title")}</h1>

        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-700">{t("settings.security")}</h2>
          <Link
            href="/set-password"
            className="text-sm text-zinc-600 underline hover:text-zinc-900"
          >
            {t("settings.setPassword")}
          </Link>
          <p className="mt-1 text-xs text-zinc-500">{t("settings.setPasswordHint")}</p>
        </div>

        {loading ? (
          <p className="text-zinc-600">{t("common.loading")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-2 text-sm font-medium text-zinc-700">
                {t("profile.completeness")}: {completeness}/100
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full bg-zinc-900 transition-all"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">{t("profile.completenessHint")}</p>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="isPublic" className="text-sm font-medium">
                {t("settings.publicToggle")}
              </label>
              <input
                id="isPublic"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
            </div>

            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
                {t("settings.displayName")}
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="w-full rounded border border-zinc-300 px-3 py-2"
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="bio" className="mb-1 block text-sm font-medium">
                {t("settings.bio")}
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Short bio"
                rows={3}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="location" className="mb-1 block text-sm font-medium">
                {t("settings.location")}
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="website" className="mb-1 block text-sm font-medium">
                {t("settings.website")}
              </label>
              <input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
                className="w-full rounded border border-zinc-300 px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="mainRole" className="mb-1 block text-sm font-medium">
                {t("settings.mainRole")}
              </label>
              <select
                id="mainRole"
                value={mainRole}
                onChange={(e) => setMainRole(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
              >
                <option value="">Select</option>
                {MAIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium">{t("settings.roles")}</span>
              <div className="flex flex-wrap gap-3">
                {ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={roles.includes(r)}
                      onChange={() => toggleRole(r)}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Profile details accordion */}
            <div className="border-t border-zinc-200 pt-6">
              <button
                type="button"
                onClick={() => setProfileDetailsOpen(!profileDetailsOpen)}
                className="flex w-full items-center justify-between py-2 text-sm font-medium text-zinc-700"
              >
                {t("settings.profileDetailsTitle")}
                <span className="text-zinc-400">{profileDetailsOpen ? "−" : "+"}</span>
              </button>
              {profileDetailsOpen && (
                <div className="space-y-6 pt-2">
                  {maxSelectMessage && (
                    <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">
                      {maxSelectMessage}
                    </p>
                  )}

                  {/* Core */}
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                      {t("profileDetails.core")}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("settings.careerStage")}</label>
                        <select
                          value={careerStage}
                          onChange={(e) => setCareerStage(e.target.value)}
                          className="w-full rounded border border-zinc-300 px-3 py-2"
                        >
                          <option value="">Select</option>
                          {TAXONOMY.careerStageOptions.map((o) => (
                            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("settings.ageBand")}</label>
                        <select
                          value={ageBand}
                          onChange={(e) => setAgeBand(e.target.value)}
                          className="w-full rounded border border-zinc-300 px-3 py-2"
                        >
                          <option value="">Select</option>
                          {TAXONOMY.ageBandOptions.map((o) => (
                            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <label className="mb-1 block text-sm font-medium">{t("settings.city")}</label>
                          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("settings.region")}</label>
                          <select value={region} onChange={(e) => setRegion(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2 text-sm">
                            <option value="">Select</option>
                            {TAXONOMY.regionOptions.map((o) => (
                              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("settings.country")}</label>
                          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="w-full rounded border border-zinc-300 px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("settings.themes")}</label>
                        <p className="mb-1 text-xs text-zinc-500">{t("profileDetails.themesHint")}</p>
                        <TaxonomyChipSelect
                          options={TAXONOMY.themeOptions}
                          value={themes}
                          onChange={setThemes}
                          max={TAXONOMY_LIMITS.themes}
                          t={t}
                          onMaxReached={() => setMaxSelectMessage(t("profileDetails.maxSelectHint").replace("{max}", String(TAXONOMY_LIMITS.themes)))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">{t("settings.keywords")} ({t("profileDetails.optional")})</label>
                        <ChipInput values={keywords} onChange={setKeywords} placeholder="Add keyword, Enter" max={TAXONOMY_LIMITS.keywords} />
                      </div>
                    </div>
                  </section>

                  {/* Artist module */}
                  {(roles.includes("artist") || mainRole === "artist") && (
                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                        {t("profileDetails.artistModule")}{" "}
                        <span className="text-xs font-normal text-zinc-500">({t("profileDetails.recommended")})</span>
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("settings.mediums")} ({t("profileDetails.optional")})</label>
                          <TaxonomyChipSelect options={TAXONOMY.mediumOptions} value={mediums} onChange={setMediums} max={TAXONOMY_LIMITS.mediums} t={t} onMaxReached={() => setMaxSelectMessage(t("profileDetails.maxSelectHint").replace("{max}", String(TAXONOMY_LIMITS.mediums)))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">{t("settings.styles")} ({t("profileDetails.optional")})</label>
                          <TaxonomyChipSelect options={TAXONOMY.styleOptions} value={styles} onChange={setStyles} max={TAXONOMY_LIMITS.styles} t={t} onMaxReached={() => setMaxSelectMessage(t("profileDetails.maxSelectHint").replace("{max}", String(TAXONOMY_LIMITS.styles)))} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium">{t("settings.education")} ({t("profileDetails.optional")})</label>
                            <button type="button" onClick={addEducation} className="text-sm text-zinc-600 hover:text-zinc-900">{t("settings.addEducation")}</button>
                          </div>
                          <div className="space-y-3">
                            {education.map((e, i) => (
                              <div key={i} className="flex flex-wrap items-end gap-2 rounded border border-zinc-200 p-3">
                                <input type="text" value={e.school ?? ""} onChange={(ev) => updateEducation(i, "school", ev.target.value || null)} placeholder={t("settings.school")} className="min-w-[100px] flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm" />
                                <input type="text" value={e.program ?? ""} onChange={(ev) => updateEducation(i, "program", ev.target.value || null)} placeholder={t("settings.program")} className="min-w-[80px] flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm" />
                                <input type="text" value={typeof e.year === "number" ? String(e.year) : (e.year ?? "")} onChange={(ev) => updateEducation(i, "year", ev.target.value || null)} placeholder={t("settings.year")} className="w-16 rounded border border-zinc-300 px-2 py-1.5 text-sm" />
                                <select value={e.type ?? ""} onChange={(ev) => updateEducation(i, "type", ev.target.value || null)} className="rounded border border-zinc-300 px-2 py-1.5 text-sm">
                                  <option value="">Type</option>
                                  {TAXONOMY.educationTypeOptions.map((o) => (
                                    <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => removeEducation(i)} className="text-zinc-500 hover:text-zinc-800">{t("settings.remove")}</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Collector module */}
                  {(roles.includes("collector") || mainRole === "collector") && (
                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                        {t("profileDetails.collectorModule")}{" "}
                        <span className="text-xs font-normal text-zinc-500">({t("profileDetails.recommended")})</span>
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Price band ({t("profileDetails.optional")})</label>
                          <select value={priceBand} onChange={(e) => setPriceBand(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2">
                            <option value="">Select</option>
                            {TAXONOMY.priceBandOptions.map((o) => (
                              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Acquisition channels ({t("profileDetails.optional")})</label>
                          <TaxonomyChipSelect options={TAXONOMY.acquisitionChannelOptions} value={acquisitionChannels} onChange={setAcquisitionChannels} max={TAXONOMY_LIMITS.acquisitionChannels} t={t} onMaxReached={() => setMaxSelectMessage(t("profileDetails.maxSelectHint").replace("{max}", String(TAXONOMY_LIMITS.acquisitionChannels)))} />
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Curator/Gallerist module */}
                  {(roles.includes("curator") || roles.includes("gallerist") || mainRole === "curator" || mainRole === "gallerist") && (
                    <section>
                      <h3 className="mb-2 text-sm font-semibold text-zinc-800">
                        {t("profileDetails.curatorModule")}
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Affiliation ({t("profileDetails.optional")})</label>
                          <select value={affiliation} onChange={(e) => setAffiliation(e.target.value)} className="w-full rounded border border-zinc-300 px-3 py-2">
                            <option value="">Select</option>
                            {TAXONOMY.affiliationOptions.map((o) => (
                              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Program focus ({t("profileDetails.optional")})</label>
                          <TaxonomyChipSelect options={TAXONOMY.themeOptions} value={programFocus} onChange={setProgramFocus} max={TAXONOMY_LIMITS.programFocus} t={t} onMaxReached={() => setMaxSelectMessage(t("profileDetails.maxSelectHint").replace("{max}", String(TAXONOMY_LIMITS.programFocus)))} />
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && (
              <p className="text-sm text-green-600">{t("settings.saveSuccess")}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </form>
        )}
      </main>
    </AuthGate>
  );
}
