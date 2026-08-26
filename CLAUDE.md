# CLAUDE.md — Blytz Clothing Capstone

Context file for Claude Code. Read this before touching any file.

---

## Project Overview

**Title:** A Web-Based Mock-Up Customization System to Reduce Design Revisions at Blytz Clothing
**Type:** Undergraduate BS Information Technology capstone — Central Mindanao University
**Authors:** Catane, Jugos, Rebojo
**Client:** Blytz Clothing (custom apparel printing, Malaybalay, Bukidnon)
**GitHub:** `tefanie-j/Blytz-Cothing-Capstone`

The system lets customers create rough apparel design drafts (mock-ups) before any artist gets involved. The draft is not a final print-ready file — it is a visual reference that aligns customer intent with the artist's starting point, reducing revision cycles. The paper and system are two deliverables of the same project; keep them consistent.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS (Tailwind CSS + custom), JavaScript (vanilla) |
| Canvas editor | Fabric.js 5.3.0 |
| Backend (planned) | Python + Django (MVT pattern) |
| Database | MySQL |
| Background removal | remove.bg API (or compatible, via Django backend) |
| AI design suggestions | Gemini API (via Django backend, structured JSON output) |
| Auth | Django session auth (Staff/Admin only — customers are guests) |
| Deployment | VPS, Ubuntu 22.04, Nginx + Gunicorn, Let's Encrypt SSL |
| Notifications | Facebook Messenger integration (chat widget on frontend) |
| Unit testing | Jest |
| Integration testing | Postman + Selenium |

---

## User Roles

| Role | Access |
|---|---|
| **Customer** | Guest — no login/registration. Accesses the public-facing editor and submit form only. |
| **Staff** | Login required. Views submissions, updates order status, manages inquiries via dashboard. |
| **Admin** | Login required. All Staff permissions + user account management (create/edit/deactivate staff). |

> **Important:** `login.html` and `register.html` in the current prototype simulate auth but are frontend-only demos. When Django is wired in, login/register should be **Staff/Admin only**. Customers never log in. The `register.html` page may be repurposed as an admin-only "create staff account" form, or removed in favour of admin dashboard user management (UC-16).

---

## Repository File Map

```
/
├── index.html          Landing page (business info, testimonials, social links)
├── design.html         Step 1 — Garment selection + design prompt input
├── editor.html         Step 2 — Fabric.js canvas editor (NEW — see below)
├── review.html         Step 3 — Final preview + submission form
├── login.html          Staff/Admin login (currently demo only)
├── register.html       Account creation (currently demo only — see note above)
│
├── css/
│   ├── style.css       Global styles, CSS variables, auth pages, landing page
│   ├── studio.css      Shared studio styles (design.html, editor.html, review.html)
│   └── editor.css      Editor-specific layout (NEW — only loaded on editor.html)
│
└── js/
    ├── script.js       Global JS — toast, mobile nav, smooth scroll, form validation,
    │                   login/register demo handlers, testimonials carousel
    ├── studio.js       Shared studio logic — state management, garment SVGs, design
    │                   brief renderer, progress steps, review page renderer,
    │                   design.html prompt system, OLD div-based editor (inactive)
    └── fabric-editor.js  Fabric.js canvas editor (NEW — replaces the div-based
                          initEditorPage() in studio.js for editor.html)
```

---

## Architecture — Three Pages, One State Object

All three studio pages (`design.html` → `editor.html` → `review.html`) share a single state object persisted in `localStorage` under the key `'visualizeDesignState'`. Every page reads it on load, writes to it on action, and the next page picks up where the last left off.

### State schema (`studio.js → defaultState()`)

```javascript
{
  garmentType: '',           // 'tshirt' | 'hoodie' | 'longsleeve' | 'polo'
  fit: '',                   // 'Female' | 'Male' | 'Unisex' | 'Kids'
  color: '#0B0B0E',          // hex string
  colorName: 'Black',
  promptMode: 'overall',     // 'overall' | 'individual'
  overall: {                 // used when promptMode === 'overall'
    front: null, back: null, frontBack: null  // string prompts or null
  },
  individual: {              // used when promptMode === 'individual'
    front: [], back: []      // [{areaId, label, prompt}]
  },
  frontObjects: [],          // canvas object schema array — front side
  backObjects:  [],          // canvas object schema array — back side
  designStatus: 'draft',     // 'draft' | 'submitted'
  currentSide: 'front'       // 'front' | 'back'
}
```

### Canvas object schema (element of `frontObjects` / `backObjects`)

