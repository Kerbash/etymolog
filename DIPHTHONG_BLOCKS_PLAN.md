# Block script, part 3 — diphthongs and multi-sound consonant signs

Follow-up to `SYLLABLE_BLOCKS_PLAN.md` (read §2–§5 there first, and
`BLOCK_SCRIPT_PLAN.md` §2–§4 before that). Owner request (2026-09-24):

1. **Diphthongs spelled with two graphemes get split.** With *a* and *i* as
   separate graphemes, `tai` becomes `ta · i`; Vietnamese *nguyên* (`ŋwiən`)
   becomes `ŋwi · ən`. They should be ONE block.
2. **A grapheme whose sound is typed as several consonants is misread.** A
   grapheme with sound `ng` (meant as one Vietnamese consonant) classifies as
   a *syllable sign* (`classifySound`: several describable sounds, not all
   vowels → `syllable`), so it cannot fill a `C` box and the word falls apart.
   The same for `ts`, `kw`, `dʒ` typed without a tie bar.

Status: `[ ]` todo · `[~]` in progress · `[x]` done.

| Phase | What | Status |
|---|---|---|
| A | Engine: consonant-cluster signs read as consonants; `split.diphthongs`; syllabify glue; matcher takes glued groups; segment wires it | [x] |
| B | Designer: "Vowels next to each other" in `SplitSettings` (chips + suggestions); grapheme form hint for multi-sound consonant pronunciations | [x] |
| C | Docs, live E2E in Chrome, final audit | [x] |

A, then B, then C.

---

## 1. What the user gets

1. **Diphthongs stay in one block.** Under *By syllable* the owner lists the
   vowel pairs (or triples) their language treats as one vowel — `ai au iə`.
   Two vowel graphemes side by side whose sounds together form a listed
   diphthong are then ONE vowel: `tai` → one block, `ŋwiən` → one block.
   Both signs share the vowel box (drawn side by side by ink shape, exactly as
   several consonants already share a consonant box). No template change is
   needed: a `V` box that holds "exactly one" still takes the pair, because
   the pair COUNTS as one.
2. **A consonant sign whose sound is several consonants is a consonant.** A
   grapheme with sound `ng`, `ts`, `kw` fills a `C` box. In the grapheme form,
   typing such a sound shows a plain, visible hint: "`ng` reads as two sounds
   (n, g). If it is one sound, spell it `ŋ`." — a hint, never an automatic
   change (CLAUDE.md: no silent actions).

## 2. Data model (additive)

```ts
// BlockSplit — SYLLABLE_BLOCKS_PLAN.md §2
diphthongs?: string[];   // vowel sequences that stay in one syllable; absent = none
```

- Normalised form (**N1**, as before): `diphthongs` is emitted only when
  NON-EMPTY. Each entry is `safeNormalize(trim, 'NFC')`-ed, non-empty,
  de-duplicated (first occurrence wins), insertion order kept, at most
  `MAX_DIPHTHONGS = 32` entries, each at most 8 code points. The validator is
  STRUCTURAL only — it does not check that an entry is all vowels (the engine
  only ever glues nucleus units, so a stray consonant entry is harmless; the
  designer warns about it instead). Invalid entries are dropped one by one
  with an issue (`split.diphthongs[k]`), never the whole `split`.
- The designer's `normalSplit` must produce the same normalised form or the
  page shows a phantom "Unsaved changes" (N1 — this bit a previous phase).
- `diphthongs` only has an effect in `mode: 'syllables'` (like
  `sibilantClusters`); `normalSplit` drops it in template mode.

## 3. Engine (Phase A)

### 3.1 Classify — `classifySound` in `src/blocks/classify.ts`

New rule between "all vowels → V" and "otherwise → syllable sign":

- several sounds, every one describable, **every one a consonant** →
  `{ kind: 'phoneme', letters }` where `letters` = the class letters COMMON to
  every member (`classOf` on each, intersect) — `C` is always in it, so it
  fills a `C` role; `N` survives for `ŋm`-style clusters but `ts` (P + F)
  keeps only `C` and whatever else all share (`O`).
