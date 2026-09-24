# Block script, part 4 — marks, joins, syllabary codas, syllabic consonants, word check

Follow-up to `DIPHTHONG_BLOCKS_PLAN.md` (read its §2–§3 and §6 first, and
`SYLLABLE_BLOCKS_PLAN.md` §2–§4 before that). Owner request (2026-09-24):
"cover strange conlang cases", five items, in this order of value:

1. **Marks inside a syllable break it.** A tone / length / nasal mark drawn as
   its OWN sign (a grapheme with category `mark`, no sound) has no sound, so
   `syllabify` treats it as a wall: `ka` + tone + `n` becomes `ka`, the mark
   alone, and a lone `n`. A typed IPA mark (`ː`, `˥`, a lone combining tilde)
   and a typed stress mark (`ˈ ˌ`) do the same.
3. **Syllabary + coda signs.** After a *syllable sign* (`ka`), the next
   consonants are taken as the next syllable's start without checking that
   they can start one: `ka(sign) n t a` → `ka` + `nta`. Cherokee, Japanese ん,
   Linear B all need `kan · ta`.
5. **Finding surprises is manual.** "Try a word" is one word at a time; the
   owner wants one report over every word.
2. **Syllabic consonants.** Czech `prst`, `vlk`, `krtek`: a run with no vowel
   has no core, so it is lone consonants.
4. **Ad-hoc joins.** `.` forces a break; nothing forces two signs together
   without listing the pair. `‿` (IPA undertie, already a separator token in
   the tokenizer) is the mirror of `.`.

Status: `[ ]` todo · `[~]` in progress · `[x]` done.

| Phase | What | Status |
|---|---|---|
| A | Engine: marks ride with the sign before them (item 1); `‿` join + stress marks as breaks (item 4) | [x] |
| B | Engine: syllabary codas (item 3); `split.syllabicConsonants` + the syllabic diacritic (item 2) | [x] |
| C | Designer: "Consonants that can carry a syllable" list; join/break note; a Join key on the word keyboard; a "mark" role preset | [x] |
| D | Designer: "Check all my words" report (item 5) | [x] |
| E | Docs, live E2E in Chrome, final audit | [x] |

A → B → C → D → E. Each phase is one agent run; the agent never commits.

---

## 1. What the user gets

1. **Marks belong to the sign before them.** A mark sign (tone, length,
   accent…) never splits a syllable: `ka` + tone + `n` is ONE syllable, and a
   `C V MARK C2` template places the mark in its own box. A typed IPA mark
   (`ː`, `˥`) behaves the same. Stress marks `ˈ ˌ` are read as breaks, like
   `.`, and draw nothing.
2. **`‿` keeps two signs in one syllable.** `a‿i` is one nucleus without
   listing `ai`; `at‿a` keeps `t` at the start of the second syllable;
   `a‿t‿a` is one syllable. It draws nothing (like `.`). The word keyboard
   gets a **Join** key next to **Boundary**.
3. **A syllable sign takes the consonants that cannot start the next
   syllable.** `ka(sign) n t a` → `kan · ta` (`nt` is not a legal start,
   `t` is); `ka(sign) s t a` with s + consonant on → `ka · sta`, off →
   `kas · ta`; `ka(sign) n` at the end → `kan`. A `SYL C` template draws it.
4. **Consonants can carry a syllable.** The owner lists them (`r l m n`), or
   writes the IPA syllabic mark on the sound (`r̩`). A listed consonant is a
   syllable's core when no vowel is next to it: `prst` → `prst` (one block),
   `krtek` → `kr · tek`, `vlk` → `vlk`, `karta` → `kar · ta` (the `r` is next
   to `a`, so it is an ordinary consonant). `r̩` is always a core.
5. **"Check all my words".** One button on the Blocks page runs the CURRENT
   draft over every spelled word and lists, by kind: words with a sign no
   template placed, words with a consonant drawn alone (or with the mark),
   words with a sign the engine cannot read, and templates no word uses.
   Clicking a word puts it in "Try a word".

## 2. Data model (additive; N1 applies to every field)

```ts
// BlockSplit (src/blocks/types.ts)
syllabicConsonants?: string[];   // consonants that may be a syllable's core; absent = none
```

