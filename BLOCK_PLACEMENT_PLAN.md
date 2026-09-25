# Block placement: pin + fill, bigger handles, page contents

Follow-up to `CONLANG_EDGES_PLAN.md` (2026-09-24). Owner request, verbatim
intent: a sign in a *flat* box (a wide, short C2 under a C1 + V) shrinks to
the box height and sits centred — it never spans the width. Give every box a
**pin** (where the sign sits) and a **fill mode** (Fit inside / Fill the box,
where Fill lets the sign OVERFLOW the box rather than crop or stretch — the
owner explicitly rejected stretching). Also: the layout editor's resize
handle is too small to hit, and the page needs a table of contents because
"Templates" sits too far down.

## 1. What the user gets

- **Selected box → "Where the sign sits"**: a 3×3 pin picker (top-left …
  centre … bottom-right). Absent = centre, exactly today's drawing.
- **Selected box → "How the sign fits"**: *Fit inside* (today) or *Fill the
  box* — the sign grows until it spans the box's longer side; the rest
  overflows past the box edges (not cropped, not stretched). The pin decides
  where the overflow goes: pinned bottom, a sign in a flat box grows upward.
- **Overflow stops at the block edge** (the block's own `<svg>` viewport
  clips), never runs into the next block in a word. Inside the block it MAY
  overlap a neighbouring box — the designer's choice, visible at once in the
  live preview.
- **Resize handles** on the selected rect: a bigger corner handle plus a
  right-edge and a bottom-edge handle, each with a generous hit area.
- **"On this page"** links under the page header that jump to every section.

## 2. Data model (engine, `src/blocks/types.ts`)

```ts
export type SlotPin =
    | 'top-left' | 'top' | 'top-right'
    | 'left' | 'center' | 'right'
    | 'bottom-left' | 'bottom' | 'bottom-right';
export type SlotFill = 'fit' | 'fill';

export interface BlockSlot {
    …existing…
    /** Where the sign sits in the box. Absent = 'center'. */
    pin?: SlotPin;
    /** 'fit' shrinks the sign inside the box (absent = 'fit'); 'fill' grows it to span the box and lets the rest overflow. */
    fill?: SlotFill;
}
```

N1 (normalised form): `pin` written only when not `'center'`, `fill` only
when `'fill'`. `SLOT_PINS` / `SLOT_FILLS` readonly const arrays exported from
`src/blocks/index.ts` along with the two types.

SVG mapping (`preserveAspectRatio`):

| pin | align |
|---|---|
| top-left | `xMinYMin` |
| top | `xMidYMin` |
| top-right | `xMaxYMin` |
| left | `xMinYMid` |
| center | `xMidYMid` |
| right | `xMaxYMid` |
| bottom-left | `xMinYMax` |
| bottom | `xMidYMax` |
| bottom-right | `xMaxYMax` |

`fit` → `meet`; `fill` → `slice` **plus `overflow="visible"` on that nested
`<svg>`** (that is what turns "crop" into "overflow"). With `fit` no
`overflow` attribute is written.

## 3. Phase A — engine + SVG (agent 1)

Files: `src/db/utils/svgInkBounds.ts` (`nestSvgToInk`, `estimateInkBounds`'s
nested-cell branch), `src/db/utils/svgCompose.ts` (`nestSvg`),
`src/blocks/types.ts`, `validate.ts`, `compose.ts`, `index.ts`; tests in
`src/blocks/__tests__/compose.test.ts`, `validate.test.ts`, and the
svgInkBounds test file (find it under `src/db/utils/__tests__` or beside it).

1. `nestSvg(svg, rect, placement?)` and `nestSvgToInk(svg, rect, fallbackRect?, placement?)`
   take an optional `{ align?: SvgAlign; scale?: 'meet' | 'slice' }`
   (`SvgAlign` = the nine `xMinYMin`…`xMaxYMax` strings). Omitted ⇒ the
   exact bytes written today (`preserveAspectRatio="xMidYMid meet"`, no
   `overflow`). `slice` ⇒ ` overflow="visible"` written right after
   `preserveAspectRatio`.
