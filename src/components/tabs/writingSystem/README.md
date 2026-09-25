# Writing System

`/writing-system/*` — how the script is laid out. Two pages under one sub-nav:

```
[ Direction | Blocks ]          WritingSystemNav (router-owned tab strip)
  /writing-system               WritingSystemPage — direction + layout rules
  /writing-system/blocks        BlocksPage        — the block-script designer
```

| File | Role |
|---|---|
| `WritingSystemMain.tsx` | The area's `<Routes>`, mounted by `App.tsx` at `writing-system/*`. Unknown sub-paths redirect to `/writing-system`. |
| `WritingSystemNav.tsx` | Layout route: cyber `TabContainer` with `urlSync={false}` + `controlledActiveSection` (active tab derived from the pathname) + `onSectionChange` → `guardedNavigate`, so leaving a dirty Blocks draft asks first. Same contract as the Script Maker's `ScriptMakerNav`. |
| `WritingSystemPage.tsx` | The **Direction** page: one table per rule category, each `<select>` writes `settings.writingSystem` (the whole object, the update is strict). Shows `validateWritingSystem(settings, savedBlockScheme)` warnings inline. Ends with a **Spacing** section (`ScriptSpacingSettings`). |
| `ScriptSpacingSettings.tsx` | The two conlang-wide spacing controls, shown on BOTH this page and the Blocks page (SCRIPT_SPACING_PLAN §5). A **letter spacing** select (`data-letter-spacing`, writes the whole `settings.writingSystem`) + `WordSeparationSetting`. Both save immediately. |
| `WordSeparationSetting.tsx` | Front-end over the existing `settings.punctuation.wordSeparator` (NO new stored field): a Space / A glyph / Nothing select (`data-word-separation`), and for "A glyph" a grapheme picker (`data-word-separator-grapheme`). Derives the mode with `wordSeparationModeOf` and writes the whole `punctuation` back. "Nothing" stores `useNoGlyph` — the translator then emits an invisible `word-break` so words never merge into one block. |
| `scriptSpacingOptions.ts` | Component-free bits for the two controls: `LETTER_SPACING_OPTIONS`, `wordSeparationModeOf`, `WORD_SEPARATION_HINTS`. |
| `scriptSpacing.module.scss` | Stylesheet for the two controls (theme tokens only). |
| `inlineBanner.ts` | `INLINE_BANNER_PARTS` — turns a `NotificationBanner` toast into an inline warning. Shared by both pages. |
| `blocks/` | The Block Designer (below). |

**Letter spacing transport.** `writingSystem.letterSpacing` (`auto | none | tight | normal | wide | extra-wide`, default `auto`) rides the narrow `BlockRenderingContext` (`useOptionalLetterSpacing`, `null` outside a provider = auto). `GlyphSpellingDisplay` reads it (a `letterSpacing` prop overrides the context) and, when not `auto`, sets `spacing = cellWidth × LETTER_SPACING_FRACTIONS[value]`. `auto` leaves each view's preset untouched (byte-identical). In the composed strategy a hidden separator's `word-break` places the next word touching (one letter step) while still allowing a wrap there.

Routes live in `src/url_mapping.ts`: `ROUTES.writingSystem`, `ROUTES.writingSystemBlocks`.
Both sit under the existing `writing-system` primary tab, so `TAB_ROUTES` is unchanged.

## Warnings (`src/rules/validateWritingSystem.ts`)

`validateWritingSystem(settings, blockScheme?)` returns `{ keys, title, message }[]`:

- word order and line progression on the same axis (wrapped lines overlap);
- glyph-boundary wrapping with glyphs and words on different axes;
- **blocks enabled with zero templates** (`validateBlockSchemeUsage`, key `'blockScheme'`):
  nothing would be grouped. The Direction page checks the SAVED scheme, the Blocks
  page its DRAFT.

## The Block Designer (`blocks/`)

The UI over the one-per-script `BlockScheme` document (`src/blocks/types.ts`,
BLOCK_SCRIPT_PLAN §2.4). The engine (`src/blocks/`) and the renderers already
consume it; this page only edits it.