- Same normalised form as `diphthongs`: emitted only when NON-EMPTY, each
  entry trimmed + NFC, non-empty, unique (first wins), ≤ 8 code points,
  ≤ 32 entries. **Generalise** `normalizeDiphthongs` into
  `normalizeSoundList(list)` and keep `normalizeDiphthongs` as an exported
  alias (index.ts exports both; nothing that imports the old name changes).
  Constants: keep `MAX_DIPHTHONGS` / `MAX_DIPHTHONG_LENGTH`, add
  `MAX_SOUND_LIST = 32` and `MAX_SOUND_LENGTH = 8` as the primary names with
  the old names as aliases.
- Validator: structural only, per-entry issues `split.syllabicConsonants[k]`
  (mirror `validateDiphthongs`; factor the two into one
  `validateSoundList(raw, path, issues)`). Whether an entry IS one consonant
  is the designer's warning.
- Only used by `mode: 'syllables'`; `normalSplit` drops it in template mode
  (as it drops `diphthongs`).

No new field on the document for marks or joins. New ENGINE classes (never
stored): `{ kind: 'mark'; category: string | null }` and `{ kind: 'join' }`.

## 3. Engine — Phase A (marks + joins)

### 3.1 Classify — `src/blocks/classify.ts`

- `export const BLOCK_JOIN = '‿'` (U+203F) next to `BLOCK_BOUNDARY`.
- `classifyEntry`, IPA entries, in this order:
  1. `char === BLOCK_BOUNDARY` → `boundary` (as now);
  2. `char === BLOCK_JOIN` → `{ kind: 'join' }`;
  3. `separatorKindOf(char) === 'stress'` (`ˈ ˌ`) → `boundary`;
  4. every code point of `char` `isAttachingMark` (from
     `generator/phonology/features` — `ː`, `˥`, U+0303, U+0329 alone…) →
     `{ kind: 'mark', category: null }`;
  5. else as now (`classifySound`).
- Grapheme entries: a grapheme with NO phonemes and `category.trim() ===
  'mark'` → `{ kind: 'mark', category }`. Importing `MARK_CATEGORY` from
  `../db/wordSymbolService` would pull the DB module into the pure engine —
  DO NOT. Define `export const MARK_CATEGORY_NAME = 'mark'` in `classify.ts`
  with a comment naming `wordSymbolService.MARK_CATEGORY` as the source of
  truth, and add a one-line test in `classify.test.ts` that imports both and
  asserts equality (so they cannot drift). Every other phoneme-less grapheme
  stays `silent` (logograms).
- `roleAccepts`: `boundary`, `structural`, **`join`** → always false.
  `mark`: `any` → true; `category` → the existing category comparison;
  `class` / `syllable` → false.
- JSDoc of `EntryClass` in `types.ts`: add both kinds with one sentence each.
- `entrySound` unchanged (a mark grapheme has none; an IPA mark returns its
  character — `syllabify` must not judge sonority on it, see 3.2 / P-A4).

Grep `'boundary'` and `'silent'` across `src/` (excluding `src/blocks`) — as
of writing NO switch statement outside the engine enumerates `EntryClass`
kinds, but re-check; `blockUtils.ts` (canvas) uses `segmentEntries` only.

### 3.2 Syllabify — `src/blocks/syllabify.ts`

- `UnitRole` gains `'mark'`; export the role function as
  `export function unitRoleOf(cls: EntryClass): UnitRole` (segment.ts's
  `isOpaque` must use it — one definition, P-A3). `'mark'` for
  `cls.kind === 'mark'`; `'opaque'` for everything else that is not a C/V
  phoneme (as now); `join` never reaches `syllabify` (segment strips it,
  3.3).
- `SyllabifyOptions.joins?: ReadonlySet<number>` — unit positions `p` such
  that NO boundary may fall between unit `p - 1` and unit `p` (indices into
  the `units` array handed to `syllabify`).
