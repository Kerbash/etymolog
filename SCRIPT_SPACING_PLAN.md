# Script spacing — plan

Owner request (2026-09-25):

1. Inside an abugida block, signs must **touch**. Owner follow-up: "remove
   the 6% margin / padding" — that is the whole of this item.
2. A conlang-wide **letter spacing**: how far apart consecutive letters /
   blocks are placed in a word.
3. A conlang-wide **word separation** mode: a space, a glyph, or nothing.
4. Both settings are editable from the Writing System page AND from the
   Blocks page.

## 1. Findings (read from the code, 0.7.0)

- `composeBlock` → `nestPart` → `nestSvgToInk` fits each sign's trimmed INK
  (plus `INK_MARGIN_FRACTION` = 6% of its larger side on every side) into its
  part rect with `meet`. That padding, and meet's aspect slack, is the gap
  the owner sees. `partWeight` sizes parts by ink aspect.
- Words advance glyph boxes by the CELL (`GLYPH_CELL_FRACTION`, the guide
  square) plus `LayoutStrategyConfig.spacing` in pixels. `spacing` comes from
  per-view presets and is inconsistent (compact 2px on a 10px cell = 20%,
  detailed 30%, tree 14%, input 33%, card 0).
- Word separators already exist: `settings.punctuation.wordSeparator`
  (`PunctuationConfig {graphemeId, useNoGlyph}`) → `createSpaceSeparator` in
  `src/db/phraseService.ts`. Virtual space = an IPA `' '` entry with role
  `'word-separator'`; grapheme = that grapheme; `useNoGlyph` = **no entry at
  all**, which (bug) lets the block segmenter merge the last letters of one
  word with the first of the next, and the layout run them as one word.

## 2. Data model

- `WritingSystemSettings.letterSpacing: 'auto' | 'none' | 'tight' | 'normal' | 'wide' | 'extra-wide'`,
  default `'auto'`. As a fraction of the CELL width/height:
  none 0, tight 0.05, normal 0.15, wide 0.3, extra-wide 0.5. `'auto'` keeps
  each view's preset `spacing` (current look). One exported table
  `LETTER_SPACING_FRACTIONS` is the only place the numbers live.
- Word separation reuses `punctuation.wordSeparator` — NO new stored field.
  Mode is derived: `useNoGlyph` → `'nothing'`; `graphemeId != null` →
  `'glyph'`; else `'space'`.
- New `SpellingRole` member `'word-break'`: an invisible, zero-size word
  boundary.

## 3. Phase A — signs touch inside a block (DONE)

`estimateInkBounds` no longer pads the ink (`INK_MARGIN_FRACTION` deleted):
a sign fitted into its box touches the box edge, so neighbouring boxes'
signs touch. `partWeight` now weighs by the bare ink aspect. The considered
alternative (map each sign's guide square onto its box, overflow the rest)
was dropped in favour of the owner's explicit instruction.

## 4. Phase B — letter spacing + word separation

1. Settings: `letterSpacing` in `WritingSystemSettings`, default, and
   `settingsSchema.ts` validation (`validateEnum`, `LETTER_SPACING_VALUES`).
   NOT added to the `src/rules` registry (it would render twice on the
   Writing System page — see step 5).
2. Transport: add `letterSpacing` to `BlockRenderingValue` in
   `src/db/context/useOptionalBlockScheme.ts` (memoised in `EtymologProvider`
   on the whole value read out first, P8) + `useOptionalLetterSpacing()`
   returning `null` outside a provider (= auto). `GlyphSpellingDisplay`
   accepts an optional `letterSpacing` prop that overrides the context.
   In `effectiveConfig`, when the effective value is not auto, set
   `merged.spacing = cellWidth × fraction`, cellWidth from the merged
   `glyphWidth` (falling back to `DEFAULT_LAYOUT_CONFIG`) × `cellFraction`.
   Auto ⇒ the memo output is exactly what it was (P1).
3. Word break (`'nothing'` mode):
   - `SpellingRole` += `'word-break'`. `createSpaceSeparator` with
     `useNoGlyph` returns `{ type: 'ipa', position: 0, ipaCharacter: '', role: 'word-break' }`
     instead of `null` (`createPunctuationEntry` keeps returning `null` for
     hidden marks). Check every caller of `createSpaceSeparator`.
   - Blocks: a `'word-break'` entry is structural, like a separator — the
     segmenter must close the run there (verify `classify` treats any `role`
     as structural; add the case if not). Test: `ka` + break + `n…` never
     forms one block.
   - Normalization: the entry becomes a renderable with that role and NO
     visible svg (not the virtual-glyph box styling).
   - `composedBlockStrategy`: a `'word-break'` glyph flushes the current word
     and is not positioned; the NEXT word is placed touching — its first box
     starts one letter step after the previous word's last box (the offset a
     letter would get), and the line-extent/wrapping arithmetic uses the same
     reduced gap. It is still a wrap opportunity for `wordWrap: 'word'`.
   - Every other strategy (ltr/rtl/ttb/btt/spiral/block/circular/
     boustrophedon): `'word-break'` glyphs are removed before `calculate` (one
     place, e.g. `useGlyphPositions`), so they draw nothing and take no room.