| File | Role |
|---|---|
| `BlocksPage.tsx` | Owns the DRAFT scheme and the template editor's working copy. Toolbar (enable switch, status line, Save / Discard), warnings, then the sections. A **Spacing** section (`id="blocks-spacing"`, `ScriptSpacingSettings`) sits right after Splitting — these two settings apply to the whole script and save immediately, unlike the scheme draft. Also owns the "Try a word" preview's word + IPA (`tryWordId` / `tryIpa`, the preview is CONTROLLED there) and mounts `WordCheck` right under it with the same forced-on draft (`tryScheme`); "Try it" sets the word, clears the IPA and scrolls the try section into view. |
| `RolesEditor.tsx` | Roles table: label, matcher select (every class letter via `CLASS_LABELS`, *syllable sign*, *category…* + its text box, *mark (accent, tone…)* — a shortcut that writes `MARK_CATEGORY` into that always-shown box and is selected while the box reads exactly `mark`, *anything*), colour swatches, guarded delete. |
| `TemplateList.tsx` | Templates in PRIORITY order: cyber `ReorderableList` (drag / keyboard) plus ↑/↓ buttons; each row has its priority number, a thumbnail of its rectangles, pattern chips, Edit / Duplicate / Delete. Also hosts "Add templates from my word shapes" and its report. |
| `TemplateEditor.tsx` | Controlled editor for one template: name, pattern built from role chips, the layout canvas, the live preview. Apply / Cancel. |
| `RectLayoutEditor.tsx` + `rectLayoutMath.ts` | The generic draggable/resizable rectangle canvas (pointer + keyboard, snapping). Knows nothing about schemes. The selected rect shows three resize handles in DOM order `corner` (width + height), `right` (width) and `bottom` (height) — hooks `data-resize-handle="corner|right|bottom"`, each with a ≥28px transparent hit area over its drawn shape. |
| `SlotSettings.tsx` + `slotSettings.module.scss` | The selected box's controls inside the template editor: "How many signs" / "Several signs sit" (count + arrange), a 3×3 pin picker "Where the sign sits" (`role="radiogroup"`, hooks `data-slot-pin`, `data-slot-pin-option`) and a "How the sign fits" select (`data-slot-fill`: Fit inside / Fill the box). Emits the whole normalised template through `onChange`. |
| `slotPlacement.ts` | Pure pin/fill helpers beside `slotCount.ts`: `SLOT_PIN_LABELS`, `SLOT_FILL_LABELS`, `slotPlacementOf(slot)` (defaults centre + fit), and `setSlotPin` / `setSlotFill(template, roleId, value)` returning the whole normalised template (N1: the field is DELETED when it is the default, mirroring `withCount`). |
| `BlockPreview.tsx` | Live preview: a lexicon word or typed IPA rendered with `GlyphSpellingDisplay` and the draft scheme, plus a caption naming the template each block used. Uncontrolled by default (TemplateEditor); optional controlled `wordId` / `ipa` + `onWordChange` / `onIpaChange` win when given (BlocksPage's "Try a word"). |
| `blockSchemeDraft.ts` | Every pure edit the page makes (ids, roles, templates, slots ⇄ rects, reorder, dirty check, status line, `draftProblems`, `previewScheme`, `summarizeBlocks`). |
| `readout.ts` | Pure, shared by `summarizeBlocks` and `checkWords` so the caption and the word check phrase a word identically: `readEntry`, `readSegments` (segments → `ta · pa`), `drawsWithMark` (the composer's verdict on the vowel-killer mark). Takes segments; never segments itself. |
| `checkWords.ts` | Pure "Check all my words" (the plan's `wordCheck.ts`, renamed: next to `WordCheck.tsx` on a case-insensitive file system `./WordCheck` would resolve to it). `checkWords(words, scheme, index)` segments each spelled word ONCE and returns `checked`, `clean`, the `unplaced` / `loneConsonants` / `unreadable` lists (`count` exact, `rows` capped at `MAX_WORD_CHECK_ROWS = 200`) and `unusedTemplates`. Words with no spelling are skipped. |
| `WordCheck.tsx` | The "Check all my words" section: `Check N words` (disabled at 0), computed on click only; status line, one `<details>` per non-empty list (first open), rows `label — readout — detail` with "Try it" (`onTryWord`), "Templates no word uses", and a stale note once the draft differs from the one checked. Hooks: `data-word-check`, `data-word-check-status`, `data-word-check-group`, `data-word-check-row`, `data-word-check-stale`. |
| `seedFromGenerator.ts` | Word-generator shapes → templates (rules below). |
| `SplitSettings.tsx` | "Splitting words into blocks": By syllable / By template order, the s + consonant option and, by syllable, two `SoundList`s — "Vowels next to each other" (`split.diphthongs`, suggestions from the word shapes) and "Consonants that can carry a syllable" (`split.syllabicConsonants`, suggestions from the signs, not-one-consonant warning, `krtek` example) — plus a visible line on `.`, `‿` and the stress marks. Every change passes BOTH lists through `normalSplit`, so no toggle drops either. |
| `SoundList.tsx` | One editable sound list: chips with remove buttons, add row (button / Enter, trimmed + NFC, duplicates ignored, length limit with a visible reason), per-entry warning, the "up to 32" cap line, suggestion buttons, example line. `dataPrefix` names every `data-*` hook (`diphthong` keeps the old selectors; `syllabic`). |
| `diphthongSuggestions.ts` | Pure: `suggestDiphthongs` (vowel sequences in the word shapes' literal groups), `isVowelSequence`, `diphthongExample`; `suggestSyllabicConsonants` (the signs' main sounds that are nasals, l-, r-sounds and the like), `isSingleConsonant`, `syllabicExample`. |
| `PageContents.tsx` | The "On this page" row of chip links under the page header (`nav[data-page-contents]`, `styles.contents` / `styles.contentsLink`): one real `#id` anchor per section, in page order, whose click is intercepted to smooth-scroll + focus the section (`tabIndex = -1`, `preventScroll`) so the router never sees a hash change. Not sticky. |
| `blocksPage.module.scss` | One stylesheet for the page family (theme tokens only; a role's tint is the `--role-colour` custom property). |

### Draft / save / discard

- The draft is initialised from `data.blockScheme` (the saved, validated scheme).
  Every edit replaces the draft; nothing reaches the database until **Save**.
- **Dirty** = the draft differs from the scheme it was derived from
  (`sameDocument`: deep, key-order-insensitive). The template editor's working
  copy counts too (a new template, or one changed since it was opened). Dirty is
  registered with the app's unsaved-changes registry, so the sub-nav and the app
  nav ask before leaving.
- **Save** → `api.blockScheme.save(draft)` via `useApiAction`. The API is lenient:
  it stores the CORRECTED scheme and returns the corrections, which are listed
  inline ("Saved, with these corrections"); the draft becomes the stored scheme.
  Save is disabled while `draftProblems` finds something the validator would fix
  by DROPPING data (an empty role label, a category role with no category, a
  template with no name) — the reasons are listed.
- **Discard** → the draft returns to the saved scheme and the editor closes.
- If the saved scheme changes underneath (a save, an import) while the draft is
  clean, the draft follows it; a dirty draft is never overwritten.
- **Apply** in the template editor writes its working copy into the draft (not
  the database); **Cancel** drops it.

### Roles

- Ids are stable slugs generated once (`role-<n>`, next after the highest) and
  never derived from the label — renaming a role cannot break a pattern.
- New roles take the next palette colour; the palette is the utility tokens,
  stored as the `var(--x)` string so the tint follows the theme.
- A role used by any template — including the template open in the editor, as it
  is right now — cannot be deleted; its row shows "Used by N templates".

### Templates

- Order is priority: the segmenter tries templates top to bottom and the first
  match wins, so longer patterns belong first (the page says so).
- Pattern = role chips clicked in reading order, each role at most once; a chosen
  chip removes the role. Adding a role appends ONE rectangle at the even-row
  position for the new length (`x = (n-1)/n, w = 1/n, y = 0, h = 1`) — existing
  rectangles are never moved.
- Each rectangle carries a form `<select>`: *Default form* (`groupId: null`) or
  one of the script's variant groups ("Manage groups…" opens the grapheme
  `VariantGroupsDialog`).
- The canvas snaps to a 1/8 grid by default (toggle); arrows move and
  Shift+arrows resize the focused rectangle.
- The **preview** renders with `previewScheme(draft, working)`: the draft with the
  working template applied in its place (appended when new) and `enabled` forced
  on — so it shows blocks even before the scheme is switched on, and reflects the
  draft's priority order (a template earlier in the list can shadow the one being
  edited; the caption shows which template each block really used).

### "Add templates from my word shapes" (`seedFromGenerator`)

The button opens an inline choice under the Templates header (no modal):
**One flexible template** (tagged Recommended, preselected) or **One template
per shape**; [Add] runs the chosen seed (`onSeed(kind)` → `BlocksPage.handleSeed`),
[Cancel] closes it. With no word shapes the button seeds directly and the report
says there are none.

**One flexible template** (`seedFlexibleTemplate`): parses every shape (bad ones
and shapes with no vowel are skipped with a reason), counts consonant items —
any non-`V` class letter and any literal group that can be a consonant; an
all-vowel literal like `[ai au]` is the vowel — before the first vowel and after
the last, optional items included. Each end's box gets `max` = the most any
shape has (capped at `MAX_SLOT_COUNT`, reported) and `min` 0 when some shape can
have none there; an end no shape uses gets no box. Roles: first `class C` role =
start, second = end, first `class V` = vowel (created as `C1` / `V` / `C2`).
Layout: start across the top, vowel bottom-left, end bottom-right (start only →
vowel across the bottom; end only → vowel top, end bottom; neither → vowel fills
the square). Counts are in the normalised form (N1). An equivalent template
(same role pattern AND counts) means nothing is added. The new template goes
FIRST in the list, so in template-order mode a per-shape `CV` cannot shadow it.
The report reads e.g. "Added “Syllable”: 1 to 2 consonants at the start, up to 1
consonant at the end."

**One template per shape** (`seedFromGenerator`) — input: the draft scheme +
`settings.wordGenerator.profile.syllables`. Output: a new scheme plus a report
(added / roles added / skipped with reasons).

1. Each pattern is parsed with the generator's own `parseTemplate`; one that does
   not parse is skipped with the parser's message.
2. Optional items expand into with/without variants (`(C)V(N)` → `CVN CV VN V`);
   more than 4 optional items → the shape is skipped.
3. A variant containing a literal group (`[n ŋ]`) is skipped — a role matches a
   class, not a sound list. The variants without it are still added.
4. The k-th occurrence of class letter `L` in a pattern uses the k-th role with
   matcher `{ kind: 'class', letter: L }`, created when missing. New roles are
   labelled `L`, or `L1`, `L2`… when some shape in the run repeats `L`.
5. A variant whose MATCHER sequence equals an existing template's (or one added
   earlier in the run) is skipped — a second run adds nothing, and a hand-built
   `C1 V` covers `CV`.
6. Slots start in an even row on the default form.
7. New templates are appended after the existing ones, longest pattern first.

## Tests

- `__tests__/WritingSystemPage.test.tsx` — the Direction page (mocked context).
- `__tests__/blocksPage.test.tsx` — the Blocks page on a real database inside the
  provider, mounted through `WritingSystemMain`: sub-nav, add role, build + save a
  `C1 V` template, reorder persists, enabled-with-no-templates warning (both
  pages), Discard, live preview block `<svg>`, seeding, role-delete guard, the
  empty-category Save block, "Check all my words" → "Try it" into the preview.
- `blocks/__tests__/templateEditor.test.tsx` — the editor in a harness: even-row
  append without moving placed rects, chip removal, snap / free keyboard steps,
  slot group select, Apply gating, preview caption.
- `blocks/__tests__/checkWords.test.ts` (pure: every list, clean, 200-row cap, unused templates, readout = `summarizeBlocks`) and `blocks/__tests__/wordCheck.test.tsx` (the section, mocked context); `blocks/__tests__/blockPreview.test.tsx` (caption + controlled props).
- `blocks/__tests__/blockSchemeDraft.test.ts`, `blocks/__tests__/seedFromGenerator.test.ts`
  — the pure helpers (the island preset yields ≥ 2 templates; a second run adds none).
- `blocks/__tests__/RectLayoutEditor.test.tsx`, `rectLayoutMath.test.ts` — the canvas (the three resize handles included).
- `blocks/__tests__/slotPlacement.test.ts` — the pin/fill helpers (N1 round trips); `blocks/__tests__/pageContents.test.tsx` — the "On this page" links (order, `#id` hrefs, scroll + focus, no hash change).
- `src/rules/__tests__/validateWritingSystem.test.ts` — the warnings.