- **Marks ride with the sign before them:**
  - nucleus detection skips marks;
  - `medialBoundary(units, roles, from, to, options)`: a candidate `start`
    is skipped when `roles[start] === 'mark'` (never cut before a mark) or
    `options.joins.has(start)`; the tail's sounds for `onsetAccepts` are the
    NON-mark units only (P-A4). Returns `null` when no candidate in
    `from..to` (inclusive of `to`) is allowed — the two syllables then MERGE
    (no boundary pushed; `syllableStart` stays). `to` itself is a candidate
    (empty onset) and is subject to the join / mark test like the others.
  - an opaque unit's own range extends over the marks that immediately
    follow it (`LOGO MARK` is one range) — in `syllabify`'s main loop before
    the next stretch starts;
  - a stretch that starts with marks (word-initial mark) simply leads its
    first syllable — no code.
- **Joins glue nuclei:** in `glueNuclei(units, diphthongs, joins?)`, after the
  diphthong-list size is chosen at `i`, extend while `joins.has(i + size)`,
  the unit at `i + size` is a glue-able nucleus, and `size < MAX_GLUED_UNITS`.
  (A join between a nucleus and a consonant is handled by `medialBoundary`,
  not here.) Update the JSDoc examples.
- A mark between two vowels BLOCKS the diphthong glue (`a MARK i` with `ai`
  listed is not glued: a group must be contiguous and every entry role-
  accepted, and a V box does not accept a mark). Document in `todo.md`; the
  workaround is to put the mark after the pair.

### 3.3 Segment — `src/blocks/segment.ts`

- `segmentEntries(entries, scheme, index)` becomes a thin wrapper:
  1. classify every entry (as now);
  2. **compact**: `kept: number[]` = the indices of every entry whose class
     is not `join`; `joinBefore: Set<number>` = compact positions `k` such
     that at least one `join` entry sat between `kept[k - 1]` and `kept[k]`
     (a join at the very start or end of the spelling is simply dropped);
  3. run the existing pipeline over the compact entries / classes (a compact
     `entries` array and compact `classes`; `ctx.groups` is compact too);
  4. map every segment's `entryIndices` back through `kept`.
  When there is no join entry, `kept` is the identity and the output must be
  BYTE-IDENTICAL to today's (P-A2 — pin it with a test that runs every
  existing segment fixture through the wrapper and a copy of the old path,
  or simply asserts the exact previous expectations, which the existing
  tests already do).
- `segmentSyllables` passes `joins` to `syllabify` / `glueNuclei` as
  RUN-relative positions (`joinBefore` entries `k` with `start < k < end`,
  minus `start`). A join at exactly `start` (right after a boundary or a
  structural entry) is meaningless and dropped.
- `isOpaque(cls)` → `unitRoleOf(cls) === 'opaque'` (a mark is NOT opaque, so
  `joinOpaqueUnits` never treats a lone mark as a joinable sign — it already
  sits inside a range after 3.2).
- `singleSegment`: unchanged (a mark single is a plain single).
- Template mode: joins are dropped by the compaction and nothing else
  changes (P-A2).

### 3.4 Compose / normalization

Nothing: a mark in a slot draws its grapheme (or the IPA text stand-in);
`join` and stress-`boundary` entries produce no segment, so
`normalizeSpellingWithBlocks` never sees them (they render nothing, exactly
like `.`). With blocks OFF nothing changes (the pre-block path is verbatim).

### 3.5 Tests (Phase A — the agent writes; I audit + run)

`classify.test.ts`: `‿` → join; `ˈ` / `ˌ` → boundary; `ː`, `˥`, lone U+0303
→ mark (category null); mark grapheme → mark with category;
`MARK_CATEGORY_NAME === MARK_CATEGORY`; `roleAccepts` table for the two new
kinds.
`syllabify.test.ts`: `k a MARK n` → one range; `k a MARK t a` → `ka MARK ·
ta`; `k a MARK MARK` → one; `LOGO MARK t a` → `LOGO MARK · ta`; `MARK k a` →
one; `a MARK i` with `ai` listed → two ranges (documented limit); joins:
`a‿i` (joins {1}) one range with one glued group; `at‿a` → `a · ta`; `a‿ta`
→ `at · a`; `a‿t‿a` → one range; join + diphthong list interplay; and
`as‿ta` with sibilant clusters OFF: a join only forbids a cut, it never
licenses an onset — cluster `s t`, candidates: start=s (`st` invalid),
start=t (joined → skipped), start=to (empty onset, allowed) → `ast · a`.
Assert exactly that and say so in the test name.
`segment.test.ts`: a join entry produces no segment and neighbours'
`entryIndices` are the ORIGINAL indices (put the join in the SECOND run of a
two-run spelling — P-A6); join in template mode dropped; `C V MARK C2`
template matches `k a MARK n` exactly under syllable mode; a scheme without
a mark role: `k a MARK n` → `CV` block + mark single + lone `n` (the
degrade); stress `ˈ` mid-word cuts like `.`.
`compose.test.ts`: a mark grapheme in a slot draws; an IPA mark draws its
text stand-in and sets `containsVirtual`.
The normalization identity test stays green (no change expected).