Every object on the Fabric.js canvas round-trips through this plain-data shape.
`review.html`'s `staticObjDiv()` reads this shape directly for its CSS-based preview — **do not change field names without updating staticObjDiv too**.

```javascript
{
  id:       string,           // uid()
  name:     string,           // display label
  type:     'text' | 'image' | 'shape' | 'drawing',
  x:        number,           // pre-rotation top-left x  (schema convention)
  y:        number,           // pre-rotation top-left y
  width:    number,
  height:   number,
  rotation: number,           // degrees
  opacity:  number,           // 0.05–1
  visible:  boolean,

  // Only one of these is present depending on type:
  text: {
    content: string, font: string, size: number, weight: string,
    italic: boolean, color: string, align: string, letterSpacing: number
  },
  image: {
    src: string,              // base64 data URL or remote URL
    clipRect?: {              // present only when crop has been applied
      left: number, top: number, width: number, height: number
    }
  },
  shape: {
    shapeType: 'rect' | 'circle' | 'triangle' | 'star' | 'line',
    fill: string, stroke: string, strokeWidth: number, borderRadius: number
  },
  drawing: {
    pathData:    array,       // Fabric.js raw path command array
    stroke:      string,
    strokeWidth: number
  }
}
```

### Rotation fix (center origin)

Fabric's default `originX/Y = 'left'/'top'` means `fo.left`/`fo.top` describe where the corner sits **after** rotation is applied — a corner orbits the center as the object spins. `review.html`'s `staticObjDiv()` uses `left/top` + CSS `rotate()`, which rotates around the CSS center, so its `x`/`y` mean "pre-rotation top-left corner." These two conventions only agree when `angle === 0`.

**Fix (in `fabric-editor.js`):** all non-drawing objects use `originX: 'center', originY: 'center'`. `schemaToFabric()` converts schema `x/y` (top-left) → Fabric center by adding `width/2, height/2`. `fabricToSchema()` reverses this. Paths (`drawing` type) are excluded — they use the default left/top origin because path coordinate spaces don't map cleanly to center-origin math.

---

## Shared Globals from `studio.js`

These are available to `fabric-editor.js` because `studio.js` loads first.

| Global | Value / Purpose |
|---|---|
| `CANVAS_W` | `380` — canvas width in px |
| `CANVAS_H` | `480` — canvas height in px |
| `SHIRT_AREA` | `{ x: 60, y: 30, width: 260, height: 420 }` — printable shirt region |
| `loadState()` | Reads state from localStorage |
| `saveState(s)` | Writes state to localStorage |
| `defaultState()` | Returns a blank state object |
| `uid()` | Generates a short unique ID |
| `esc(str)` | HTML-escapes a string |
| `showToast(msg, type)` | Shows a toast notification |
| `hasAnyPrompts(state)` | Returns true if at least one design prompt exists |
| `seedEditorObjects(state)` | Populates `frontObjects`/`backObjects` with starter objects if empty |
| `renderProgressSteps(active)` | Renders the 3-step progress indicator in the studio header |
| `renderDesignBrief(state)` | Renders the prompt summary into `#designBrief` |
| `garmentSVG(type, hex, w?, h?)` | Returns the SVG silhouette for a garment type + color |
| `staticObjDiv(obj)` | Returns an HTML string rendering a schema object as a CSS div (used by review.html) |
| `GARMENT_TYPES`, `FITS`, `COLORS`, `FRONT_AREAS`, `BACK_AREAS` | Config arrays |

> **Do not rename or remove these globals.** `design.html`, `editor.html`, and `review.html` all depend on them.

---

## Backend Integration Points (Django)

All of these are currently stubs or frontend-only simulations. Search the codebase for `TODO(FR-` to find each one.

### FR-03 / UC-04 — Background Removal
- **Where:** `fabric-editor.js` → `pfRemoveBg` click handler
- **What to build:** POST the selected image's base64/blob to a Django view → forward to remove.bg API → return transparent PNG → swap image on Fabric canvas via `fabric.Image.fromURL`
- **DFD note:** Background removal is client-initiated and does NOT flow through the submission database (per Level 1 DFD). Only the final canvas JSON is stored.

### FR-15 / FR-16 / UC-20 — AI Design Suggestion (Gemini API)
- **Where:** No frontend UI built yet — needs a new panel/modal on `editor.html`
- **What to build:**
  1. UI: prompt input textarea, optional image upload, garment type auto-filled from state, prompting mode (full-canvas or area-specific)
  2. Django view: compile structured prompt payload → call Gemini API with schema enforcement → validate returned JSON → return to frontend
  3. Frontend: receive canvas-compatible JSON → call `canvas.loadFromJSON()` or iterate and add objects → customer refines manually
