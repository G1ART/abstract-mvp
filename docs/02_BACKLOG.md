# Abstract — Backlog (Pain point → options)

## P0 — reduce artist onboarding friction (highest ROI)

### 1) “Uploading 100–500 works is too slow”
Pain:
- Artists with large catalogs won’t complete onboarding if each piece requires full metadata.

Options:
A) Bulk Image Upload v1 (fast)
- Drag/drop multiple images → create N draft artworks (title=filename, common defaults)
- Quick edit per item
Acceptance:
- Upload 20 images in <2 minutes; drafts appear in /me immediately.

B) Presets / “apply to all”
- During bulk flow, set year/medium/ownership/pricing defaults and apply to all
Acceptance:
- User can set defaults once and not repeat per item.

C) CSV metadata import (filename match)
- Upload images + upload CSV to map filename → title/year/medium/size/price/ownership
Acceptance:
- 50 items mapped with >90% correct matching (by filename).

### 2) “I don’t know my price / I prefer inquiry”
Pain:
- Artists avoid listing prices or want “문의” mode.

Options:
A) pricing_mode = inquire (already)
- Ensure UI clarity: “Price upon request”
B) Add optional “contact preference” (later)
- CTA: website/email/DM placeholder (no messaging MVP)
Acceptance:
- Inquiry mode requires zero price input; still publishable.

### 3) “Repeated fields are annoying (medium/size/year)”
Options:
A) Field memory per session (localStorage)
B) “Use last values” toggle in upload form
C) Batch edit on /me drafts
Acceptance:
- A user can publish 10 similar works with minimal typing.

---

## P1 — discovery & social proof

### 4) “I need better discovery than a flat feed”
Options:
A) Filters: medium/year/availability/pricing_mode
B) Artist tags/roles surfaced in feed
C) Trending artists (by likes/views deltas)
Acceptance:
- Users can find relevant works in <30 seconds with filters.

### 5) “I want collector signals without making it a marketplace”
Options:
A) Favorites/Collections (private boards)
B) “Save” separate from Like (later)
Acceptance:
- Users can save works without inflating public popularity.

---

## P1 — trust & safety

### 6) “Private profile must be safe but still resolvable”
Current:
- RPC lookup_profile_by_username returns limited info for private profiles.

Options:
A) Keep RPC pattern; extend only with non-sensitive fields
B) Add “Request access” placeholder (no messaging MVP)
Acceptance:
- Private profile never leaks sensitive fields; UX clearly indicates private.

---

## P2 — imports (web/pdf/ppt) (harder but valuable)

### 7) “Import from PDF/PPT/website”
Pain:
- Artists already have portfolios elsewhere; re-entry is costly.

Options:
A) PPTX import (semi-structured)
- Extract slide images + text boxes as caption candidates → user confirms
B) PDF import (semi-automatic)
- Extract page images + nearby text → user selects
C) Website import (best-effort)
- URL → image/caption candidates; user approves
Acceptance:
- User can create 20 drafts from one file in <10 minutes with manual confirmation.

---

## De-scoped for MVP (not now)
- Payments/checkout/offers
- Messaging/DM
- Inventory/fulfillment
- AI price suggestions (later)