## 4. Engine — Phase B (syllabary codas + syllabic consonants)

### 4.1 Syllabary codas — `syllabify.ts`

In `syllabify`'s main loop, when the opaque unit just closed has
`cls.kind === 'syllable'` (a syllable SIGN — not a logogram, not unknown,
not a mark), the following stretch is examined before `syllabifyStretch`:
let `lead` = its units up to (not including) its first nucleus (or the whole
stretch when it has none), marks included. Find `b` = the first position in
`lead` (from its start to one past its end, in order) at which the tail
`[b, leadEnd)` is a legal onset (`onsetAccepts` on the non-mark sounds; a
position right before a mark or in `joins` is skipped as in 3.2). The units
`[stretchStart, b)` are appended to the syllable sign's range, and the
stretch starts at `b`. With no nucleus in the stretch, `leadEnd` is the
stretch end, so the whole consonant run joins the sign (`ka n` → `kan`,
`ka s t` → `kast`). A stretch that starts with a nucleus has an empty lead
and nothing changes. Only ONE syllable sign's range grows this way; a sign
followed by another sign gets nothing.

Examples to pin: `KA n t a` → `KAn · ta`; `KA t a` → `KA · ta`; `KA s t a`
off → `KAs · ta`, on → `KA · sta`; `KA n` → `KAn`; `KA n MARK t a` →
`KAn MARK · ta`; `KA LOGO n a` → `KA · LOGO · na` (a logogram is not a
syllable sign); `t KA` → `t · KA` (a sign takes no onset).

