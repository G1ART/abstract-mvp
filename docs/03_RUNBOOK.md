# Abstract — Runbook (How to operate / deploy / recover)

## Local setup (quick)
1) Install deps
- npm install

2) Env
- cp .env.example .env.local
- Fill:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - NEXT_PUBLIC_APP_URL (로컬: `http://localhost:3000`; 배포 시 Vercel에서 프로덕션 URL로 설정)
  - (optional) NEXT_PUBLIC_KRW_TO_USD_RATE
  - 초대 메일 사용 시: SENDGRID_API_KEY, INVITE_FROM_EMAIL

3) Run
- npm run dev
- open http://localhost:3000

## Supabase essentials
### Required tables (current)
- profiles
- follows
- artworks
- artwork_images
- artwork_views
- artwork_likes

### Storage
- bucket: artworks (public)

### RLS approach (high level)
- profiles: SELECT is_public = true OR auth.uid() = id
- follows/artworks/artwork_images/artwork_views/artwork_likes: scoped policies with auth.uid() checks
- Private profile lookup: use security definer RPC returning limited data

### RPC required
- lookup_profile_by_username(p_username text) → jsonb
  - returns minimal fields for public profiles
  - returns {is_public:false} only for private

## Deploy (Vercel)
### One-time
1) Create Vercel project connected to GitHub repo
2) Set Environment Variables in Vercel (Production at minimum):
- **NEXT_PUBLIC_SUPABASE_URL**
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**
- **NEXT_PUBLIC_APP_URL** — 앱 공개 URL (예: `https://abstract-mvp-dxfn.vercel.app`). 위임/초대 이메일 링크의 base로 사용. 없으면 초대 링크가 잘못된 주소로 갈 수 있음.
- (optional) NEXT_PUBLIC_KRW_TO_USD_RATE

  초대 메일(위임·아티스트 초대)을 쓰는 경우 추가:
- **SENDGRID_API_KEY**
- **INVITE_FROM_EMAIL** (예: `Abstract <noreply@your-domain.com>`)

3) Root Directory
- Must be folder containing package.json for Next.js app (usually ".")

### Each deploy
1) Ensure local build passes
- npm run build
- npx tsc --noEmit

2) Commit & push
- git add -A
- git commit -m "release: vX.Y.Z"
- git push

3) Vercel will auto build
- If build fails, use “Redeploy without cache / Clear cache” when needed

## Supabase Auth redirect URLs
Supabase → Authentication → URL Configuration
Add:
- https://<vercel-domain>/auth/callback
Keep localhost if needed:
- http://localhost:3000/auth/callback

## Common failure modes & fixes
### 1) “supabaseUrl is required” during Vercel build
Cause:
- Vercel env vars not set or not applied to Production, or wrong Root Directory
Fix:
- Check Vercel Settings → Environment Variables (Production)
- Redeploy (clear cache)
- Verify Root Directory points to correct Next app

### 2) Next.js build error: useSearchParams must be wrapped in Suspense
Fix:
- Move useSearchParams into client component and wrap with <Suspense> in page.tsx

### 3) Supabase email rate limit exceeded
Fix:
- Use different email temporarily for testing
- For real beta: configure SMTP provider (Resend/SendGrid/etc.)

### 4) RLS blocks public/private distinction
Fix:
- Keep profiles SELECT policy: is_public = true OR auth.uid() = id
- Use RPC for safe “exists but private” feedback

## Rollback (Vercel)
- Vercel → Deployments → pick last good deployment → “Promote” (or redeploy)
- Keep git tags for releases: vX.Y.Z

Supabase RPC 관련 섹션을 조금 더 명확히:
lookup_profile_by_username는 “public이면 확장 필드 포함, private면 is_public:false만 반환”
“함수 변경 시 create or replace가 안 되면 drop 후 create”
그리고 배포 전 체크리스트에 한 줄 추가:
“SQL 변경이 있으면 Supabase SQL Editor에서 적용했는지 확인(배포와 별개)”

