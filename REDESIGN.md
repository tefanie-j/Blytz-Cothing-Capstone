# Interface Redesign Spec — Chat-First Design Flow

## Overview

The current three-page linear funnel (`design.html` → `editor.html` → `review.html`) is being redesigned. The AI prompt experience is replaced by a **chat interface** modelled on LLM tools (Claude, ChatGPT). The Fabric.js manual editor and the review/submit page remain largely unchanged; only how customers reach them changes.

**New flow:**

```
Chat interface  →  (pick a design)  →  Manual editor  →  Review & Submit
     ↑___________________________|
           (back to reprompt)
```

Both the chat interface and the manual editor have a **Finalize** button that leads to `review.html`.

---

## Files Affected

| File | Change |
|---|---|
| `design.html` | **Full rewrite** — becomes the chat interface |
| `js/studio.js` | **Add** conversation history to shared state; keep all existing helpers |
| `editor.html` | **Add** Back to Chat button + Finalize button; everything else unchanged |
| `js/fabric-editor.js` | **Add** handlers for the two new buttons above |
| `review.html` | No change |
| `css/style.css` | No change |
| `css/studio.css` | Minor additions for new chat components |
| `css/editor.css` | Minor additions for new buttons |

---

## 1. Chat Interface — `design.html`

### Layout

Full-viewport, no sidebar. Three vertical zones:

```
┌─────────────────────────────────────────────────┐
│  HEADER (52px)                                  │
│  brand   progress steps   [Skip to Editor →]    │
├─────────────────────────────────────────────────┤
│                                                 │
│  THREAD AREA  (flex-grow, overflow-y: auto)     │
│  Scrollable chat history                        │
│  Anchored to bottom on new messages             │
│                                                 │
│  Empty state (first visit):                     │
│  Large centred prompt — "Describe the design    │
│  you have in mind."  + example chips            │
│                                                 │
├─────────────────────────────────────────────────┤
│  INPUT DOCK  (auto height, max ~180px)          │
│  ┌───────────────────────────────────────────┐  │
│  │  Describe your design...                  │  │
│  │                                           │  │
│  │  [📎] [👕 T-Shirt ▾] [🎨 ● Black ▾]  [↑] │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Header

- Brand logo left
- 3-step progress indicator centre (Step 1 active: "Design", Step 2: "Edit", Step 3: "Review")
- **"Skip to Editor →"** button right — loads the manual editor with a blank canvas (no AI required)

### Thread Area

Messages appear in chronological order, newest at the bottom. Auto-scrolls to bottom on each new message.

**Message types:**

#### Customer message (right-aligned)
```
                    ┌────────────────────────────────┐
                    │ A mountain-themed jersey for a  │
                    │ basketball team, dark green and │
                    │ gold. Include number 23.        │
                    │                                 │
                    │  [image thumbnail if attached]  │
                    └────────────────────────────────┘
```
- Background: subtle violet-tinted card
- If a reference image was attached, show a small thumbnail (max 60×60px) in the bottom-right corner of the message bubble

#### AI thinking indicator (shown while generating)
```
  ●  Generating 4 designs...
     [animated pulse dots]
```

#### AI response — 2×2 design grid
```
  ●  Here are 4 designs based on your prompt.
     Click one to select it.

     ┌──────────┐  ┌──────────┐
     │  [shirt] │  │  [shirt] │
     │  Design 1│  │  Design 2│
     └──────────┘  └──────────┘
     ┌──────────┐  ┌──────────┐
     │  [shirt] │  │  [shirt] │
     │  Design 3│  │  Design 4│
     └──────────┘  └──────────┘

     [Finalize Selected Design →]   ← appears after one is selected