`joinOpaqueUnits` in segment.ts still runs afterwards: a range that already
grew is no longer "lone", so it is never joined again (good — it was the
sign's own coda, not a phonetic complement). Assert that too.

### 4.2 Syllabic consonants — `syllabify.ts` + types + validator

- `SyllabifyOptions.syllabicConsonants?: readonly string[]`.
- Role assignment becomes a two-pass function `unitRoles(units, options)`:
  1. base role per unit (`unitRoleOf`), then a consonant unit is promoted to
     `nucleus` when its sound describes (`describePhoneme(comparable(sound))`)
     with `'̩'` (COMBINING VERTICAL LINE BELOW, the IPA syllabic mark) in
     `features.modifiers` — export `SYLLABIC_MARK = '̩'` from
     `generator/phonology/features.ts` next to `LENGTH_MARK`;
  2. a consonant unit whose comparable sound is in the (normalised) list is
     promoted when NEITHER neighbouring non-mark unit within the stretch is a
     pass-1 nucleus (vowel or diacritic-syllabic). Pass-2 promotions do not
     see each other (`vlkr` → `l` and `r` both cores → `vl · kr`).
- `glueNuclei` glues only VOWEL nuclei (`cls.letters.includes('V')`) — a
  syllabic consonant never joins a diphthong.
- `segmentSyllables` passes `scheme.split?.syllabicConsonants ?? []`.
- `types.ts` field (§2) · `validate.ts` `validateSoundList` shared by both
  lists · `index.ts` exports (`normalizeSoundList`, `MAX_SOUND_LIST`,
  `MAX_SOUND_LENGTH`; `SYLLABIC_MARK` is imported from the phonology module
  where needed).

Shipped as: `SYLLABIC_MARKS = [U+0329, U+030D]` (both IPA syllabic marks;
`SYLLABIC_MARK` is the first). Pass 2 promotes only the LAST of a run of
consecutive candidates (so `mlha` → `ml · ha` as pinned below), and a
syllable SIGN beside a listed consonant counts as a vowel neighbour
(`KA r t a` → `KAr · ta`).

Examples to pin: `p r s t` with `r` listed → one range `prst`; `k r t e k` →
`kr · tek`; `v l k` → `vlk`; `k a r t a` → `kar · ta`; `b r a t r` → `bra ·
tr`; `m l h a` → `ml · ha`; `r̩` (sound `r̩`, nothing listed) → core; `r̩ a`
→ `r̩ · a` (two nuclei, empty cluster); with `ai` and `r` listed: `a i r` →
`air` (r next to i, so consonant); a list entry that is not a consonant is
harmless; `n` listed and a grapheme whose sound is `ŋ` NOT promoted (exact
comparable match only).

### 4.3 Tests (Phase B)

`syllabify.test.ts` (both sections above), `validate.test.ts`
(`syllabicConsonants` per-entry issues; N1 normalised absent when empty;
`validateSoundList` parity with the diphthong behaviour — same messages),
`segment.test.ts` (`KA n t a` under a `SYL C` + `CV` scheme → two blocks;
`prst` with `r` listed — NOTE a syllabic `r` is class `C L R`, NOT `V`, so
a `V` box does NOT accept it: pin the degrade (`prst` with only a `C V C`
template → template-order fallback) AND the working case with a template
whose middle role is `class: 'R'` or `any`; record in `todo.md` that the
seed does not build such a template).

## 5. Designer — Phase C

### 5.1 `SplitSettings.tsx` — extract the chip list, add the second list

- Move `DiphthongList` out into `SoundList.tsx` (one component,
  `export default function SoundList(props)`) with props: `title`,
  `description`, `list`, `suggestions`, `suggestionsLabel`, `inputLabel`,
  `placeholder`, `listLabel` (the `<ul aria-label>`), `noun` ("A vowel pair"
  / "A consonant", for the length message), `warn(entry): string | null`
  (visible warning text for a bad entry, or null), `example: ReactNode`,
  `dataPrefix` (`'diphthong'` for the vowel list → the root attribute
  `data-diphthong-settings` and `data-diphthong`, `data-diphthong-example`,
  `data-diphthong-warning`, `data-diphthong-suggestions`,
  `data-diphthong-cap`, `data-diphthong-problem` exactly as today, so the
  existing selectors keep working; `'syllabic'` for the new list).
  `MAX_SOUND_LIST` / `MAX_SOUND_LENGTH` for the cap and length message.
- The vowel list renders EXACTLY as before (`splitSettings.test.tsx` passes
  unchanged).
- New sub-option under *By syllable*, after the vowel list: "Consonants that
  can carry a syllable" — description: "A syllable usually needs a vowel.
  List the consonants that can stand in for one, and a word with no vowel
  between them (prst, vlk) is still cut into syllables. A listed consonant
  only counts when no vowel is next to it." Warning for an entry that is not
  exactly one consonant: "`x` is not one consonant, so it will not carry
  anything." Example line: "With r: krtek → kr · tek. Without: krtek →
  krtek." built by `syllabicExample(entry)` = `k` + entry + `tek` (pure).
  Suggestions: `suggestSyllabicConsonants(graphemes)` — every grapheme's
  primary phoneme (first auto-spelling, else first) that `describePhoneme`s
  as a consonant with manner nasal / lateral_approximant / trill / tap /
  approximant, NFC, unique, in grapheme order; offered as "Suggested from
  your signs:". `BlocksPage` computes it from `data.graphemeMap` (whole
  value read out first, P-C4) and passes `syllabicSuggestions`.
- Keep `diphthongSuggestions.ts` (tests import it) and ADD
  `isSingleConsonant`, `suggestSyllabicConsonants`, `syllabicExample` to it;
  update its module JSDoc.
- `normalSplit(mode, sibilantClusters, diphthongs = [], syllabicConsonants =
  [])` / `withSplit(...)` likewise; every radio / checkbox / list change
  passes BOTH current lists (a toggle never drops either — extend the
  existing "keeps the list" tests to the second list).