- **Output schema the AI must return** (enforce via Gemini's response schema / system prompt):
  ```json
  {
    "objects": [
      { "type": "text|shape|image_placement",
        "x_pct": 0.5, "y_pct": 0.3,
        "text": "...", "fill": "#hex",
        "shapeType": "rect|circle|...",
        "width_pct": 0.4, "height_pct": 0.2 }
    ],
    "backgroundColor": "#hex",
    "palette": ["#hex", "#hex"],
    "theme": "string"
  }
  ```
  Percentages are relative to `CANVAS_W`/`CANVAS_H` so they're resolution-independent.
- **Paper reference:** Ch. IV.6.e (AI pipeline — all 8 sub-stages), FR-15, FR-16, UC-20, UC-21

### FR-08 / FR-09 / UC-10 — Submission + Database Storage
- **Where:** `review.html` → Submit button → currently shows a `#successOverlay` with no real POST
- **What to build:** Django view that receives `canvas_json`, `customer details`, `reference_image_url`, `design_prompt`, `ai_suggestion_json`, `selected_palette`, `selected_theme`, `ai_used` flag → inserts into `submissions` + `customers` tables → triggers staff notification → returns submission ID
- **Notification:** FR-10 — trigger Messenger notification or email to staff after successful insert

### FR-10 / UC-10 — Staff Notification
- **Where:** same submission view as above
- **What to build:** On successful submission, notify staff. Options: send a Facebook Messenger API message to the business page, or send a Django email via `send_mail`. Wire whichever Blytz Clothing prefers.

### FR-11–FR-13 / UC-11–UC-15 — Admin Dashboard
- **Where:** Not yet built (no `dashboard.html`)
- **What to build:** Authenticated Django views (Staff/Admin only) for:
  - Submission list with search, filter, sort (paginated)
  - Submission detail — reconstruct canvas from stored `canvas_json` using a read-only Fabric canvas
  - Status update (Received → In Design → Approved → In Production)

### FR-14 — Authentication (Django)
- **Where:** `login.html` (currently demo), `register.html` (currently demo)
- **What to build:** Django `LoginView` + session auth. Staff/Admin only. No customer login. `register.html` → repurpose as admin-only "create staff account" form OR remove and handle user creation only through the dashboard's user management module (UC-16).

---

## Database Tables (MySQL)

Four tables. Full schema in paper Appendix K.

| Table | Purpose |
|---|---|
| `customers` | Stores submitting customer details (name, email, phone) |
| `submissions` | Stores every mock-up draft (canvas JSON, status, AI fields) |
| `order_statuses` | Lookup table — "Received", "In Design", "Approved", "In Production" |
| `users` | Staff/Admin accounts with bcrypt-hashed passwords and role field |

Django models should map 1:1 to these tables. Use Django's ORM — avoid raw SQL except for migrations.

---

## Things Left to Build (Priority Order)

### Phase 1 — Django project scaffold
- [ ] `django-admin startproject blytz_clothing`
- [ ] Create apps: `studio` (customer-facing), `dashboard` (staff/admin), `api` (internal endpoints)
- [ ] Configure MySQL in `settings.py` (`mysqlclient` or `PyMySQL`)
- [ ] Write Django models for `customers`, `submissions`, `order_statuses`, `users`
- [ ] Run migrations
- [ ] Set up Django Templates to serve existing HTML files (replace `href` paths with `{% url %}`)
- [ ] Configure static files (`STATICFILES_DIRS` → serve `css/`, `js/`)
- [ ] Set up Gunicorn + Nginx config for VPS deployment

### Phase 2 — Submission flow (most critical path)
- [ ] `POST /api/submit/` Django view — receives canvas JSON + customer details, inserts DB rows
- [ ] Update `review.html` submit button to POST to this endpoint instead of showing demo overlay
- [ ] Return submission ID to frontend, show real success state
- [ ] Staff notification on submission (Messenger or email)

### Phase 3 — Auth + Admin dashboard
- [ ] Django `LoginView` wired to `login.html` form
- [ ] Session middleware protecting dashboard URLs
- [ ] Dashboard: submission list view (paginated, search, filter by status)
- [ ] Dashboard: submission detail view (read-only Fabric canvas reconstructed from `canvas_json`)
- [ ] Dashboard: status update endpoint (`PATCH /api/submissions/<id>/status/`)
- [ ] Dashboard: user management (UC-16 through UC-19 — add/edit/deactivate staff accounts)

### Phase 4 — Background removal (FR-03 / UC-04)
- [ ] Django view: `POST /api/remove-bg/` — receives image, calls remove.bg API, returns transparent PNG
- [ ] Wire `pfRemoveBg` button in `fabric-editor.js` to this endpoint (replace current stub)
- [ ] Handle API quota errors gracefully on frontend

### Phase 5 — AI design suggestion (FR-15 / FR-16 / UC-20)
- [ ] Design the prompt input UI panel on `editor.html`
- [ ] Django view: `POST /api/ai-suggest/` — compile structured prompt → call Gemini API → validate JSON response → retry on malformed output → return to frontend
- [ ] Frontend: receive suggestion JSON → render onto Fabric canvas → allow accept/refine/cancel
- [ ] Store prompt + suggestion in `submissions` table fields (`design_prompt`, `ai_suggestion_json`, `ai_used`)

### Phase 6 — Testing
- [ ] Jest unit tests: coordinate calculations, schema conversion functions, auto-layout logic, AI JSON parsing
- [ ] Postman collection: submission API, background removal API, status update
- [ ] Selenium: end-to-end customer workflow (upload → edit → submit), staff workflow (login → view → update status)
- [ ] UAT with 5 customers + 3 staff of Blytz Clothing using five-point Likert scale questionnaire (SUS as usability instrument)

### Phase 7 — Deployment
- [ ] VPS setup: Ubuntu 22.04, 2 GB RAM, 20 GB SSD
- [ ] Nginx reverse proxy config
- [ ] Gunicorn service file
- [ ] MySQL daily backup cron
- [ ] Let's Encrypt SSL (`certbot`)
- [ ] Staged rollout: internal → limited (existing Blytz customers) → full public via Facebook page

---

## Paper ↔ Code Alignment Notes

These are the spots where the paper makes specific claims that the code must honour.

| Paper claim | Code requirement |
|---|---|
| "system does not train or fine-tune any AI model" (Ch. I.4, Ch. III.8) | AI integration = API calls only. No model weights, no fine-tuning code anywhere in the repo. |
| "background removal is a client-side trigger, not part of the submission data flow" (DFD Level 1) | The removed-bg PNG goes onto the canvas; only the final `canvas_json` is stored in DB. No separate bg-removal record in the database. |
| "AI output is loaded directly onto the Fabric.js canvas" (UC-20, UC-21) | AI suggestion must render onto the live canvas via `canvas.loadFromJSON()` or equivalent — not just displayed as text. |
| "client-side security techniques are deterrents only" (Ch. I.4 Limitations) | Right-click disable and keyboard shortcut blocking are already wired. Do not remove them, but do not overclaim they are cryptographically secure. |
| "admin dashboard with role-based access" (UC-16) | Django views must check `request.user.role` — both 'staff' and 'admin' see submissions; only 'admin' sees user management. |
| "submission stores canvas_json, design_prompt, ai_suggestion_json, selected_palette, selected_theme, ai_used" (Ch. IV.6.c) | These are all columns in the `submissions` table. The POST endpoint must accept and store all of them. |
| UAT acceptance criterion: mean Likert score ≥ 4.0 / 5.0 | System must be usable by non-designers without assistance. Keep the editor beginner-friendly. |

---

## Conventions

- **Language:** Python (backend), vanilla JS (frontend — no React, no Vue, no bundler)
- **No framework JS:** Fabric.js and Tailwind CSS (CDN) are the only frontend dependencies
- **Comments:** Mark every unimplemented backend integration with `// TODO(FR-XX)` so grep finds them
- **No raw SQL:** Use Django ORM for all DB operations
- **Passwords:** bcrypt via Django's default `make_password` / `check_password` (PBKDF2 with SHA256 by default, acceptable)
- **API keys:** Never commit API keys. Use Django `settings.py` with environment variables (`python-decouple` or `os.environ`)
- **File uploads:** Store uploaded reference images on server filesystem or object storage (S3-compatible). Store URL in `reference_image_url` column. Do not store raw base64 in the database.
- **canvas_json size:** Fabric canvas JSON with images embedded as base64 can get very large. Before going to production, strip image data from `canvas_json` and store images separately; keep only the URL reference in the JSON.

---

## What Not to Touch

| File | Why |
|---|---|
| `studio.js` | Shared globals depended on by all three studio pages. Only add to it — do not rename or remove existing exports. |
| `studio.css` | Shared styles. Add editor-only styles to `editor.css` instead. |
| `review.html` static rendering | `staticObjDiv()` reads the canvas object schema directly. The schema field names must stay stable. |
| Canvas object schema field names | `review.html` and any future Django serializers depend on these exact names. |
