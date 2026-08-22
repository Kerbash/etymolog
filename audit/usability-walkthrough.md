# Usability walk-through (live app, 2026-08-22)

Observed in the worktree build on `localhost:5174` with text/a11y-tree
inspection (no screenshots available). Complements `etymolog-ui-audit.md`;
items here are what a user actually hits, in the order they hit it.

## First run
- `/new` has two unlabelled buttons (a11y tree shows `button`, `button`). The
  name modal's input has a placeholder but no label.
- After naming the conlang you land on an EMPTY lexicon with a "New Word" CTA —
  but a word cannot be spelled until graphemes exist. First-run order should
  steer Script Maker → Lexicon (or the empty lexicon state should say so and
  link to Script Maker).

## Script Maker → New Grapheme
- Page is three levels of tabs deep (app tabs → Graphemes/Glyphs → Back link).
- "Select Existing Glyph" is a disabled button labelled "(coming soon)" — the
  only way to reuse a glyph is to draw it again. Phase 7 implements the picker.
- "Add New Glyph" opens a modal whose toolbar has Pen/Square/Circle/Select/
  Eraser, a `range` input announced as "2" (unlabelled stroke width), and
  ELEVEN colour buttons (black … cyan). A script glyph is one colour; stored
  colour also defeats theming (a black glyph vanishes in dark mode). Phase 7:
  drop the palette, draw with `currentColor`, label the slider.
- The modal's name/category inputs are unlabelled textboxes.
- Pronunciation table rows have an unlabelled textbox and an unlabelled
  "use in auto-spelling" control.
- Form has "Save Grapheme" only; Cancel lives in a separate "Back to Gallery"
  link above the form.

## IPA chart
- Zoom controls are bare `+` / `−` text nodes.
- Stats bar ("0 IPA sounds assigned") sits above a permanently expanded
  "Understanding the IPA Chart" explainer that pushes the chart down on
  first visit. Phase 7: `ExpandableContainer`, collapsed by default.
- Loading state is the string "Loading IPA Chart...".

## Punctuation
- Good: a table with symbol / name / display / status / actions, grouped.
- Both quotation rows render the same straight `"`; use `“` and `”` so the
  two rows are distinguishable.
- Status pills read `VIRTUAL` twice per row (display cell and status cell).
- Saves happen silently on change; no toast.

## Custom charts
- "Create Chart" button sits between the stats bar and the list, not in the
  page header; the empty state is a plain sentence with no CTA.

## Lexicon
- "New Word" form: Spelling section comes BEFORE Basic Information, but the
  auto-spell preview needs the pronunciation typed first.
- The SmartForm submit button is outside the reachable a11y tree in the
  Browser pane (reader truncates after the meaning table) — worth checking
  the DOM order/`aria` of the meaning table in Phase 6.
- Enter in the pronunciation field does not submit.
- The word view page shows "No spelling" + "/kato/" + "Auto-spell" as three
  unlabelled chips; "Etymology Tree" section renders a sentence when empty.

## Translator
- Works end to end after Phase 3; the layout strategy `<select>` is now
  visible. Empty state before input is just the heading + textarea.

## Writing System
- One "General" tab (pure chrome). Each rule row's `<select>` has no label.
- Saves silently on change.

## Global
- Every hard reload shows the raw string "Loading..." for ~1–2 s while
  sql.js boots.
- Header buttons Export / Import / New Conlang have no accessible names.
- No dark-mode toggle is reachable in the UI.