- A visible one-liner under *By syllable* (class `example`): "In a
  pronunciation, `.` forces a cut and `‿` forbids one: a‿i stays in one
  block. Stress marks (ˈ ˌ) cut like `.`."

Shipped as: `warn(entry)` returns `ReactNode | null` (the entry is set in
`<em>`); the consonant list's description adds a sentence on the template it
needs (a core role of class R, or Anything); `suggestSyllabicConsonants`
also skips a sound already written with a syllabic mark.

### 5.2 Word keyboard — a **Join** key next to **Boundary**

Mirror the Boundary key exactly (`GlyphCanvasInput.tsx` `handleBoundary` /
`registerBoundaryGlyph`, `GlyphKeyboardOverlay.tsx` `onBoundary`,
`createBoundaryGlyph` / `isBoundaryGlyphName` in the canvas utils, the slim
dashed tile in `GlyphCanvas.tsx`): `onJoin`, `createJoinGlyph()` (IPA `‿`),
`isJoinGlyphName`, tile drawn as a slim tile showing "‿" (read the Boundary
tile's SCSS and add a `join` modifier — token colours only), shown only
while blocks are on, in the same row as Boundary, `aria-label="Join - keep
the signs on both sides in one block"`. No physical key (nothing on a
keyboard means `‿`). The pronunciation → spelling path already keeps `‿` as
an IPA entry (`buildSkipUnits`), so words typed as IPA need nothing.

Shipped as: the key's handler is `handleJoinKey` (`handleJoin` was already
the block popover's "Join with next block"); `JOIN_CHARACTER = BLOCK_JOIN`
in `virtualGlyphUtils.ts`; the tile is a slim SOLID bar (`.joinBackground`,
tooltip "Block join", `data-join="true"`), not a dashed one.

### 5.3 Roles editor — a "mark" preset

`RolesEditor.tsx`'s matcher `<select>`: add `<option value="mark">mark
(accent, tone…)</option>` mapping to `{ kind: 'category', category:
MARK_CATEGORY }` (import from `db/wordSymbolService` — the designer may
import the DB module; the engine may not). Reading back: a category matcher
whose category equals `MARK_CATEGORY` shows the `mark` option; any other
category shows `category…` with its text box (so `logogram` still shows as
`category… [logogram]`). The two helpers at the top of the file get the two
branches + tests in the roles editor test file (add `rolesEditor.test.tsx`
with the happy-dom harness of `splitSettings.test.tsx` if none exists).

Shipped as: a category matcher ALWAYS shows its text box, the mark
included (so typing `markup` passes through `mark` without losing the box);
the select shows the `mark` option while the box reads exactly `mark`.

## 6. Designer — Phase D: "Check all my words"

### 6.1 Pure — `wordCheck.ts` (next to `blockSchemeDraft.ts`)

```ts
export interface WordCheckRow { wordId: number; label: string; readout: string; detail: string }
export interface WordCheckList { rows: WordCheckRow[]; count: number }   // count is exact; rows are capped
export interface WordCheck {
    checked: number;                 // words with a non-empty spellingDisplay
    clean: number;                   // words whose every entry ended in a block
    unplaced: WordCheckList;         // a `single` that is NOT a consonant and NOT unknown: vowel alone, syllable sign, logogram, mark alone
    loneConsonants: WordCheckList;   // singles with `consonant: true` (detail says "with the mark" / "drawn alone")
    unreadable: WordCheckList;       // an entry whose class is `unknown`
    unusedTemplates: { id: string; name: string }[];
}
export function checkWords(words: readonly LexiconComplete[], scheme: BlockScheme, index: BlockGraphemeIndex): WordCheck
```

Runs `segmentEntries` ONCE per word (the SAME segmenter as the renderer —
never re-derive), `classifyEntry` for the unreadable test, and builds the
readout the way `summarizeBlocks` does (extract its readout builder into a
shared helper rather than calling `summarizeBlocks`, which would segment
twice — P-D1). `label` = `pronunciation || lemma`. A word can appear in
several lists. `detail` is plain language: "n at the end is drawn alone",
"n at the end has the vowel-killer mark", "ka (syllable sign) is drawn on
its own", "? cannot be read". Words are checked in lexicon order; each
list keeps at most `MAX_WORD_CHECK_ROWS = 200` rows (its `count` stays
exact).

Shipped as: `checkWords.ts` (not `wordCheck.ts` — on a case-insensitive file
system `./WordCheck` would resolve to it) plus `readout.ts` (`readEntry`,
`readSegments`, `drawsWithMark`, shared with `summarizeBlocks`).
`checkWords` takes `CheckedWord[]` (`Pick<LexiconComplete, 'id' | 'lemma' |
'pronunciation' | 'spellingDisplay'>`); a syllabic core drawn alone is listed
under `unplaced`, whose details read "… is drawn on its own".

### 6.2 `WordCheck.tsx`

Section "Check all my words" under "Try a word": a hint ("Runs the settings
and templates above, unsaved changes included, over every spelled word."),
a button `Check N words` (N = spelled words; disabled at 0), and — after a
click — the report: a status line "N words checked · M split cleanly", then
one collapsible group per non-empty list (`<details open>` for the first
non-empty, closed for the rest): title with count, rows `label — readout —
detail`, each row with a button "Try it" → `onTryWord(wordId)`; "Templates
no word uses" as a plain list. `data-word-check`, `data-word-check-row`,
`data-word-check-group="unplaced|lone|unreadable|unused"` attributes. The
report is stale the moment the draft changes: keep the scheme it was
computed against and show "Settings changed since this check — run it
again" (class `note`) when `scheme !== checkedScheme`. Compute on click,
never live (`useState` for the result; no effect).

Shipped as: group titles "Signs drawn on their own", "Consonants with no
vowel", "Signs that cannot be read"; extra hooks `data-word-check-status`
and `data-word-check-stale`; a "No spelled words yet" caption at 0.

### 6.3 Wiring

`BlockPreview` gets optional controlled props `wordId?: number | null`,
`ipa?: string`, `onWordChange?: (id: number) => void`, `onIpaChange?:
(ipa: string) => void`; when given they win over the internal state
(uncontrolled use in `TemplateEditor` stays as is). `BlocksPage` owns
`tryWordId` + `tryIpa` for the "Try a word" instance and passes `onTryWord`
to `WordCheck` (sets the id, clears the ipa, and `scrollIntoView({ behavior:
'smooth' })` on the try section via a ref — guarded for happy-dom).

### 6.4 Tests

`wordCheck.test.ts` (pure: every list, clean count, truncation, unused
templates, several lists for one word, empty lexicon), `wordCheck.test.tsx`
(happy-dom, ONE stable `useEtymolog` mock object — P-C5: the report appears
only after the click, groups + rows + "Try it" calls back with the id, stale
note after a scheme change), `blockPreview.test.tsx` gains a controlled-
props case.

## 7. Docs + E2E — Phase E

- `README.md` § "Splitting words, flexible slots, lone consonants": bullets
  for marks / stress / `‿`, syllabary codas, syllabic consonants, the word
  check; the Designer bullet; § "The `.` boundary" gains the Join key.
- `src/components/tabs/writingSystem/README.md`: rows for `SoundList.tsx`,
  `wordCheck.ts`, `WordCheck.tsx`; the `SplitSettings.tsx` row.
- `todo.md` § "From the conlang-edges follow-up": known limits (mark between
  the vowels of a diphthong; syllabic consonant is class C not V, seed does
  not add a core role; join never licenses an onset; logogram codas).
- Live E2E (Claude in Chrome, alpha `localhost:5178`, demo language): a mark
  grapheme + `C V MARK` template; `‿` typed in "Try a word"; a syllable-sign
  word; `r` listed + `prst`; the Join key on a word form; "Check all my
  words" report and "Try it". Restore the demo afterwards.
- Final audit: full `vitest run`, `tsc -b` (ignore the 4 pre-existing
  `packages/object-store` errors), `eslint .`.

## 8. Pitfalls (read before writing code)

- **P-A1 Engine purity.** `src/blocks/*` imports nothing from `src/db`
  (`MARK_CATEGORY_NAME` is redeclared, with the equality test). Nothing from
  React.
- **P-A2 Byte-identical when the feature is unused (P1 of every earlier
  plan).** No join entries → compaction is the identity → every existing
  segment / normalization test passes untouched. Template mode untouched.
- **P-A3 One definition of "opaque".** `segment.isOpaque` calls
  `unitRoleOf` from syllabify; never a second copy of the test.
- **P-A4 Marks have a `sound` but no phoneme.** An IPA mark entry's
  `entrySound` is `ː`; `onsetAccepts` on it returns false (undescribable),
  which would wrongly block an onset. Filter marks OUT of every tail before
  the sonority check, by ROLE not by sound.
- **P-A5 `medialBoundary` may now return `null`** (every candidate joined or
  before a mark). The caller merges; never push an empty `[x, x)` range and
  never let `syllableStart` run backwards.
- **P-A6 Positions.** `joins` for `syllabify` are indices into ITS `units`
  array (run-relative, compact). Off-by-one here silently moves every cut.
  Test with a join in the second run of a two-run spelling.
- **P-A7 `‿` is already a `'syllable'` separator in the tokenizer**, and so
  is `.`. Classify by the exact character, not by separator kind, or `.`
  becomes a join. Stress IS classified by kind (`ˈ` and `ˌ`).
- **P-B1 Syllabic consonants are class `C`.** They fill `C`/`R`/`L`/`N`/
  `any` boxes, never `V`. Do not "fix" that in `classify` — it would make
  every listed consonant a vowel for every template.
- **P-B2 Neighbour test ignores marks** and stops at the stretch ends
  (opaque walls / run ends). The neighbour must be a PASS-1 nucleus.
- **P-B3 Syllabary coda growth is for `syllable` signs only.** A logogram,
  unknown or mark before a consonant run behaves as today.
- **P-C1 N1 again.** `normalSplit` emits `syllabicConsonants` only when its
  normalised list is non-empty, via the validator's own `normalizeSoundList`.
  Toggling ANY control must pass BOTH lists through. A phantom "Unsaved
  changes" after Save is the symptom; `schemeOptions.test.ts` parity tests
  catch it — extend them.
- **P-C2 Fast Refresh.** Component files export ONE component; every pure
  helper lives in a `.ts` file (`SoundList.tsx` exports only `SoundList`).
- **P-C3 Token ratchet** (`src/styles/__tests__/tokens.test.ts`) scans ALL
  of `src/` including tests: no colour literals, no `var(--x, fallback)`.
- **P-C4 React Compiler**: no `useMemo`/`useCallback` gymnastics beyond
  what the surrounding file does; read whole context values into locals
  first (P8 in earlier plans).
- **P-C5 `useEtymolog` mocks** return ONE stable object per mount (P7) —
  a per-call object loops the renderer and kills the worker.
- **P-D1 Never run the segmenter twice per word** in the check; a 2 000-word
  lexicon must stay well under a second. Never compute the report in render.
- **P-D2 `LexiconComplete.spellingDisplay` entries carry `grapheme` rows
  WITHOUT phonemes/glyphs** — always resolve through the grapheme map
  (`resolveEntryGrapheme` does), never read `entry.grapheme.phonemes`.
- **P-E1 Live E2E traps** (from the last round): CDP `form_input` and ref
  clicks may not reach React on this page — use the JS native value setter +
  dispatched `input` / `keydown` events + `button.click()`; the grapheme
  create page's `beforeunload` blocks navigation — click its Cancel first.
- **P-X Stage by path; never `git add -A`; the agent never commits.**

## 9. Outcome (2026-09-24)

Shipped on `alpha`: engine `8a8e59c` (Phase A) and `7b7fc4b` (Phase B),
designer `8648774` (Phase C) and `858775e` (Phase D), docs in the follow-up
commit (Phase E). Suite 3724/3724 green after Phase D (3496 before this
round), `tsc -b` clean in etymolog (only the 4 pre-existing
`packages/object-store` errors), `eslint .` clean. The reviewer's own
cross-module tests live in `src/blocks/__tests__/conlangEdges.audit.test.ts`.

Live-checked in Chrome on the demo language (alpha, `localhost:5178`): see
`todo.md` § "From the conlang-edges follow-up" for the exact list (what was
and was not reachable in the UI). The demo was restored afterwards (the
trial `r` removed and the scheme re-saved; the word form cancelled).

Known limits: `todo.md`, same section.
