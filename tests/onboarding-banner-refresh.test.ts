// QA 2026-06-29 — 신규 가입 계정의 "한 단계만 더 남았어요" 배너가 저장 후에도
// 사라지지 않고, "내 스튜디오"로 진입할 수 없던 무한 루프.
//
// 원인: RandomIdBanner / Header 가 루트 레이아웃에 상주하면서 프로필을 마운트
// 시 1회만 읽고, 온보딩 저장 후 갱신하지 않았다 (App Router 는 클라이언트
// 이동 시 루트 레이아웃을 리마운트하지 않음).
//
// 픽스: 프로필 저장 SSOT 에서 `profile-updated` 이벤트를 디스패치하고, 배너와
// 헤더가 이를 구독해 재조회한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

// 1) 저장 SSOT 가 성공 시 profile-updated 를 디스패치 ---------------------
const save = read("src/lib/supabase/profileSaveUnified.ts");
assert.match(
  save,
  /dispatchEvent\(new Event\("profile-updated"\)\)/,
  "saveProfileUnified must broadcast profile-updated on success",
);
// guarded for SSR.
assert.match(save, /typeof window !== "undefined"/);

// 2) RandomIdBanner 가 profile-updated + auth 변경에 재조회하고 main_role 도 검사
const banner = read("src/components/RandomIdBanner.tsx");
assert.match(banner, /addEventListener\("profile-updated"/);
assert.match(banner, /onAuthStateChange/);
assert.match(banner, /!mainRole\?\.trim\(\)/, "banner must also gate on main_role");
// must not regress to a mount-only one-shot read.
assert.match(banner, /removeEventListener\("profile-updated"/);

// 3) Header 가 profile-updated 에 프로필(=내 스튜디오 링크) 갱신 ----------
const header = read("src/components/Header.tsx");
assert.match(header, /addEventListener\("profile-updated"/);
assert.match(header, /removeEventListener\("profile-updated"/);

// 4) 온보딩 저장 라우팅이 read-after-write lag 방어 ----------------------
const identity = read("src/app/onboarding/identity/page.tsx");
assert.match(
  identity,
  /freshState\?\.needs_identity_setup/,
  "onboarding submit must defensively re-check after save",
);
assert.match(identity, /completeNow/);

console.log("onboarding-banner-refresh.test.ts: ok");