- The `syllable` kind now means "several sounds INCLUDING a vowel" — update
  the JSDoc here and on `RoleMatcher.syllable` in `types.ts`, and any user
  text in the designer that describes the Syllable role (grep `syllable sign`
  / `Syllable` in `src/components/tabs/writingSystem/blocks/` and the
  `roles` labels; keep it plain: "a sign for a whole syllable, like *ka*").

Sonority: `entrySound` returns the raw `ng` string; `isValidOnset(['ng', 'w'])`
finds no features for `ng` and returns `false`, so a multi-sound consonant
sign is licensed in an onset ONLY ALONE (`aŋga` with one `ng` grapheme →
`a · nga`; `angwa` → `ang · wa`). That is the documented behaviour — do not
try to peel the cluster for sonority; the sign is one consonant to its script.

### 3.2 Types + validator

- `BlockSplit.diphthongs?: string[]` (types.ts, JSDoc in plain words).
- `validate.ts`: `SPLIT_KEYS` gains `'diphthongs'`; `validateSplit` validates
  per §2 and emits only when non-empty. Export `MAX_DIPHTHONGS` from the
  barrel (`src/blocks/index.ts`) next to `MAX_SLOT_COUNT`.
- `cloneEmptyBlockScheme` / any deep-clone helper (`cloneScheme` in the
  designer) must copy the array (grep for `sibilantClusters` to find every
  place that spreads `split`).

### 3.3 Syllabify — `src/blocks/syllabify.ts`

- `SyllabifyOptions.diphthongs?: readonly string[]`.
- New export `glueNuclei(units, diphthongs): number[]` — a GROUP ID per unit
  (0-based, increasing, contiguous): every unit is its own group, except
  runs of 2–3 consecutive NUCLEUS units whose sounds (each `safeNormalize`d
  NFC + trim; a `null` sound never glues) concatenate to a listed diphthong,
  which share one id. Greedy left to right, longest listed match first
  (try 3 units, then 2). A glued group never spans an opaque unit or a
  consonant (only nuclei glue), and a unit belongs to at most one group.
- `syllabify` calls `glueNuclei` and treats a glued group as ONE nucleus:
  the medial cluster between two nuclei starts AFTER the whole group, and a
  boundary never falls inside a group. `ai` with `diphthongs: ['ai']` →
  `['ai']`; without → `['a', 'i']` (existing test stays green). `aia` with
  `['ai']` → `['ai', 'a']`; `aai` with `['ai']` → `['a', 'ai']` (greedy from
  the left: `a` alone, then `ai`). Document the greedy choice in the JSDoc.
- Existing exported signature and every existing test stay unchanged (P1).

### 3.4 Match — `src/blocks/match.ts`

`matchTemplate(template, rolesById, classes, start, end, mode, groups?)`:

- `groups?: readonly number[]` parallel to `classes` (absent = every entry
  its own group — the existing behaviour, byte-identical, P1).
- A role takes WHOLE groups: at `pos`, the group is `classes[pos .. q)` where
  `q` is the first index whose group id differs; the group is accepted only
  when EVERY entry in it is accepted by the role (`roleAccepts`). The `run`
  counter and `min`/`max` count GROUPS; `pos` advances by ENTRIES; `length`
  and `roleIds` stay per ENTRY (`roleIds` has `length` items — compose reads
  it per entry, unchanged). `emptyOptional` unchanged.
- `start` mid-group cannot happen from the segmenter (syllable boundaries
  never split a group) — but do not assume it: if `groups[start - 1] ===
  groups[start]` just treat `start` as a group start (no throw).

### 3.5 Segment — `src/blocks/segment.ts`