2. `estimateInkBounds` today REJECTS a nested `<svg>` cell whose
   `preserveAspectRatio` is not `xMidYMid meet` (returns null → the whole
   block becomes unmeasurable and every consumer falls back to the full
   canvas). Teach it every align × {meet, slice}: place the cell's own ink
   inside (meet) or across (slice) its viewport per the alignment; for slice
   the content extends past the cell viewport (overflow visible), and the
   measured box is the content rect **clipped to the document's own
   viewBox** (the block root clips). Add a test per scale × 3 representative
   alignments.
3. `compose.ts`: `nestPart(svg, part, pin, fill)` maps pin/fill per §2 and
   passes the placement to `nestSvgToInk`. Every part of a multi-sign slot
   uses its slot's pin/fill. The mark and lone-consonant paths are untouched.
4. `validate.ts`: `SLOT_KEYS` += `pin`, `fill`; an unknown value → issue
   `"expected one of …"` + default; N1 as §2. `MAX_*` untouched.
5. Tests: (a) byte-identity — a slot without pin/fill composes the SAME
   string as before (extend the existing `preserveAspectRatio="xMidYMid meet"`
   assertion in compose.test.ts and the roundtrip property); (b) each of the
   nine pins with fit and fill produces the expected attribute; (c) fill
   writes `overflow="visible"`, fit does not; (d) validator normalises
   `pin: 'center'` and `fill: 'fit'` AWAY, keeps the others, and reports a
   bad value; (e) `estimateInkBounds` cases from step 2.

## 4. Phase B — designer (agent 2)

Files: `src/components/tabs/writingSystem/blocks/`: new `slotPlacement.ts`
(pure, beside `slotCount.ts`), `SlotSettings.tsx`, `slotSettings.module.scss`,
`RectLayoutEditor.tsx`, `RectLayoutEditor.module.scss`; tests
`__tests__/slotPlacement.test.ts` (new), `templateEditor.test.tsx`,
`RectLayoutEditor.test.tsx`.

1. `slotPlacement.ts`: `SLOT_PIN_LABELS: Record<SlotPin, string>` (e.g.
   'Top left', 'Centre'…), `SLOT_FILL_LABELS: Record<SlotFill, string>`
   (`fit: 'Fit inside the box'`, `fill: 'Fill the box (may overflow)'`),
   `slotPlacementOf(slot)` → `{ pin, fill }` with defaults, `setSlotPin`,
   `setSlotFill` (template, roleId, value) → whole normalised template, N1:
   the field is DELETED when it is the default (mirror `withCount`).
2. `SlotSettings.tsx`: under the count controls, a **"Where the sign sits"**
   group: nine toggle buttons in a 3×3 CSS grid (`role="radiogroup"`, each
   button `role="radio"` `aria-checked`, `aria-label` = the pin label,
   `data-slot-pin-option="<pin>"`, group `data-slot-pin=""`), and a
   **"How the sign fits"** select (`data-slot-fill=""`). Hints (`pageStyles.hint`):
   fit → "The sign shrinks until it sits inside the box."; fill → "The sign
   grows until it spans the box; the rest spills past the box edges, up to the
   block's edge. The pin says which way it spills." Plain words only, no
   attribute names. The change goes out via `onChange(template)` like the
   count controls; the live preview on the right updates by itself because
   the template state changes.
3. `RectLayoutEditor.tsx`: on the selected rect render THREE handles, in
   this DOM order: corner (`data-resize-handle="corner"`, resizes w+h, as
   today), right edge (`data-resize-handle="right"`, dw only), bottom edge
   (`data-resize-handle="bottom"`, dh only). `DragMode` becomes
   `'move' | 'resize' | 'resize-w' | 'resize-h'`. Styles: corner 16px square
   drawn, edge handles 16px × 40% of the side (capped) drawn as a bar; EVERY
   handle gets a 28px minimum hit area via a transparent `::before` (so the
   finger target is bigger than the drawn shape). Cursors `nwse-resize`,
   `ew-resize`, `ns-resize`. Theme tokens only.
4. Tests: `slotPlacement` N1 round trips; template editor: pick a pin →
   `template.slots[i].pin`, pick centre → the key is gone, pick fill →
   `fill: 'fill'`, pick fit → gone; RectLayoutEditor: the right handle
   changes only `w`, the bottom handle only `h`, the corner both; the
   existing corner test still passes.

## 5. Phase C — page contents + docs (agent 3)