```

Each shirt preview cell:
- Shows the garment silhouette (from `garmentSVG()`) with design elements rendered on top
- Small Fabric.js canvas (or static CSS rendering) inside each cell
- Click → selected state (violet border, subtle glow)
- On selected cell only: hovering reveals **"Edit in Editor"** button overlaid on the preview
- The **"Finalize Selected Design →"** button appears below the grid only after a selection is made

#### System / error message
```
  ●  Couldn't generate designs — the AI service is temporarily unavailable.
     Try again or open the manual editor.
```

### Input Dock

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Describe your design...                            │
│                                                     │
│  [📎 Attach]  [👕 T-Shirt ▾]  [● Black ▾]    [↑]  │
└─────────────────────────────────────────────────────┘
```

**Textarea:**
- Auto-grows from ~1 line to max ~5 lines as customer types
- `Enter` = new line; `Shift+Enter` or send button = submit
- Placeholder: `"Describe your design..."`

**Attach button (📎):**
- Opens file picker (image/*)
- Attached image shows as a small removable thumbnail chip above the textarea
- Only one image per message
- Image is included in the API request alongside the text prompt

**Garment type picker (👕 T-Shirt ▾):**
- Small pill-style dropdown, inline in the bottom bar
- Options: T-Shirt, Polo, Jersey, Hoodie, Long Sleeve (matching existing `GARMENT_TYPES`)
- Changing the garment type does NOT clear the conversation — it applies to the next generation
- Currently selected type is shown on the pill

**Color picker (● Black ▾):**
- Small pill-style dropdown inline in the bottom bar
- Shows a filled circle in the current color + color name
- Options from the existing `COLORS` array in `studio.js`
- Changing color does NOT clear the conversation

**Send button (↑):**
- Disabled when textarea is empty
- On submit: appends customer message to thread, clears input, shows AI thinking indicator, fires API request

---

## 2. The 4-Design Grid — Technical Implementation

### What the AI returns

A single API call returns **4 independent canvas JSON configs** in one response. The system prompt must instruct the AI to return exactly this structure:

```json
{
  "designs": [
    {
      "id": "d1",
      "label": "Design 1",
      "objects": [
        {
          "type": "text",
          "content": "TEAM NAME",
          "x_pct": 0.5, "y_pct": 0.25,
          "width_pct": 0.6, "height_pct": 0.12,
          "font": "Inter", "size": 28, "weight": "700",
          "color": "#F6F4EF", "align": "center"
        },
        {
          "type": "shape",
          "shapeType": "rect",
          "x_pct": 0.2, "y_pct": 0.6,
          "width_pct": 0.6, "height_pct": 0.05,
          "fill": "#D4AF37", "stroke": "transparent", "strokeWidth": 0
        }
      ],
      "backgroundColor": "#1B3A2D",
      "palette": ["#1B3A2D", "#D4AF37", "#F6F4EF"],
      "theme": "mountain-sports"
    },
    { "id": "d2", ... },
    { "id": "d3", ... },
    { "id": "d4", ... }
  ]
}
```

All positions use **percentages of CANVAS_W (380) and CANVAS_H (480)** so they're resolution-independent. Convert: `x_px = x_pct * CANVAS_W`.

### Rendering each preview

Each of the 4 cells contains a small Fabric.js canvas (or a static CSS rendering). Recommended approach: render all 4 as small Fabric.js canvases at reduced scale (e.g., 190×240, half of 380×480). Use CSS `transform: scale(0.5)` on a full-size canvas if small canvases cause Fabric issues.

Each canvas:
1. Render the garment SVG as the background (from `garmentSVG()`)
2. Parse the design's `objects` array → convert percentage coords to pixel coords → add to Fabric canvas using the same `schemaToFabric()` logic from `fabric-editor.js`

### Selecting a design

Click a cell → add `selected` class (violet border, shadow). Click again or click another → swap selection. Only one selection at a time within a response group.

On selection:
- Show **"Edit in Editor"** button as a hoverable overlay on that cell
- Show **"Finalize Selected Design →"** button below the 2×2 grid

### Loading into the manual editor

When customer clicks "Edit in Editor":
1. Convert the selected design's `objects` from percentage coords → pixel coords → canvas object schema format
2. Write to `state.frontObjects` via `saveState()`
3. Also save the `garmentType`, `color`, and `selectedDesignId` to state
4. Navigate to `editor.html`

---

## 3. Conversation State

Add these fields to the shared state object in `studio.js → defaultState()`:

```javascript
{
  // ... existing fields ...

  // Chat interface state
  conversationHistory: [],   // [{role: 'user'|'assistant', content, attachedImage?, designs?}]
  selectedDesignId: null,    // id string of the currently selected design ('d1'–'d4')
  selectedDesignObjects: [], // the objects array of the selected design, pixel coords
  garmentType: 'tshirt',     // already existed — used by garment picker
  color: '#0B0B0E',          // already existed — used by color picker
}
```

`conversationHistory` is the array passed to the AI API on every turn so it has full context. Each entry:

```javascript
// User turn
{ role: 'user', content: 'A mountain-themed jersey...', imageBase64: null }

// Assistant turn (with designs)
{ role: 'assistant', content: 'Here are 4 designs...', designs: [...] }
```

The `designs` array on assistant turns is what re-renders the 2×2 grid when the conversation is scrolled.

---

## 4. Manual Editor Changes — `editor.html` + `fabric-editor.js`

Two buttons added to the editor topbar:

```
[← Back to Chat]   brand   [Front|Back]   undo redo   zoom   [Finalize →]
```

**Back to Chat (`← Back to Chat`):**
- Persists current canvas state via `persist()`
- Navigates to `design.html`
- Conversation history is preserved in state — the customer returns to the same chat thread

**Finalize (`Finalize →`):**
- Persists current canvas state
- Sets `state.designStatus = 'finalizing'`
- Navigates to `review.html`

The existing "Review & Confirm →" button in `fabric-editor.js` becomes this Finalize button (rename label and update status flag).

---

## 5. Finalize from the Chat Interface

When "Finalize Selected Design →" is clicked from the chat thread:
1. The selected design's objects (pixel coords) are written to `state.frontObjects`
2. `state.designStatus = 'finalizing'`
3. Navigate to `review.html`

`review.html` reconstructs the design from `state.frontObjects` as it already does — no changes needed there.

---

## 6. Empty State and Example Prompts

On first load (no conversation history), show a centred welcome state in the thread area:

```
        [Brand mark]

   What are you designing today?

   Describe your garment idea and the AI will
   generate 4 design concepts to choose from.

   ┌──────────────────┐  ┌──────────────────┐
   │ Basketball jersey│  │ Corporate polo   │
   │ — sporty, bold   │  │ — minimal, clean │
   └──────────────────┘  └──────────────────┘
   ┌──────────────────┐  ┌──────────────────┐
   │ Event shirt      │  │ School uniform   │
   │ — festive, fun   │  │ — formal, neat   │
   └──────────────────┘  └──────────────────┘
```

Clicking an example chip fills the textarea with a starter prompt.

---

## 7. "Skip to Editor" Flow

Header button — `[Skip to Editor →]`:
- Calls `seedEditorObjects(state)` to ensure `frontObjects`/`backObjects` are initialized
- Navigates directly to `editor.html`
- No conversation history required
- In the editor, "Back to Chat" still works — returns to an empty or existing chat

---

## 8. AI API Integration Notes

### Endpoint (Django backend)
`POST /api/ai-suggest/`

**Request body:**
```json
{
  "history": [...],         // full conversationHistory array
  "garmentType": "jersey",
  "color": "#1B3A2D",
  "imageBase64": "..."      // optional, current message only
}
```

**Response:**
```json
{
  "designs": [...],         // array of 4 design objects (see schema above)
  "message": "Here are 4 designs based on your prompt."
}
```

### System prompt to send to the AI

The Django view constructs the system prompt. Key constraints to enforce:

- Return exactly 4 designs in the `designs` array
- All positions as percentages of canvas (0.0–1.0)
- Text size in pixels (6–80 range)
- Colors as hex strings
- No images in output (image placement suggestions are text only at this stage)
- If the customer refers to a previous design, use the prior assistant turn's designs as context
- Response must be valid JSON matching the schema — no markdown, no prose outside the `message` field

### Output validation + retry

Validate the returned JSON before sending to frontend:
- Exactly 4 entries in `designs`
- Each entry has `id`, `objects`, `backgroundColor`, `palette`
- All `x_pct`, `y_pct`, `width_pct`, `height_pct` values between 0 and 1
- Retry up to 3 times on malformed response
- If all retries fail, return an error message the frontend displays in the thread

---

## 9. Styling Notes

Reuse existing CSS variables from `style.css`:
- `--bg-0: #0B0B0E` — page background
- `--violet: #7A5CFF` — selection accent, send button
- `--paper: #F6F4EF` — text
- `--line: rgba(246,244,239,.1)` — borders

New components to style (add to `studio.css` or a new `chat.css`):
- `.chat-shell` — full-viewport flex column
- `.chat-thread` — scrollable message list, padding bottom for input dock height
- `.chat-message.user` — right-aligned bubble
- `.chat-message.ai` — left-aligned, no bubble (open layout)
- `.design-grid` — 2×2 CSS grid, gap 12px
- `.design-cell` — individual preview card, border-radius, overflow hidden
- `.design-cell.selected` — violet border + box-shadow glow
- `.design-cell-overlay` — absolute overlay on selected cell, shows "Edit in Editor" button on hover
- `.chat-input-dock` — sticky bottom, backdrop-blur background
- `.chat-input-bar` — textarea + bottom row with pickers and send button
- `.garment-picker`, `.color-picker` — pill-style inline dropdowns
- `.send-btn` — circle button, violet, disabled state when textarea empty
- `.finalize-bar` — appears below grid after selection; contains "Finalize Selected Design →"

---

## 10. What Does NOT Change

- `fabric-editor.js` canvas logic (tools, crop, undo/redo, layers, properties panel)
- `editor.css` layout
- `review.html` and its rendering logic
- `studio.js` shared helpers (`garmentSVG`, `staticObjDiv`, `uid`, `esc`, `showToast`, etc.)
- The canvas object schema — field names must remain stable
- The rotation fix (center origin) in `schemaToFabric` / `fabricToSchema`
- `CANVAS_W`, `CANVAS_H`, `SHIRT_AREA` constants

---

## 11. Implementation Order

1. **State:** Add `conversationHistory`, `selectedDesignId`, `selectedDesignObjects` to `defaultState()` in `studio.js`
2. **Chat UI skeleton:** Rewrite `design.html` — layout, thread area, input dock (no API calls yet)
3. **Garment + color pickers:** Wire inline selectors in input dock to state
4. **Message rendering:** Build the message component system (user bubble, AI grid, thinking indicator)
5. **Example chips:** Empty state with clickable starter prompts
6. **Design grid rendering:** Render 4 Fabric.js canvases from a hardcoded mock JSON response
7. **Selection interaction:** Click to select, hover overlay, Finalize button appearance
8. **Load into editor:** Write selected design to state → navigate to `editor.html`
9. **Editor buttons:** Add Back to Chat + Finalize to `editor.html` topbar and wire in `fabric-editor.js`
10. **Django API endpoint:** `POST /api/ai-suggest/` — prompt construction, API call, validation, retry
11. **Wire frontend to real API:** Replace mock JSON with live endpoint
12. **Conversation context:** Pass full `conversationHistory` on each turn so AI has context
13. **Reference image:** Wire attach button, include base64 in API request
14. **Error states:** API unavailable, malformed response, empty prompt validation