- Syllable mode: compute `groups = glueNuclei(units, diphthongs)` for the run
  (offset to absolute indices — build a full-length `groups` array for the
  whole spelling, singletons outside the run, so every `matchTemplate` call
  can take the same array), pass `diphthongs` to `syllabify`, and pass
  `groups` to EVERY `matchTemplate` call reached from syllable mode
  (`anyTemplateCovers`, the exact search, and `segmentGreedy` as the
  in-syllable fallback). Template mode passes no groups (P1).
- `segmentGreedy` fallback inside a syllable: when no template takes a glued
  group, the group falls to singles one entry at a time (a vowel single is
  fine — never a lone-consonant mark, since nuclei are vowels).
- Caption / readout consumers (`BlockPreview`, `blockUtils`) read `roleIds`
  per entry and need no change — verify by test that a `C1 V` template on
  `t a i` with `['ai']` yields ONE block with `roleIds: ['C1', 'V', 'V']`.

### 3.6 Tests (Phase A — the agent writes; I audit + run)

- `classify.test.ts`: `ng`, `ts`, `kw` → phoneme with `C`; `ka` still
  `syllable`; `ai` still `V`; `n͡g` (tie bar, undescribable) still `unknown`.
- `syllabify.test.ts`: `glueNuclei` unit cases (§3.3 examples, null sound,
  opaque between, triple `iəu`, no glue across a consonant, longest-first);
  `syllabify` with diphthongs: `tai` → `['tai']`, `ŋwiən` → `['ŋwiən']`
  (`w` is a consonant, G class), `taia` → `['tai', 'a']`, `kaia` with
  `['ai']` → `['kai', 'a']`, and every existing case unchanged without the
  option.
- `match.test.ts`: groups — a group counts as one against `max: 1`; a group
  rejected as a whole when one member is not accepted; `roleIds` per entry;
  absent `groups` ≡ singleton groups (same result on the whole existing
  table).
- `segment.test.ts`: `t a i` with `C1 V` + `['ai']` → one block; without →
  `[ta] [i]`; template mode ignores diphthongs; `ŋ w i ə n` with the flexible
  `C1(0–4) V C2(0–4)` fixture + `['iə']` → one block, `roleIds`
  `['C1','C1','V','V','C2']`; a diphthong group no template takes → singles.
- `validate.test.ts`: N1 for `diphthongs` (empty → absent; dedupe; NFC;
  trim; cap; non-string entry dropped with an issue path
  `split.diphthongs[k]`; whole `split` survives).
- `compose.test.ts`: one case — a `V` slot (`max` absent) with two entries
  via `roleIds` composes two cells inside the V rect (already supported;
  the test pins it).
- Run: `pnpm vitest run src/blocks` then the whole suite.

## 4. Designer (Phase B) — plain language first (P3)

### 4.1 `schemeOptions.ts`

- `normalSplit(mode, sibilantClusters, diphthongs: readonly string[] = [])`
  → `diphthongs` only in syllables mode and only when non-empty, normalised
  EXACTLY like the validator (share one helper: export
  `normalizeDiphthongs(list): string[]` from `src/blocks/validate.ts` and
  call it from both — one source of truth for N1).
- `withSplit` gains the same parameter; every caller updated (`BlocksPage`).
- `SplitSettings` reads `split?.diphthongs ?? []`.

### 4.2 `SplitSettings.tsx` — new sub-option under *By syllable*

```
 [ ] Let a syllable start with s + another consonant (sp, st, str)
 Vowels next to each other
   Two vowel signs in a row are usually two syllables (a · i). List the
   vowel pairs your language says as one vowel, and they stay in one block.
   [ai ×] [au ×] [iə ×]   [ type a vowel pair… ] [Add]
   Suggested from your word shapes: [+ ai] [+ ei]        ← only when any
   With ai: tai → tai. Without: tai → ta · i.
```

- A small controlled text input + Add button (Enter adds too); chips with a
  remove `×` button (accessible name "Remove ai"). Adding trims/NFCs,
  ignores empty and duplicates. An entry that is NOT two-or-more vowels (use
  `tokenizeIpa` + `features.kind === 'vowel'`) is still added (the owner may
  know better) but shows an inline warning line under the chips: "*au* is
  not two vowels, so it will not join anything." — visible, no tooltip.