1. `BlocksPage.tsx`: right under `PageHeader`, a `<nav aria-label="On this page" data-page-contents="">`
   with links: Splitting · Roles · Templates · Lone consonants · Try a word ·
   Check words · Variant groups. Each section gets a stable `id`
   (`blocks-split`, `blocks-roles`, `blocks-templates`, `blocks-leftovers`,
   `blocks-try`, `blocks-check`, `blocks-groups`): the components that own a
   `<section>` (`SplitSettings`, `RolesEditor`, `TemplateList`,
   `LoneConsonantSettings`, `WordCheck`) take an optional `id` prop and put it
   on their section. Links are real `<a href="#id">` (a11y), with an onClick
   that `preventDefault`s and `scrollIntoView({ behavior: 'smooth', block: 'start' })`
   + focuses the section (`tabIndex={-1}` set only when focusing) so the
   router never sees the hash. Sections get `scroll-margin-top: 1rem`. The
   nav is a wrapped row of chips (`styles.contents`, `styles.contentsLink`),
   NOT sticky (the page header is not sticky either; keep it simple).
2. Docs: `README.md` engine table + a "Pin and fill" bullet in the block
   engine section; `src/components/tabs/writingSystem/README.md` rows for
   `slotPlacement.ts` and the new handles; `todo.md` section "From the block
   placement follow-up (2026-09-24, BLOCK_PLACEMENT_PLAN.md)" listing what was
   not live-checked; this file's §7.

## 6. Pitfalls (read before touching anything)

- **P1 byte identity.** A slot without `pin`/`fill` must compose the SAME
  string as before this change — compose.test.ts already pins
  `preserveAspectRatio="xMidYMid meet"` for one case; keep that assertion
  exact and do not add `overflow` unless `fill`.
- **P2 N1 everywhere.** Validator, `slotPlacement.ts` and the seed must never
  write a default value. `blockSchemeDraft` compares normalised schemes to
  decide "Unsaved changes"; a default written by one side and dropped by the
  other shows a phantom dirty state after Save + reload.
- **P3 `estimateInkBounds` nested-cell gate** (svgInkBounds.ts ≈ line 211):
  it returns `null` for any `preserveAspectRatio` other than `xMidYMid meet`.
  Extend it (Phase A step 2) or every block with a pinned box becomes
  unmeasurable. `splitNestedSvgs` parses the cell's open tag with a regex —
  make sure an added `overflow="visible"` attribute still parses.
- **P4 `nestSvg` is used by many callers** (grapheme rows, word strategies).
  The new parameter is optional and the omitted form is unchanged.
- **P5 hairlineFloor** is emitted inside the nested cell; with `slice` it
  scales with the ink, fine — but do not move it outside the cell.
- **P6 RectLayoutEditor tests** select `[data-resize-handle]` — keep the
  corner handle FIRST in the DOM so existing `querySelector` calls still find
  it; the corner keeps resizing both axes.
- **P7 The template editor's live preview** composes from the template state
  it holds — confirm a pin change re-renders it (no memo keyed on
  slot geometry only).
- **P8 Lint traps** (inherited): react-refresh wants ONE component per file;
  the React compiler dislikes mutation of props; the token ratchet scans
  tests too (no hex colours anywhere); `useEtymolog` mocks must return ONE
  stable object; the file system is case-insensitive (never a `.ts` and a
  `.tsx` differing only by case).
- **P9 Theme tokens only** in SCSS (`--interactive-base`, `--surface-base`,
  `--border-primary`, …); no hardcoded colours; utils-styles for layout.
- **P10 Agents never commit.** Stage nothing; the reviewer commits by path.
- **P11 Gates** before reporting: `npx vitest run` (all green),
  `npx tsc -p tsconfig.app.json --noEmit | grep -v packages/` (empty),
  `npx eslint src --max-warnings=0` (clean). Run from `apps/etymolog` in the
  alpha worktree.
- **P12 Overflow clips at the block root** (`svg:not(:root) { overflow: hidden }`
  in every UA stylesheet). Do not add `overflow="visible"` to the block root
  or to the word-level nesting.

## 7. Status

| Phase | Status |
|---|---|
| A engine + SVG | [x] |
| B designer | [x] |
| C contents + docs | [x] |
| final audit | [x] | Suite 3775/3775, tsc + eslint clean; live pass recorded in `todo.md` § "From the block placement follow-up".

Shipped as:

- **A engine + SVG** — `65cf0fa`
- **B designer** — `ff638f6`
- **C contents + docs** — this commit
