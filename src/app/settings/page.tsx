"use client";

import { FormEvent, useEffect, useState, KeyboardEvent } from "react";
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
import { computeProfileCompleteness } from "@/lib/profileCompleteness";

const MAIN_ROLES = ["artist", "collector", "curator", "gallerist"] as const;
const ROLES = [...MAIN_ROLES];
const CAREER_STAGES = ["student", "early", "mid", "established"] as const;
const AGE_BANDS = ["20s", "30s", "40s", "50s", "60plus"] as const;
const EDUCATION_TYPES = ["university", "grad", "art_hs", "art_ms", "other"] as const;
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
};

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const addChip = () => {
    const v = input.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
      setInput("");
    }
  };
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
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={addChip}
        placeholder={placeholder}
        className="min-w-[120px] flex-1 border-0 bg-transparent px-0 py-0 text-sm focus:outline-none focus:ring-0"
      />
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
  const [profileDetailsOpen, setProfileDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile().then(({ data: profile, error: err }) => {
      setLoading(false);
      if (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
        return;
      }
      const p = profile as Profile | null;
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
        setCareerStage(p.career_stage ?? "");
        setAgeBand(p.age_band ?? "");
        setCity(p.city ?? "");
        setRegion(p.region ?? "");
        setCountry(p.country ?? "");
        setThemes((p.themes as string[]) ?? []);
        setMediums((p.mediums as string[]) ?? []);
        setStyles((p.styles as string[]) ?? []);
        setKeywords((p.keywords as string[]) ?? []);
        const ed = (p.education as EducationEntry[] | null) ?? [];
        setEducation(ed.length ? ed : [{ school: "", program: "", year: "", type: null }]);
      }
    });
  }, []);

  const completeness = computeProfileCompleteness({
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

    const eduFiltered = education
      .filter((e) => e.school?.trim())
      .map((e) => ({
        school: e.school?.trim() || null,
        program: e.program?.trim() || null,
        year: e.year?.trim() || null,
        type: e.type || null,
      }));

    const fullProfile = {
      username: username ?? undefined,
      display_name: displayName,
      avatar_url: avatarUrl ?? undefined,
      bio,
      main_role: mainRole,
      roles: finalRoles,
      city: city || undefined,
      region: region || undefined,
      country: country || undefined,
      themes,
      mediums,
      styles,
      education: eduFiltered,
    };
    const score = computeProfileCompleteness(fullProfile);

    setSaving(true);
    const payload: UpdateProfileParams = {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      location: location.trim() || null,
      website: website.trim() || null,
      main_role: mainRole || null,
      roles: finalRoles,
      is_public: isPublic,
      career_stage: careerStage || null,
      age_band: ageBand || null,
      city: city.trim() || null,
      region: region.trim() || null,
      country: country.trim() || null,
      themes: themes.length ? themes : null,
      mediums: mediums.length ? mediums : null,
      styles: styles.length ? styles : null,
      keywords: keywords.length ? keywords : null,
      education: eduFiltered.length ? eduFiltered : null,
      profile_completeness: score,
      profile_updated_at: new Date().toISOString(),
    };
    const { error: err } = await updateMyProfile(payload);
    setSaving(false);

    if (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
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
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.careerStage")}
                    </label>
                    <select
                      value={careerStage}
                      onChange={(e) => setCareerStage(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-3 py-2"
                    >
                      <option value="">Select</option>
                      {CAREER_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.ageBand")}
                    </label>
                    <select
                      value={ageBand}
                      onChange={(e) => setAgeBand(e.target.value)}
                      className="w-full rounded border border-zinc-300 px-3 py-2"
                    >
                      <option value="">Select</option>
                      {AGE_BANDS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t("settings.city")}
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="City"
                        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t("settings.region")}
                      </label>
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="Region"
                        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t("settings.country")}
                      </label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Country"
                        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.themes")} (3+ recommended)
                    </label>
                    <ChipInput
                      values={themes}
                      onChange={setThemes}
                      placeholder="Add theme, press Enter"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.mediums")}
                    </label>
                    <ChipInput
                      values={mediums}
                      onChange={setMediums}
                      placeholder="Add medium, press Enter"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.styles")}
                    </label>
                    <ChipInput
                      values={styles}
                      onChange={setStyles}
                      placeholder="Add style, press Enter"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("settings.keywords")}
                    </label>
                    <ChipInput
                      values={keywords}
                      onChange={setKeywords}
                      placeholder="Add keyword, press Enter"
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium">
                        {t("settings.education")}
                      </label>
                      <button
                        type="button"
                        onClick={addEducation}
                        className="text-sm text-zinc-600 hover:text-zinc-900"
                      >
                        {t("settings.addEducation")}
                      </button>
                    </div>
                    <div className="space-y-3">
                      {education.map((e, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-end gap-2 rounded border border-zinc-200 p-3"
                        >
                          <input
                            type="text"
                            value={e.school ?? ""}
                            onChange={(ev) =>
                              updateEducation(i, "school", ev.target.value || null)
                            }
                            placeholder={t("settings.school")}
                            className="flex-1 min-w-[100px] rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={e.program ?? ""}
                            onChange={(ev) =>
                              updateEducation(i, "program", ev.target.value || null)
                            }
                            placeholder={t("settings.program")}
                            className="flex-1 min-w-[80px] rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={e.year ?? ""}
                            onChange={(ev) =>
                              updateEducation(i, "year", ev.target.value || null)
                            }
                            placeholder={t("settings.year")}
                            className="w-16 rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                          <select
                            value={e.type ?? ""}
                            onChange={(ev) =>
                              updateEducation(
                                i,
                                "type",
                                ev.target.value || null
                              )}
                            className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
                          >
                            <option value="">Type</option>
                            {EDUCATION_TYPES.map((tp) => (
                              <option key={tp} value={tp}>
                                {tp}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeEducation(i)}
                            className="text-zinc-500 hover:text-zinc-800"
                          >
                            {t("settings.remove")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
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