4. `WordSeparationSetting` component (writingSystem folder): a select
   `data-word-separation` Space / A glyph / Nothing, and when "A glyph" a
   second select `data-word-separator-grapheme` listing graphemes by name
   (from `data.graphemesComplete`). Writes `punctuation` spread whole
   (strict update — the PunctuationPage pattern) via `runApiAction`:
   space `{graphemeId:null,useNoGlyph:false}`, nothing
   `{graphemeId:<kept>,useNoGlyph:true}`, glyph `{graphemeId:id,useNoGlyph:false}`.
   Choosing "A glyph" with no grapheme picked writes nothing until one is
   chosen. Hint text per mode; "Nothing" hint: "Words run on without a gap,
   but blocks never join across a word."
5. `ScriptSpacingSettings` component = letter spacing select
   (`data-letter-spacing`, saves `writingSystem` spread whole) +
   `WordSeparationSetting`. Rendered:
   - on `WritingSystemPage` as a "Spacing" table/section below the rule
     tables;
   - on the Blocks page in a new section `id="blocks-spacing"` "Spacing",
     placed right after Splitting and added to `PAGE_CONTENTS` after
     Splitting, with a line saying these apply to the whole script and save
     immediately (unlike the scheme draft, which waits for Save).
6. Punctuation page: the word-separator row's no-glyph description should
   say words run on with no gap (they no longer merge).
7. Tests: settings validation (letterSpacing valid/invalid/absent);
   `GlyphSpellingDisplay` spacing = cell × fraction and auto unchanged;
   translator emits the word-break entry; composed strategy positions
   touching words and still wraps there; non-composed strategies ignore it;
   blocks never span a word-break; both components (mode derivation, writes,
   grapheme select).

## 5. Pitfalls

- P1 byte identity: auto letter spacing and blocks-off rendering unchanged.
- P2 The word-break entry must never be drawn or measured as a glyph.
- P3 strict `api.settings.update`: always spread the whole sub-object.
- P4 react-refresh: one component per file; helpers in `.ts` files.
- P5 React compiler: read whole values out before memo deps (no `a?.b` deps).
- P6 token ratchet scans tests too: no hex colours anywhere; SCSS uses theme
  tokens.
- P7 `useEtymolog` mock in tests: ONE stable object (a per-call object
  loops and kills the worker).
- P8 Agents never commit. Gates: `npx vitest run` (whole app),
  `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src --max-warnings=0`.
- P9 Do not touch `docs/` (built output) or version.

## 6. Status

- [x] Phase A — signs touch inside a block (6% ink padding removed)
- [x] Phase B — letter spacing + word separation. Shipped as: `writingSystem.letterSpacing` enum + `LETTER_SPACING_FRACTIONS` (types.ts) validated in settingsSchema; transported via `BlockRenderingContext.letterSpacing` + `useOptionalLetterSpacing`; `GlyphSpellingDisplay` maps a non-auto value to `spacing = cellWidth × fraction`. New invisible `SpellingRole` `'word-break'`: `createSpaceSeparator` emits it on `useNoGlyph`, normalization renders a zero-size glyph, the block segmenter treats it as structural, the composed strategy places the next word touching (`touchesPrev` + `touchGap = step − box`) and still wraps there, and `useGlyphPositions` strips it for every non-composed strategy. `ScriptSpacingSettings` + `WordSeparationSetting` on both the Writing System and Blocks pages (Blocks `id="blocks-spacing"`, after Splitting).
- [ ] Final audit + live check