- Suggestions: new pure module
  `src/components/tabs/writingSystem/blocks/diphthongSuggestions.ts`
  exporting `suggestDiphthongs(syllables: readonly SyllableTemplate[]): string[]`:
  parse every shape with `parseTemplate` (skip on throw), collect every
  `literal` item member that tokenizes to ≥ 2 sounds, all vowels; dedupe;
  NFC; stable order of first appearance. Suggestions already in the list are
  not shown. The page passes `settings.wordGenerator.profile.syllables`
  (already read in `BlocksPage`).
- The live example line uses the FIRST listed diphthong when there is one
  (`With ai: …`), the fixed `ai` example otherwise.
- Every visible string: no "nucleus", "hiatus", "glide" (P3).
- Styles in `settings.module.scss` (chips, input row); tokens only (P5) —
  check what `slotSettings.module.scss` / `seedChoice.module.scss` already
  use for chips and reuse a class if one fits.
- Tests: `SplitSettings.test.tsx` (existing? grep — extend or create) with
  the stable single-object `useEtymolog` mock if the component needs it
  (P7): add / remove / duplicate / Enter / suggestion click / warning line /
  normalised `onChange` payload; `diphthongSuggestions.test.ts`;
  `schemeOptions.test.ts` normalisation parity with the validator (assert
  `normalSplit(...)` deep-equals `validateBlockScheme({...}).scheme.split`).

### 4.3 Grapheme form hint — multi-sound consonant pronunciations

- New pure module `src/components/form/customInput/pronunciationTableInput/soundShapeHint.ts`
  exporting `soundShapeHint(pronunciation: string): string | null`:
  - `describePhoneme(trimmed)` succeeds → `null` (one sound: fine);
  - `tokenizeIpa` gives ≥ 2 describable sounds, all consonants →
    ``"`ng` reads as two sounds (n, g). If it is one sound, spell it ŋ."``
    — the `ŋ` suggestion ONLY for the exact pairs in a tiny table
    (`ng → ŋ`, `ny → ɲ`, `sh → ʃ`, `ch → tʃ`, `zh → ʒ`, `th → θ`, `dj → dʒ`,
    `ts → t͡s`, `dz → d͡z`); otherwise the sentence ends after the list:
    "`kw` reads as two sounds (k, w). That is fine if your sign stands for
    both.";
  - ≥ 2 sounds with a vowel → `null` (a syllable sign or a diphthong sign is
    a normal thing to type; the block designer explains those);
  - anything undescribable → `null` (the IPA keyboard already guides).
- Render: under each row's text input in `pronunciationTableInput.tsx`, a
  `<p data-sound-hint role="note">` with the hint for THAT row's current
  text. The row text lives in the inner SmartForm's uncontrolled field, so
  the component must observe it: prefer the inner form's field-change hook /
  `onChange` of `LabelShiftTextCustomKeyboardInput` if it exposes one; if
  neither is available, keep a `hintText` map in row state updated from the
  input's native `onInput` (bubbling from the wrapper `<td>` is acceptable).
  Hidden while the grapheme is a logogram (the table is `hidden` then
  anyway). Add the two sentences to `translationMap.ts` as functions of the
  sound list are NOT needed — keep the hint English in the pure helper (the
  rest of this form's user text is English too).
- Tests: `soundShapeHint.test.ts` (table above, `n͡g` → null, `ai` → null,
  `ka` → null, `ŋ` → null); a `pronunciationTableInput` render test that
  types `ng` and finds the note (`// @vitest-environment happy-dom`; look at
  `src/components/form/graphemeForm/__tests__` for how the form is mounted).

## 5. Docs + E2E (Phase C)

- `README.md` (etymolog): extend "Splitting words, flexible slots, lone
  consonants" with a "Diphthongs" bullet and the consonant-cluster-sign rule.
- `src/components/tabs/writingSystem/README.md`: the SplitSettings section.
- `todo.md`: remove/adjust anything now done; add the known limits below.
- This plan: §7 outcome with commit shas and what was live-checked.
- Live E2E (Claude-in-Chrome, alpha etymolog dev server, the demo language):
  list `ai`; spell `t a i` with two graphemes → one block; save → no phantom
  unsaved change → reload keeps the list; a grapheme with sound `ng` fills a
  `C` box and the form shows the hint. Discard trial data afterwards.

## 6. Pitfalls (read before writing code)

- **P1 byte identity.** No `diphthongs` ⇒ every existing snapshot / compose /
  segment test passes UNCHANGED. `matchTemplate` without `groups` must run
  the exact same search as today. The classify change (§3.1) is the ONE
  deliberate behaviour change: a grapheme whose sound is several consonants
  was a syllable sign and is now a consonant — grep the tests for a
  fixture like that (`fakeGrapheme(..., 'ts')`) and update its expectation
  with a comment, never silently.
- **N1 normalised form** (§2) — validator and `normalSplit` share
  `normalizeDiphthongs`. Phantom "Unsaved changes" after save = you broke it.
- **P2** `slot.min ?? 1`, `slot.max ?? 1` everywhere; groups count as ONE.
- **P3 no jargon** in visible text: not "nucleus", "onset", "coda", "hiatus",
  "glide", "sonority", "cluster" (say "several consonants").
- **P4 visible, not silent:** the hint never rewrites the pronunciation; the
  designer never adds a diphthong by itself (suggestions are buttons).
- **P5 token ratchet** (`src/styles/__tests__/tokens.test.ts` scans every src
  file incl. tests): no colour literals, no `var()` fallbacks, no undefined
  custom properties. Reuse chip styles.
- **P6 React rules:** component files export only components
  (react-refresh) — helpers go in `.ts` modules; no hand-memo of derived
  values (React compiler lint); StrictMode double-invokes effects.
- **P7 `useEtymolog` mocks** in tests return ONE stable object (a fresh
  object per call loops effects and kills the vitest worker silently).
- **P8** Never commit; never `git add -A`; never `pnpm ci:full`; never a
  non-frozen `pnpm install`; never `rm -rf` in a worktree. Run
  `pnpm vitest run <paths>`, `pnpm typecheck`, `pnpm lint` from
  `apps/etymolog` (worktree alpha). Four `packages/object-store` tsc errors
  are pre-existing (resolved from MAIN) — ignore them.
- **P9 IPA strings:** compare sounds only after `safeNormalize(x, 'NFC')`
  (from `generator/phonology/features`) and `trim()`; `Array.from` for code
  points, never `.length` on the raw string for the 8-code-point cap.
- **P10 Python/heredoc escapes:** if you script an edit, `\b` and `\u0000`
  in Python strings become bytes — prefer the Edit tool.

## 7. Outcome (2026-09-24)

Shipped on `alpha`: engine `e8fafe0` (Phase A), designer + grapheme-form
hint `876273c` (Phase B), docs in the follow-up commit (Phase C). Suite
3496/3496 green, `pnpm typecheck` clean in etymolog (only the 4 pre-existing
`packages/object-store` errors, resolved from MAIN), `pnpm lint` clean.

Live-checked in Chrome on the demo language (alpha, `localhost:5178`):
`ai` added via the chips input; "Try a word" then reads `tai → 1 block: CV`,
`taia → tai · a`, `kaita → kai · ta`; with `iə` also listed, `ŋwiən → 1
block: CVC`. Save cleared "Unsaved changes" (no phantom change) and the list
survived a reload. The grapheme form's pronunciation row shows the note for
`ng` ("… spell it ŋ."), `kw` ("… stands for both.") and `str` ("three
sounds … all of them."), and nothing for `ka` or `ŋ`. The trial entries were
removed again and the scheme re-saved, so the demo is as it was.

Known limits: `todo.md` § "From the diphthong follow-up".
