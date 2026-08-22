# Etymolog word generator — plan

Worktree: `D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega` (branch `omega`, HEAD `fe72f8d`,
15 commits over master). All paths below are relative to `apps/etymolog/` unless they start with `packages/`.

Feature, in one paragraph: a **word generator** under the Lexicon tab that builds candidate
pronunciations (IPA strings) from a phonotactic **profile** — sound inventory, syllable shapes,
frequency tilt, constraints — and hands the ones the user keeps to the lexicon, where the existing
auto-spell turns them into written words. **Flavour presets** ("Elvish / flowing", "Harsh /
guttural", "Japanese-like", …) fill a profile in one click and can be shown as a **guide overlay on
the IPA chart**: core sounds lit, flavour sounds soft, avoided sounds dimmed — a suggestion, never a
rule. Text-to-speech is explicitly OUT of scope (see §7).

---

## 0. Verified facts that shape the plan (read before designing anything)

1. **Settings are localStorage, not SQLite.** `src/db/api/settingsApi.ts` keeps one
   `EtymologSettings` object under `etymolog_settings_v1`; every write goes through
   `validateSettings()` in `src/db/api/settingsSchema.ts`, which is hand-written (no schema lib),
   returns a COMPLETE object plus `issues[]`, and `update()` is STRICT — any issue rejects the whole
   update with `VALIDATION_ERROR`. Unknown top-level keys are reported as issues (`KNOWN_KEYS`).
   Settings are embedded in the JSON/PNG export envelope (`src/db/exportImport/jsonCodec.ts`
   `collectExportData` → `settings`) and re-applied on import through `settingsApi.import()` (lenient).
   ⇒ The generator profile is a new settings key `wordGenerator`; **no DB migration**. It travels with
   JSON/PNG exports, not with raw `.sqlite` (same known limitation as `customCharts`, `todo.md`).
2. **The conlang's sound inventory is `Phoneme` rows on graphemes** (`src/db/types.ts:149`):
   `{ phoneme: string, use_in_auto_spelling, context }`. A phoneme string may be multi-character
   (`t͡ʃ`, `pʰ`, `aː`, `kʷ`) — auto-spell's DP matcher handles that (`src/db/autoSpellService.ts`).
   Live access: `api.grapheme.getPhonemeMap()` → `Map<phoneme string, GraphemeComplete>` (ALL
   phonemes), `api.phoneme.getAutoSpelling()` → only the ones flagged for auto-spelling. Reactive
   copy: `useEtymolog().data.graphemesComplete[].phonemes`.
3. **`createLexicon` does NOT auto-spell.** `src/db/lexiconService.ts:154` stores whatever
   `glyph_order` it is given (`[]` if none). The word form computes `glyph_order` from the spelling
   canvas. To batch-create generated words with a spelling, call
   `previewAutoSpellingWithFallback(ipa)` (`AutoSpellResultExtended.spelling: AutoSpellEntry[]`, each
   `{ grapheme_id, isVirtual, ipaCharacter? }`) and convert: real → `createGraphemeEntry(id)`
   (`"grapheme-<id>"`), virtual → the bare IPA character. No helper for that conversion exists yet —
   Phase 5 adds `autoSpellToGlyphOrder()` in `src/db/utils/spellingUtils.ts`.
4. **Query-string prefill precedent**: `NewGraphemePage` reads `?phoneme=` with `useSearchParams`
   and feeds it as a default value (`src/components/tabs/grapheme/newGrapheme/NewGraphemePage.tsx:43`).
   `LexiconFormFields` registers `pronunciation` with `defaultValue` only in edit mode
   (`src/components/form/lexiconForm/LexiconFormFields.tsx:199`). The lexicon create route has no
   prefill today.
5. **IPA chart data** (`src/data/ipaChartData.ts`): `IPA_CONSONANT_CHART[manner][place] = { voiceless, voiced }`
   (pulmonic only), `IPA_VOWEL_CHART: VowelPosition[]` (`height`, `backness`, `rounded`),
   `IPA_AFFRICATES` (with tie bar U+0361: `t͡ʃ`), `IPA_CLICKS`, `IPA_IMPLOSIVES`. There is NO
   per-symbol feature lookup today (no `describeConsonant('ʃ')`); Phase 1 builds one from these tables.
   The chart components: `IPAChartCell` (one cell; `size`, `description`, tooltip via `HoverToolTip`),
   `IPAConsonantChart` (table), `IPAVowelChart` (SVG trapezoid, cells in `<foreignObject>`),
   `IPACombinedChart` (both, in a `PannableCanvas`, `enableWheel={false}`), `IPASyllabaryChart`.
   Props are typed in `src/components/display/ipaChart/types.ts`; all take `phonemeMap` + `onCellClick`.
6. **Chart page skeleton**: `ChartPageLayout` (`src/components/tabs/grapheme/chartPage/`) — `title`,
   `description`, `back`, `actions` (right-aligned header slot), `facts` (QuickFactsRow), `about`
   (collapsed explainer). `IPAChartPage` is a thin wrapper; `SyllabaryChartPage` likewise.
7. **Lexicon tab routing**: `src/components/tabs/lexicon/main.tsx` owns `<Routes>` (`index`, `create`,
   `db/:id`, `db/:id/edit`). Top-level `App.tsx` mounts it at `lexicon/*`. Routes are constants in
   `src/url_mapping.ts` (`ROUTES`), resolved with `resolveUrl()`; `TAB_ROUTES` must NOT change (a
   ratchet test pins the four tabs). `LexiconHome` has a `PageHeader` with an `actions` slot (one
   "New word" `IconButton`).
8. **Settings-driven page precedent**: `WritingSystemPage` edits settings live with plain controls +
   `api.settings.update({ writingSystem: { ...writingSystem, [key]: value } })` through
   `useApiAction` (toast on failure). It is NOT a SmartForm — there is no submission, every change
   persists. The generator's profile panel follows the same pattern (SmartForm exemption, §6).
9. **Shared primitives** (`src/components/shared/index.ts`): `PageHeader`, `LoadingState`,
   `DialogPanel`, `useConfirm`, `useNotify`, `useApiAction`, `FormActionBar`, `FieldHelp`,
   `EntityGallery`/`EntityCard`. From cyber-components (Next-free, safe in Vite): `Button`/`IconButton`
   (`buttonStyles.primary|secondary`), `EmptyState`, `QuickFactsRow`, `NumberedSectionHeader`
   (renders `<h2>`; pass `parts={{ title: { id, 'aria-level': 3 } }}` under a page h2),
   `ExpandableContainer`, `HoverToolTip`, `NotificationBanner` (inline via `parts.root.style.position='static'`),
   `BasicTable`, `Switch`, `Modal`. UNUSABLE (import `next/*`): `backButton`, `breadcrumb`,
   `subtleUnderlinedButton`, `linkListCategory`, `langSelector`, `socialIcon`.
10. **Spelling display**: `GlyphSpellingDisplay` (`src/components/display/spelling/`) renders a
    `glyphs` array; `IPAChartCell` uses it with `strategy="ltr"` and a fixed 40×40 config. Virtual
    glyphs come from `createVirtualGlyph(ipa)` (`src/components/form/customInput/glyphCanvasInput/utils`).
    `buildVirtualGlyphMap(result)` in `autoSpellService` maps an extended auto-spell result to virtual glyphs.
11. **Tests**: vitest, `environment: 'node'` (sql.js), component files opt in with
    `// @vitest-environment happy-dom` on line 1 and mount with `react-dom/client` + `act` from
    `react-dom/test-utils` (NO testing-library). Mocks: `vi.mock('../../../../db', …)` for
    `useEtymolog`; `matchMedia` + `ResizeObserver` stubs (copy from `LexiconEditor.test.tsx`). Suite
    today: **766 tests / 59 files**, lint 0/0, app tsc 0.
12. **Token ratchet** (`src/styles/__tests__/tokens.test.ts`) scans EVERY `.css/.scss/.ts/.tsx` under
    `src/`: no colour literals outside `index.css`, no `var(--x, fallback)`, every `--token` used must
    be defined in `index.css` (CLAUDE.md semantic set + 16 shape tokens + the app-derived block). New
    SCSS must use existing tokens only; a new app-derived token needs an entry in the `index.css`
    comment block AND the ratchet's vocabulary. Guide colours: core → `--status-good` /
    `--status-good-bg`, flavour → `--status-info` / `--status-info-bg`, avoid → `--status-disabled` /
    `--status-disabled-bg`. `--status-good` must NOT become TEXT (2.74:1 in light; `todo.md`).
13. **Lint rules that bite**: `react-hooks` flat recommended (incl. `set-state-in-effect`,
    `react-hooks/globals` — no writes to outer bindings during render), `react-refresh/only-export-components`
    (a `.tsx` module exporting a component may not also export non-components — put constants/types
    in a sibling `.ts`), `no-unused-vars` with `^_` exemption.
14. **Typecheck command**: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v packages/` (must
    print nothing). `tsc -b` never reaches the app.
15. **`vite build` writes the committed static site to `docs/`.** Build to verify; `git checkout -- docs`
    and delete new untracked `docs/assets/*` by name before every phase commit. Rebuild ONLY in the
    final release commit (`(etymolog): rebuild static docs site`).
16. **No dependency changes from the worktree** (lockfile). Everything below is dependency-neutral:
    seeded PRNG is hand-written (mulberry32), no TTS library.
17. **Worktree rules**: never `git add -A` (stage by path), never `pnpm install` (frozen only),
    never `rm -rf` under `.claude/worktrees`. Commit with `git commit -F <file>` (a `//` in `-m`
    aborts in PowerShell). Dev server: `omega-etymolog` → `http://localhost:5174/etymolog/`.

---

## 1. Phase overview

| # | Name | Commit message | Depends on |
|---|------|----------------|------------|
| 1 | Phonology core | `(etymolog): word generator phase 1 - IPA feature lookup, tokenizer, sonority, phoneme classes` | — |
| 2 | Profile, presets, settings | `(etymolog): word generator phase 2 - profile model, flavour presets, wordGenerator settings key, coverage` | 1 |
| 3 | Generation engine | `(etymolog): word generator phase 3 - seeded engine, syllable templates, constraints, dedupe` | 2 |
| 4 | IPA chart guide | `(etymolog): word generator phase 4 - flavour guide overlay on the IPA chart` | 2 |
| 5 | Generator page | `(etymolog): word generator phase 5 - generator page, add-to-lexicon flows, pronunciation prefill` | 3, 4 |
| 6 | Hardening + docs | `(etymolog): word generator phase 6 - audit fixes, docs, plan log` then `(etymolog): rebuild static docs site` | 5 |

Every phase is a separate commit on `omega`. Phases 1–3 are pure TypeScript (no React, no DOM) and
fully unit-testable in the node environment; 4–5 are UI.

**Standard acceptance for every phase** (the coordinator runs these, the implementer must too):

```bash
cd apps/etymolog
npx vitest run                                                    # count must be >= previous, all green
npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v packages/    # prints nothing
npx eslint src --max-warnings=0                                   # clean
npx vite build && git checkout -- docs                             # then delete untracked docs/assets/* by name
```

---

## 2. Architecture

```
src/generator/                     pure, framework-free (like src/rules/) — NO React, NO db imports
  phonology/
    features.ts        IPA symbol → features (kind, manner, place, voiced, height, backness, rounded)
    tokenize.ts        IPA string → phoneme tokens (base + diacritics/modifiers/tie bars kept together)
    sonority.ts        sonority scale + sequencing check for clusters
    classes.ts         class letters (C V N L G S F P …) and membership from features
    index.ts
  profile/
    types.ts           WordGeneratorProfile (+ WordGeneratorSettings) — the persisted shape
    defaults.ts        DEFAULT_PROFILE, limits
    validate.ts        validateGeneratorSettings(raw) → { settings, issues }  (settingsSchema style)
    index.ts
  presets/
    types.ts           FlavourPreset
    data/*.ts          one file per preset (7)
    index.ts           PRESETS registry, getPreset(id), applyPreset(preset) → profile
  coverage.ts          preset vs inventory: core present/missing, flavour present, avoid present
  engine/
    random.ts          mulberry32 PRNG + weighted pick (seeded, deterministic)
    weights.ts         frequency curve (Gusein-Zade) × user tilt
    template.ts        syllable template parser  "(C)V(N)" → alternatives with optional groups
    constraints.ts     sonority, geminates, harmony, forbidden sequences, cluster budget
    normalize.ts       pronunciation normalisation for dedupe (NFC, strip stress/dots/spaces)
    generate.ts        generateWords(profile, inventory, { count, seed, existing }) → GeneratedBatch
    index.ts
  inventory.ts         deriveInventory(phonemes[], profile) → classified inventory (+ warnings)
  index.ts

src/components/display/ipaChart/   + `guide` prop on cells/charts (Phase 4)
src/components/tabs/grapheme/ipaChart/IPAChartPage.tsx   + guide picker, legend (Phase 4)
src/components/tabs/lexicon/generator/                   the page (Phase 5)
```

Data flow: `settings.wordGenerator.profile` (persisted) + conlang phonemes (reactive, from context)
→ `deriveInventory` → `generateWords` → results → `previewAutoSpellingWithFallback` for the spelling
preview → `api.lexicon.create` (batch) or `/lexicon/create?pronunciation=…` (form).

---

## 3. Phase details

### Phase 1 — Phonology core (`src/generator/phonology/`)

**Goal**: given any IPA string the app can see (a phoneme row, a preset entry, a generated word),
answer "what is this sound?" deterministically, from the chart data that already exists.

**1.1 `features.ts`** — build a lookup `Map<string, PhonemeFeatures>` ONCE from `IPA_CONSONANT_CHART`,
`IPA_VOWEL_CHART`, `IPA_AFFRICATES`, `IPA_CLICKS`, `IPA_IMPLOSIVES`:

```ts
export type PhonemeKind = 'consonant' | 'vowel';
export interface ConsonantFeatures {
    kind: 'consonant';
    manner: MannerOfArticulation | 'affricate' | 'click' | 'implosive';
    place: PlaceOfArticulation | null;      // null for affricates built from two places, clicks
    voiced: boolean;
    sibilant: boolean;                      // s z ʃ ʒ ʂ ʐ ɕ ʑ and the affricates ending in them
}
export interface VowelFeatures {
    kind: 'vowel'; height: VowelHeight; backness: VowelBackness; rounded: boolean;
}
export type PhonemeFeatures = (ConsonantFeatures | VowelFeatures) & {
    base: string;            // the chart symbol
    modifiers: string[];     // diacritics / modifier letters found on the token (ʰ ʲ ʷ ː ̃ ˠ …)
    long: boolean;           // ː present
    nasalized: boolean;      // U+0303 present
};
export function lookupBase(symbol: string): PhonemeFeatures | null;   // exact chart symbol only
export function describePhoneme(token: string): PhonemeFeatures | null; // tokenized: strips modifiers, looks up base
export function describePhonemeLabel(token: string): string;          // "voiceless alveolar fricative" for tooltips
```

Affricate features: `t͡ʃ` → manner `affricate`, voiced from the first component, sibilant from the
second, place = second component's place. Also accept the tie-bar-less spellings `tʃ`, `ts`, `dʒ`,
`dz`, `tɕ`, `dʑ`, `ʈʂ`, `ɖʐ`, `tɬ`, `dɮ` as affricates when they arrive as ONE phoneme string (a
user types `tʃ` far more often than `t͡ʃ`) — `describePhoneme('tʃ')` must return the affricate.
Near-standard extras that the chart lacks but conlangers use constantly: `ɕ ʑ` (alveolo-palatal
fricatives, sibilant), `ʍ` (voiceless labial-velar fricative), `w` (voiced labial-velar approximant —
NOT in the pulmonic table; treat as approximant, place `velar`, voiced, glide), `ɫ` (velarised l →
lateral approximant), `ɚ ɝ` (r-coloured vowels → mid central), `ɹ̠`. Put these in an
`EXTRA_SYMBOLS` table in `features.ts` with a comment per entry.

**1.2 `tokenize.ts`** — `tokenizeIpa(input: string): IpaToken[]` where
`IpaToken = { text: string; index: number; features: PhonemeFeatures | null; separator?: 'stress' | 'syllable' | 'space' }`.
Rules: NFC-normalise first; a token = one base symbol + every following combining mark
(U+0300–U+036F), modifier letter (U+02B0–U+02FF, incl. `ː` U+02D0, `ʰ ʲ ʷ ˠ ˤ ̃`), and a tie bar
(U+0361 / U+035C) joins the NEXT base into the same token. `ˈ` `ˌ` `.` and spaces become
separator tokens (`features: null`). Unknown letters become tokens with `features: null` — never
throw. Export `splitPhonemeString(s)` = tokens without separators (what a preset/inventory entry is).

**1.3 `sonority.ts`** — the scale (higher = more sonorous):
vowel 10 (open > close: 10/9/8 by height group) · glide/approximant (non-lateral) 7 · lateral approximant
6 · trill/tap 6 · nasal 5 · fricative voiced 4 · fricative voiceless 3 · affricate 2 · plosive voiced 1.5 ·
plosive voiceless 1 · click/implosive 1. `sonorityOf(features)`. `isValidOnset(tokens)`: strictly
rising sonority (allow equal only for the `s`+plosive exception when `allowSibilantOnset`);
`isValidCoda(tokens)`: strictly falling. Both take the option bag so Phase 3 can switch the
exception on per preset.

**1.4 `classes.ts`** — reserved class letters and membership:

| Letter | Members |
|---|---|
| `C` | every consonant |
| `V` | every vowel |
| `P` | plosives + affricates + clicks + implosives (obstruent stops) |
| `F` | fricatives (incl. lateral fricatives) |
| `S` | sibilants (`sibilant: true`) |
| `N` | nasals |
| `L` | liquids: lateral approximants, trills, taps |
| `G` | glides: non-lateral approximants (`j w ɰ ʋ ɹ ɻ`) |
| `R` | sonorant consonants = N ∪ L ∪ G |
| `O` | obstruents = P ∪ F |

`classOf(features): ClassLetter[]`, `CLASS_LETTERS`, `isClassLetter(ch)`, `CLASS_LABELS` (for the
UI: `N` → "nasals"). A vowel is never in a consonant class and vice versa.

**1.5 Tests** (`src/generator/phonology/__tests__/`, node env): every chart symbol resolves
(iterate `getAllIPASymbols()` — none may return null); affricates with and without tie bar; extras;
`tokenizeIpa('ˈkʷaː.t͡ʃi')` → `[stress, kʷ, aː, syllable, t͡ʃ, i]` with the right `long`/modifier flags;
unknown char does not throw; sonority ordering table; `isValidOnset(['p','l'])` true,
`(['l','p'])` false, `(['s','t'])` only with the exception; class membership spot checks (`w` ∈ G, `ʃ`
∈ S ∩ F ∩ O, `m` ∈ N ∩ R, `a` ∈ V only). Target ≥ 45 tests.

**Pitfalls (Phase 1)**
- `'t͡ʃ'.length === 3` and `[...'t͡ʃ']` yields 3 code points; do NOT iterate strings with `split('')`.
  Use a code-point loop or `Intl.Segmenter` is NOT available in node env with certainty — write the
  loop by hand over `Array.from(str)` and join marks manually.
- `g` vs `ɡ` (U+0067 vs U+0261): the chart uses ASCII `g`; users paste both. Normalise `ɡ` → `g` in
  `tokenizeIpa` (and document it).
- NFC vs NFD: `ã` may arrive precomposed (U+00E3) — normalise to NFD for mark detection, but keep
  the ORIGINAL text on the token so round-tripping a user's string never changes it.
- The chart's `ɡ`-less `g`, the `ⱱ` tap and `ʙ` trill are real chart entries — don't hand-type a
  second table of consonants; DERIVE from `IPA_CONSONANT_CHART` so the two can't drift.
- `src/generator/**` must not import React, the db, or components — keep it importable from a
  node test without the sql.js setup (it will still run under the global `setup.ts`, which is fine).

### Phase 2 — Profile model, presets, settings (`src/generator/profile/`, `src/generator/presets/`)

**Goal**: a persisted, validated `wordGenerator` settings key; seven flavour presets as data; the
coverage computation the chart guide and the generator page both use.

**2.1 Profile type** (`profile/types.ts`):

```ts
export type FrequencyTilt = 'common' | 'normal' | 'rare' | 'off';
export interface SyllableTemplate { pattern: string; weight: number }   // "CV", "(C)V(N)", "CCVC"
export interface WordGeneratorProfile {
    version: 1;
    presetId: string | null;                 // preset it was started from; null = custom / never applied
    inventory: string[];                     // explicit phoneme list; EMPTY = "use my script's auto-spelling phonemes"
    phonemeTilt: Record<string, FrequencyTilt>;   // per phoneme; absent = 'normal'
    frequencyCurve: 'zipf' | 'flat';
    syllables: SyllableTemplate[];           // at least one; weights > 0
    syllableCount: { min: number; max: number };   // 1..5, min <= max
    clusters: {
        sonority: boolean;                   // enforce sonority sequencing inside onsets/codas
        sibilantOnsetException: boolean;     // allow s+plosive onsets (st-, sp-)
        allowGeminates: boolean;             // identical consonants across a syllable boundary
        maxPerWord: number;                  // 0..4 clusters (CC+) per word
    };
    vowelHarmony: 'off' | 'frontBack';
    longVowelChance: number;                 // 0..1, adds ː to a vowel
    forbidden: string[];                     // IPA sequences rejected anywhere in the word
}
export interface WordGeneratorSettings {
    profile: WordGeneratorProfile;
    guidePresetId: string | null;            // which preset the IPA chart paints; null = off
}
```

**2.2 Defaults + validation** (`profile/defaults.ts`, `profile/validate.ts`):
`DEFAULT_PROFILE` = the "Smooth / island"-ish safe start: inventory `[]` (derive from script),
syllables `[{CV,6},{CVC,2},{V,1}]`, count 1–3, clusters `{sonority:true, sibilantOnsetException:false, allowGeminates:false, maxPerWord:1}`,
harmony off, long 0, forbidden `[]`, curve `zipf`. `validateGeneratorSettings(raw: unknown): { settings: WordGeneratorSettings; issues: SettingsIssue[] }`
in EXACTLY the `settingsSchema.ts` style: every field coerced or defaulted with a pushed issue;
templates validated with Phase 3's parser contract (only class letters, `(` `)` and whitespace;
non-empty; at least one `V`), weights finite > 0, counts clamped 1..5, `forbidden` entries
non-empty strings, `phonemeTilt` values in the enum, unknown keys reported. Export `LIMITS`
(`MAX_INVENTORY = 120`, `MAX_TEMPLATES = 12`, `MAX_FORBIDDEN = 40`, `MAX_BATCH = 100`).

**2.3 Settings integration** (`src/db/api/types.ts`, `settingsSchema.ts`, `index.ts`):
add `wordGenerator: WordGeneratorSettings` to `EtymologSettings` + `DEFAULT_SETTINGS`
(`structuredClone`-safe plain data), add `'wordGenerator'` to `KNOWN_KEYS`, and in
`validateSettings` delegate: `wordGenerator: validateWordGenerator(raw.wordGenerator, issues)` which
calls `validateGeneratorSettings` and prefixes issue paths with `wordGenerator.`. Re-export the
types from `src/db/api/index.ts`. `src/db/api/types.ts` may import from `../../generator/profile/types`
(type-only) — keep it `import type` so the db layer has no runtime dependency on the generator.

**2.4 Presets** (`presets/types.ts`, `presets/data/*.ts`, `presets/index.ts`):

```ts
export interface FlavourPreset {
    id: 'flowing' | 'island' | 'japanese' | 'sinitic' | 'romance' | 'guttural' | 'slavic';
    name: string;                 // "Elvish / flowing"
    tagline: string;              // one line
    touchstones: string[];        // ["Finnish", "Welsh"]
    why: string;                  // one paragraph: what makes it sound like that
    sounds: { core: string[]; flavour: string[]; avoid: string[] };   // IPA phoneme strings
    vowels: { core: string[]; flavour: string[] };
    diphthongs?: string[];
    profile: Omit<WordGeneratorProfile, 'presetId' | 'inventory' | 'phonemeTilt'> & { phonemeTilt?: Record<string, FrequencyTilt> };
    examples: string[];           // 6 seeded example words, generated in Phase 3 and PASTED here as data (see pitfall)
}
```

Content (the implementer writes the real lists; these are the anchors):

| id | core consonants | flavour | avoid | vowels | shape |
|---|---|---|---|---|---|
| `flowing` (Elvish) | `l r n m t k s θ ð v j w` | `ɬ ʎ ɲ f h d g` | `q χ ʁ ʔ x ʕ ħ t͡ʃ d͡ʒ` | `a e i o u` + `ai au ei` | `CV 6, CVR 3, V 1, CLV 1`; sonority on; maxPerWord 2; tilt `l n` common |
| `island` | `p k ʔ h m n l w` | `t v r` | all fricatives but h, all clusters | `a e i o u` (long allowed) | `CV 8, V 2`; maxPerWord 0; long 0.15 |
| `japanese` | `k s t n h m j r w g z d b p` | `ɕ t͡ɕ d͡ʑ ɸ ɴ` | `l v θ ð f ʃ` | `a i ɯ e o` | `CV 8, V 1, CVN 1`; maxPerWord 0; no geminates |
| `sinitic` | `p pʰ t tʰ k kʰ m n ŋ l s x t͡s t͡sʰ ʈ͡ʂ ʈ͡ʂʰ ʂ` | `t͡ɕ t͡ɕʰ ɕ f ʐ` | `r b d g v z` | `a o ɤ i u y ə` | `CV 5, CVN 4, V 1` (N = n ŋ only — see §3.3 note on class narrowing); maxPerWord 0 |
| `romance` | `p b t d k g m n ɲ l ʎ r ɾ f v s t͡ʃ d͡ʒ` | `ʃ z θ` | `x χ ʔ ŋ h` | `a e i o u` (+ `ɛ ɔ` flavour) | `CV 6, CVC 2, CLV 2, V 1`; sonority on; maxPerWord 1; geminates on |
| `guttural` | `q χ ʁ x ɣ ʔ k g t d s z ʃ r m n` | `kʼ tʼ qʼ ħ ʕ ɬ t͡s` | `ʎ ɲ w j` | `a ɪ ʊ ə` (+ `ɛ ɔ`) | `CVC 5, CVCC 2, CCVC 2, CV 1`; sonority on; sibilant exception on; maxPerWord 3 |
| `slavic` | `p b t d k g m n l r s z ʃ ʒ t͡s t͡ʃ v f x j` | `ʲ ɲ ʎ r̝` | `θ ð w h q` | `a ɛ i ɔ u ɨ` | `CCVC 3, CVC 3, CCV 2, CV 2`; sonority on; sibilant exception on; maxPerWord 3 |

`applyPreset(preset, current): WordGeneratorProfile` = preset profile + `presetId` +
`inventory = core ∪ flavour ∪ vowels.core ∪ vowels.flavour` (explicit list, so a beginner with no
graphemes gets words immediately) + `phonemeTilt` from the preset. The generator page ALSO offers
"use my script's sounds instead" which sets `inventory: []`.

**2.5 Coverage** (`src/generator/coverage.ts`):
`computeCoverage(preset, conlangPhonemes: string[]) → { core: { present, missing }, flavour: { present, missing }, avoidPresent: string[], score: number /* present core / core */ }`.
Matching is by `describePhoneme(...).base` + modifiers equality, not raw string equality, so
`t͡ʃ` in the preset matches a user's `tʃ`. Export `guideMapFor(preset): Map<string, GuideTier>`
(`GuideTier = 'core' | 'flavour' | 'avoid'`) keyed by BASE symbol (so the chart — which only has base
symbols — can look up `pʰ`'s base `p` as core for `sinitic`).

**2.6 Tests** (node): settings round-trip — `validateSettings({})` yields the default
`wordGenerator`; an old stored settings object WITHOUT the key validates with ZERO issues (older
builds must not spam warnings on boot — `undefined` is "absent", not "invalid"); malformed profile
fields are corrected one by one with a prefixed path; `api.settings.update({ wordGenerator })`
strict-rejects a bad template; `settingsApi.import()` with an envelope lacking the key; `structuredClone`
of `DEFAULT_SETTINGS` shares nothing with a returned snapshot. Presets: every preset's every sound
resolves via `describePhoneme` (no typos), `core ∩ avoid = ∅`, every template parses (import the
Phase 3 parser — write the parser's contract test here as a skipped placeholder if Phase 3 is not
yet in, and un-skip in Phase 3), `applyPreset` produces a profile that passes validation with zero
issues, ids unique. Coverage: present/missing maths, base-symbol matching. Target ≥ 40 tests.

**Pitfalls (Phase 2)**
- `validateSettings` is called on EVERY boot for stored settings; a missing `wordGenerator` must
  produce NO issue (mirror how `customCharts: undefined → []` is silent). Only a present-but-wrong
  value is an issue.
- `api.settings.update()` is strict and takes the WHOLE nested object — the page must spread
  `{ wordGenerator: { ...settings.wordGenerator, profile: next } }`; never send a partial profile.
- `DEFAULT_SETTINGS` is `structuredClone`d; keep the profile plain data (no `Map`, no functions).
- `react-refresh/only-export-components`: preset data lives in `.ts` files, never in a `.tsx`.
- Settings type file (`src/db/api/types.ts`) must use `import type` for the generator types so the
  generator has no runtime circularity with the db barrel.
- The `examples` field is DATA, not computed at import time (a preset module must not run the
  engine on load). Phase 3 generates them once with a fixed seed and the implementer pastes them in;
  a test asserts they re-generate identically so they cannot go stale silently.
- The table above says "N = n ŋ only" for `sinitic` — v1 has no per-profile class override, so the
  preset's INVENTORY simply excludes `m`-final codas by listing `forbidden: ['m$']`? NO — `forbidden`
  is plain substrings. Instead the implementer uses a template with an explicit literal: the parser
  (Phase 3) accepts **literal phoneme groups in square brackets** — `CV[nŋ]` — which is the clean
  way; write that into the template grammar now so Phase 2's validator accepts it.

### Phase 3 — Generation engine (`src/generator/engine/`, `src/generator/inventory.ts`)

**Goal**: `generateWords()` — deterministic for a seed, obeys every profile constraint, never
hangs, reports why when it cannot fill the batch.

**3.1 `random.ts`** — `createRng(seed: number)` (mulberry32; 32-bit int seed; `next(): number` in
[0,1)), `pickWeighted(rng, items, weightOf)`, `pickInt(rng, min, max)`. `randomSeed()` =
`(Date.now() ^ (Math.random() * 0x100000000)) >>> 0` — the ONLY place non-determinism is allowed.

**3.2 `weights.ts`** — `phonemeWeights(members: string[], profile) → Map<string, number>`:
order members by a stable "commonness" rank (a fixed cross-linguistic ranking table
`COMMONNESS_RANK: string[]` — roughly `a i u e o m n k t p s l j w h ŋ r b d g ʃ f …`; anything not
ranked goes after, in input order), then weight = Gusein-Zade `(ln(n+1) − ln(r)) / n` when
`frequencyCurve === 'zipf'`, uniform when `'flat'`; multiply by tilt `common ×3`, `rare ×0.25`,
`off ×0` (an `off` phoneme is skipped entirely — keep it in the inventory list so the UI shows it as
muted, not deleted).

**3.3 `template.ts`** — grammar: sequence of items; an item is a class letter (`C V P F S N L G R O`),
a literal group `[tʃk]` (phoneme strings separated by nothing — tokenise with `splitPhonemeString`)
or `[t͡ʃ k]` (space-separated when any member is multi-char), optionally wrapped in `( … )` for
optional (50 % unless followed by a percentage `(C)70` — v1: support the bare `( )` = 50 % only and
document it). `parseTemplate(pattern): TemplateItem[]` throws `TemplateSyntaxError` with position;
`expandTemplate(items, rng)` resolves optional groups; `isValidTemplatePattern(pattern)` for the
validator (Phase 2 imports THIS — so write `template.ts` first, or ship it in Phase 2; either way it
lives under `engine/` and has its own tests).

**3.4 `constraints.ts`** — each rule is `(word: Syllable[], profile, inventory) => Violation | null`,
run in order: `noForbiddenSequences` (substring on the joined IPA and on the token list),
`noIllegalGeminates`, `sonorityInClusters` (onset rising, coda falling, exception flag), `clusterBudget`
(count CC+ runs across the whole word ≤ `maxPerWord`), `vowelHarmony` (`frontBack`: all vowels in
a word share backness bucket; `central` is neutral and allowed with either), `inventoryOnly`
(every token ∈ inventory — guards literal groups that name sounds not in the inventory: such a
literal is DROPPED from the group at build time, and if the group empties, the template is skipped
for that word with a warning). `explainViolation(v)` → human string for the debug panel.

**3.5 `normalize.ts`** — `normalizePronunciation(s)`: NFC, `ɡ`→`g`, remove `ˈ ˌ . ‿` and
whitespace, lower-case nothing (IPA is case-sensitive). Used for dedupe keys and for the
`?pronunciation=` prefill comparison.

**3.6 `generate.ts`**:

```ts
export interface GeneratedWord { ipa: string; syllables: string[]; seedIndex: number }
export interface GeneratedBatch {
    words: GeneratedWord[];
    seed: number;
    requested: number;
    /** Why the batch is short, when it is. */
    shortfall?: { reason: 'exhausted' | 'empty-inventory' | 'no-vowels' | 'no-consonants'; attempts: number; rejected: Record<string, number> };
    warnings: string[];   // dropped literals, 'off' classes, etc.
}
export function generateWords(profile, inventory: ClassifiedInventory, options: { count: number; seed: number; existing?: Iterable<string> }): GeneratedBatch
```

Algorithm: build class → members with weights once; loop up to `count × 40` attempts: pick
syllable count, for each syllable pick a template by weight, expand, fill each item by weighted
pick (vowel harmony narrows the vowel pool after the first vowel), apply `longVowelChance`, join;
run constraints; dedupe against `existing` (normalised) AND the batch; collect rejection counts by
rule for the shortfall report. Syllable boundary marker for the UI: `syllables` array (the page
renders `ta·ki·no`), `ipa` is the plain joined string (what gets stored).

**3.7 `inventory.ts`** — `deriveInventory(source: string[], profile) → ClassifiedInventory`
where `source` = `profile.inventory` if non-empty else the conlang's auto-spelling phonemes
(the page passes whichever applies; the engine never touches the db):
`{ members: { phoneme, features, classes, tilt, inConlang?: boolean }[], byClass: Map<ClassLetter, string[]>, unknown: string[] }`.
`unknown` = entries `describePhoneme` cannot classify (kept out of generation, surfaced in the UI).

**3.8 Tests** (node): determinism (same seed → identical batch, different seed → different);
`count` honoured; every generated word obeys every constraint (property-style: 500 words × each
preset profile, assert via the constraint functions themselves AND via independent re-checks —
e.g. recount clusters with a regex over tokens); `existing` dedupe; empty inventory → shortfall
`empty-inventory` without throwing; an inventory with no vowels → `no-vowels`; `off` tilt never
appears; `zipf` vs `flat` distribution sanity (over 5 000 picks the top-ranked phoneme is ≥ 2× the
last-ranked under zipf, within 20 % under flat); template parser: every grammar case + error
positions; literal group with a non-inventory member is dropped with a warning; harmony keeps
front/back apart and lets `ə` through; long vowels only on vowels and at the configured rate ± tolerance;
`normalizePronunciation` cases; preset `examples` regenerate identically (seed 1, count 6, preset
inventory) — this is the staleness ratchet from Phase 2. Target ≥ 70 tests.

**Pitfalls (Phase 3)**
- **Never loop unbounded.** Every rejection-sampling loop has an attempt cap; the cap is tested
  (a profile that can only ever produce `a` must return a shortfall, not hang the UI thread).
- Generation runs on the main thread in the page; keep a batch of 100 under ~20 ms (the
  test suite should include a loose timing sanity check: 100 words × 7 presets < 500 ms total).
- `Math.random`/`Date.now` only inside `randomSeed()`; everything else takes the rng. The test
  for this greps `src/generator/engine/**` for `Math.random` and asserts exactly one hit.
- Geminate detection must compare BASE symbols (`t` + `tʰ` is not a geminate; `t` + `t` is).
- Vowel harmony buckets: front = backness `front`, back = `back`, neutral = `central`. A diphthong
  literal like `ai` counts by its first vowel.
- Syllable-count weights: plain uniform over `[min, max]` in v1 — document; do NOT invent a
  second weight vector that the validator does not know about.
- The `sibilantOnsetException` must only fire for a SIBILANT + PLOSIVE pair at the START of a
  word-initial onset, not mid-coda.

### Phase 4 — IPA chart guide overlay

**Goal**: pick a flavour on the IPA chart page and see its sounds lit — core, flavour, avoid — on
top of the existing assigned/unassigned rendering, with a legend, persisted in settings, and a
one-click path to the generator. Pure presentation; no rule is enforced anywhere.

**4.1 `IPAChartCell`** — new prop `guide?: GuideTier | null`. Adds class `styles.guideCore` /
`guideFlavour` / `guideAvoid`; the tooltip gains a third line (`"Elvish / flowing: core sound"` —
the preset NAME is passed as `guideLabel?: string` so the cell stays dumb). Styling in
`IPAChartCell.module.scss`: core = `box-shadow: 0 0 0 2px var(--status-good)` + `background: var(--status-good-bg)`
(keeps working on `.assigned` and `.unassigned`; on `.unassigned` also `opacity: 1` so a missing
core sound is the MOST visible thing on the chart); flavour = `var(--status-info)` ring +
`--status-info-bg`; avoid = `opacity: 0.35` + `--status-disabled-bg` (and `.assigned.guideAvoid`
keeps opacity 0.7 so the user's own work never disappears). Respect `prefers-reduced-motion`
(no new animation anyway).

**4.2 Chart props** — `IPAConsonantChartProps`, `IPAVowelChartProps`, `IPASyllabaryChartProps`,
`IPACombinedChartProps` gain `guide?: GuideMap | null` and `guideLabel?: string`
(`GuideMap = ReadonlyMap<string, GuideTier>` keyed by base symbol); each chart looks up
`guide?.get(ipa) ?? null` per cell. Syllabary: paint the consonant row header + vowel column header
cells, not every syllable cell (a 30×40 grid of rings is noise).

**4.3 Page** — `IPAChartPage` (and `SyllabaryChartPage`, sharing the control): header `actions`
slot gets `<GuidePicker>` (`src/components/display/ipaChart/GuidePicker.tsx` — a labelled
`<select aria-label="Flavour guide">` with "No guide" + every preset's name; on change →
`api.settings.update({ wordGenerator: { ...settings.wordGenerator, guidePresetId } })` through
`useApiAction`). Under the chart, when a guide is on: `<GuideLegend>` — three swatches with counts
computed from `computeCoverage(preset, Array.from(phonemeMap.keys()))`: "Core · 9 (4 in your
script)", "Flavour · 5", "Avoid · 6 (1 in your script)", the preset's `tagline`, and two links:
"Generate words with this flavour" → `ROUTES.lexiconGenerate + '?preset=' + id`, and "Why it
sounds like this" (opens the `why` paragraph in the page's `about` expandable — append it to
`about` rather than a second disclosure). `facts` gains `{ label: 'Core sounds in script', value: '4 / 9' }`
when a guide is on. Everything reads `settings.wordGenerator.guidePresetId`; the select is
controlled by it (no local state), so the choice survives navigation and reload.

**4.4 Tests** (happy-dom): `IPAChartCell` renders the tier class and tooltip text; `IPAConsonantChart`
with a guide map paints the right cells and nothing else; `IPAVowelChart` likewise; `GuidePicker`
lists all presets + "No guide", calls `settings.update` with the FULL nested object, is labelled;
`GuideLegend` counts; `IPAChartPage` with a mocked context (`settings.wordGenerator.guidePresetId =
'flowing'`) shows the legend and the generator link with the right query; with `null` shows no
legend. Also a source ratchet that `IPAChartCell.module.scss` uses only `--status-*` tokens for the
tiers (token ratchet already covers undefined names). Target ≥ 25 tests.

**Pitfalls (Phase 4)**
- `IPAVowelChart` cells live inside SVG `<foreignObject>` — a `box-shadow` ring is clipped by the
  48×48 foreignObject box; use `outline` with a negative `outline-offset` (`outline: 2px solid …;
  outline-offset: -2px`) for the vowel size variant, or enlarge nothing. Test in the browser.
- The charts `useMemo`/`useCallback` on `[phonemeMap, onCellClick, isLoading]` — ADD `guide` and
  `guideLabel` to every dependency array you touch or the overlay will not repaint on change.
  (`react-hooks/exhaustive-deps` is on; don't silence it.)
- `HoverToolTip` content is a string with `\n` joins — keep the guide line as a plain string.
- The picker writes settings on change: guard against writing the same value (no-op) and do not
  `notify.success` on every change — silent on success, toast only on failure (`useApiAction` with
  no `success` text).
- Do NOT put the legend inside `PannableCanvas` (it would pan/zoom with the chart).
- `GuidePicker.tsx` may export only the component; `GUIDE_TIER_LABELS` etc. go in a `.ts`.

### Phase 5 — Generator page (`src/components/tabs/lexicon/generator/`)

**Goal**: `/lexicon/generate` — pick a flavour, adjust sounds and shape, generate a batch, keep
the good ones. Every profile edit persists (settings), every batch is reproducible (seed shown).

**5.1 Routing** — `ROUTES.lexiconGenerate = '/lexicon/generate'` in `url_mapping.ts`; route
`generate` in `tabs/lexicon/main.tsx`; `LexiconHome` header `actions` gains a SECONDARY
`IconButton as={Link} to={ROUTES.lexiconGenerate} iconName="shuffle"` "Generate words" (keep "New
word" primary). The empty-lexicon state (`LexiconGallery`'s `GalleryEmptyCopy`) gets a second
action pointing at the generator (this also closes the `todo.md` "empty state does not link"
follow-up — do both links: Script Maker and Generator).

**5.2 Pronunciation prefill** — `LexiconEditor` (create mode) reads `useSearchParams().get('pronunciation')`,
passes `initialPronunciation` to `LexiconFormFields`, which uses it as the field's `defaultValue`
in create mode AND (because SmartForm's `defaultValue` does not mark the form changed)
calls `setSmartFieldValue` once after mount exactly like the edit-mode effect does, so
`isSubmittable` becomes true once a meaning is typed and the auto-spell button works immediately.
Mark the form dirty? No — a prefilled create form must NOT trigger the leave-guard until the user
types (check `isChanged` semantics in `LexiconEditor.test.tsx`; add a test).

**5.3 Page composition** (`WordGeneratorPage.tsx` — the route; everything else is a child):

```
 ← Lexicon
 Word generator                                   [ Generate 20 ▾ ]  ← header action (primary)
 Build candidate words from your sounds; keep the ones you like.
 ┌ SOUNDS ─┬ TEMPLATES ─┬ WORDS IN LEXICON ┐                          ← facts
 ┌──────────────────────────┐ ┌─────────────────────────────────────┐
 │ 01 Flavour               │ │ Results · batch #3f2a91c · 20 words │
 │  [preset cards …]        │ │ ☐ ta·ki·no   𝔤𝔩𝔶𝔭𝔥𝔰   [Edit & add]     │
 │  coverage line + link    │ │ ☐ …                                  │
 │ 02 Sounds                │ │ [Add 0 selected]  [Regenerate] [Copy]│
 │  chips by class, tilt    │ └─────────────────────────────────────┘
 │ 03 Shape                 │
 │  templates, counts, …    │
 │ 04 Constraints           │
 └──────────────────────────┘
```

Two columns ≥ 900 px (CSS grid `minmax(0, 1fr)` both — see the Phase 8 lesson on grid
min-content), stacked below. Components:

- `PresetPicker.tsx` — a radio-group of cards (`role="radiogroup"`, each card a `<button
  role="radio" aria-checked>`): name, tagline, touchstones, the 6 example words in IPA. Selecting
  calls `applyPreset` → persists profile (+ sets `guidePresetId` to the same id — one click lights
  the chart too). A "Custom" card is selected whenever `profile.presetId === null`. Below: the
  coverage line when the user HAS graphemes: "Your script has 4 of 9 core sounds — missing θ ð ʎ …
  · Show on the IPA chart" (`Link` to `ROUTES.scriptMakerChart`; the guide is already on).
- `InventoryEditor.tsx` — section 02. Source toggle (`Switch`): "Use my script's sounds" (inventory
  `[]`, chips = conlang auto-spelling phonemes, read-only membership) vs "Custom list". Chips grouped
  by class with `CLASS_LABELS` captions; each chip: the IPA, a ✓ when the sound exists in the
  conlang (so a preset sound the script lacks is visibly "will be written with a placeholder
  glyph"), click cycles tilt `normal → common → rare → off → normal` (shown as ★ / · / ○ / ✕ with
  `aria-label` "k — common"). An "Add sound" input (`LabelShiftTextCustomKeyboardInput` with
  `IPA_CHARACTERS`? — that is a SmartForm input and needs a field; use a plain labelled `<input>` +
  cyber `customKeyboard` ONLY if it can be driven standalone; otherwise a plain input with a
  hint that the IPA keyboard is in the word form). Unknown entries are listed under "Not recognised"
  with a remove button. Banner when the script has no auto-spelling phonemes AND inventory is
  empty: "No sounds yet — pick a flavour above or add sounds in the Script Maker" (`EmptyState`
  inline with two actions).
- `ShapeEditor.tsx` — section 03: template rows (pattern `<input>` + weight `<input type=number>` +
  remove; inline validation from `isValidTemplatePattern` with the error text; "Add template";
  quick-add chips `CV` `CVC` `CCV` `CVN` `V`), syllable count min/max (two `<select>`s 1–5),
  long-vowel chance (`<input type=range>` 0–50 % with a live label).
- `ConstraintsEditor.tsx` — section 04: four `Switch`es (sonority, s+stop exception, geminates,
  harmony front/back), cluster budget `<select>` 0–4, forbidden sequences (comma/space-separated
  `<input>`, parsed to `string[]`, each shown as a removable chip).
- `GeneratedWordList.tsx` — results. Each row: checkbox (select), IPA with syllable dots
  (`ta·ki·no`), spelling preview (`GlyphSpellingDisplay` of `previewAutoSpellingWithFallback(ipa)` —
  virtual glyphs render as IPA text, as in the chart cells; memoised per ipa), a muted "already in
  lexicon" pill if the normalised ipa exists (the engine dedupes, but the lexicon can change under
  the page), actions: "Edit & add" (`Link` to `/lexicon/create?pronunciation=<ipa>`), "Copy"
  (clipboard, toast). Footer: `Add N selected` (primary, disabled at 0) → for each: `api.lexicon.create({ pronunciation, is_native: true, auto_spell: true, glyph_order: autoSpellToGlyphOrder(preview.spelling) })`,
  one `refresh()` at the end, ONE summary toast ("Added 5 words"), failures listed by ipa in a
  warning toast; added rows leave the list. `Regenerate` (new seed), `Same seed` (re-run —
  useful after changing the profile), `Copy all` (IPA lines). Shortfall → inline `NotificationBanner`
  (warning) with the engine's reason + top rejection rule ("18 of 20 — 340 candidates rejected,
  mostly by: forbidden sequences"). Batch size in the header action: a `<select>` 10/20/50/100.
- `useGeneratorProfile.ts` — the one hook that reads `settings.wordGenerator`, exposes `profile`,
  `updateProfile(patch)` (spread + `api.settings.update` + `useApiAction`, debounced 250 ms for
  text inputs via a ref so the toast does not fire per keystroke; switches/selects write immediately),
  `applyPreset(id)`, `conlangPhonemes` (from `data.graphemesComplete` — flatten `phonemes` where
  `use_in_auto_spelling`), `inventory` (`deriveInventory`), `existingPronunciations`
  (normalised set from `data.lexiconComplete`). `?preset=<id>` on first mount applies that preset
  once (then strips the param with `setSearchParams({}, { replace: true })`).
- `autoSpellToGlyphOrder(entries: AutoSpellEntry[]): SpellingEntry[]` in `src/db/utils/spellingUtils.ts` (+ unit test).

**5.4 Tests** (happy-dom unless noted): route registered (`url_mapping.test.ts` gains the new
constant; `LexiconMain` renders the page at `/lexicon/generate`); `LexiconHome` shows both actions;
`WordGeneratorPage` with a mocked context: preset click persists the full nested settings object
AND sets `guidePresetId`; `?preset=island` applies once and strips; generate renders N rows;
select + "Add selected" calls `lexicon.create` with `auto_spell: true` and a `glyph_order` built
from the preview, refreshes once, toasts once; "Edit & add" link carries `?pronunciation=`;
`LexiconEditor` create with `?pronunciation=kato` has the field prefilled and is NOT dirty;
`ShapeEditor` rejects `CVX` with the parser's message and does not persist it; the inventory
`off` cycling is reflected in the next batch (engine called with the tilt); shortfall banner shows;
no-sounds empty state shows with both links. `autoSpellToGlyphOrder` (node). Target ≥ 45 tests.

**Pitfalls (Phase 5)**
- **SmartForm exemption, stated**: the profile panel is live settings (like `WritingSystemPage`),
  not a submission. The batch-add is a button, not a form. The only real form on this path is the
  existing word form. Say so in the README.
- `useEtymolog().settings` is the reactive settings copy; `api.settings.update` notifies
  subscribers → context re-renders. Do not keep a local copy of the profile in `useState`
  (two sources of truth = the exact bug class Phase 6 of the redesign removed). Debounce only the
  WRITE, render from `settings` + a transient "pending text" for the input being typed in.
- Persisting on every keystroke of the forbidden-sequences input would write localStorage +
  validate 10× a second — debounce, and flush on blur.
- Generated words and the spelling preview are derived — `useMemo` keyed on `(profile, inventory,
  seed, count)`; the batch must NOT regenerate when an unrelated context value changes (e.g. the
  persistence status ticking) — memoise on the specific dependencies, not on `settings`.
- `api.lexicon.create` is synchronous SQLite inside a transaction each; for 100 words call
  `refresh()` ONCE after the loop, never per word (the N+1 refresh bug class).
- `GlyphSpellingDisplay` with virtual glyphs needs the virtual glyph objects — reuse
  `buildVirtualGlyphMap(result)`; see how `IPAChartCell` and `GlyphCanvasInput` render them.
- Leave-guard: the generator page has NOTHING unsaved (settings persist live), so do NOT register
  with `useRegisterUnsaved`. The prefilled word form does register once the user types.
- The `react-refresh/only-export-components` rule: hooks (`useGeneratorProfile.ts`) and constants
  in `.ts`; each `.tsx` exports one component.
- Keyboard: preset cards are radios (arrow keys move, space selects — implement `onKeyDown` on the
  group or use real `<input type="radio">` visually hidden inside each card — the latter is simpler
  and fully accessible; prefer it). Chips are `<button aria-pressed>` or `<button aria-label>`; the
  tilt glyph must have a text alternative.
- `navigator.clipboard` is absent in happy-dom — guard with `?.` and make "Copy" a no-op with a
  warning toast when unavailable.

### Phase 6 — Hardening, audit fixes, docs

- Full-suite run + `eslint` + `tsc` + `vite build`; a browser pass on `http://localhost:5174/etymolog/`
  (Claude-in-Chrome if connected, else the Browser pane with `read_page`/`javascript_tool`): lexicon
  home actions, generator page end-to-end (preset → generate → add 2 → they appear in the gallery with
  spellings), IPA chart guide on/off, vowel-chart ring clipping, narrow viewport (360 px) stacking,
  dark theme token check.
- README: a "Word generator" section (architecture map above, the profile shape, the template
  grammar, the preset table, the guide overlay, the SmartForm exemption, testing by area) + route map
  + settings key; `REDESIGN_PLAN.md` untouched; THIS file gains §5 execution log + §6 deviations
  like the redesign plan.
- `todo.md`: TTS follow-up (§7), anything the run could not verify.
- Memory file update (coordinator).
- Final commit, then `vite build` committed as `(etymolog): rebuild static docs site`.

---

## 4. Risks and open decisions (defaults chosen — change only with the owner)

| Decision | Default | Why |
|---|---|---|
| Where the profile lives | settings key `wordGenerator` (localStorage + export envelope) | matches `customCharts`; no migration; raw `.sqlite` export already documented as not carrying settings |
| Inventory semantics | explicit list; empty = script's auto-spelling phonemes | beginners get words before they have graphemes; advanced users stay in sync with their script |
| Preset application | overwrites the whole profile (templates, constraints, inventory, tilt) | a preset is a starting point; partial merges produce contradictions the user can't see |
| Guide = preset | one select on the chart, persisted in `guidePresetId`; picking a preset in the generator also sets it | one mental model: "the flavour" |
| Seeding | 32-bit seed, shown, `Same seed` button | reproducible batches; deterministic tests |
| Tones / stress / diphthong classes | out of v1 | literal groups cover diphthongs (`[ai au]` as a V-slot alternative via a template like `C[ai au]`); tones need a mark model the app has nowhere to store |
| Per-profile custom classes | out of v1 | literal groups `[nŋ]` cover the real need; a class editor is UI the user did not ask for |
| TTS | out (todo) | needs a dependency (eSpeak-ng wasm) → lockfile → main tree, and a quality decision the owner should hear first |

---

## 5. Execution log

### Phase 1 — Phonology core (2026-08-22)

- Implementer: `src/generator/phonology/{features,tokenize,sonority,classes,index}.ts` + 4 test files (102 tests). Independent adversarial audit added `__tests__/audit.test.ts` (55 tests) and fixed four defects: (D1) affricates spelt with the tie bar BELOW (U+035C) were unclassifiable; (D2) the `allowSibilantOnset` licence also fired for sibilant AFFRICATES (`t͡sp-` passed as an onset) — narrowed to sibilant fricatives; (D3) voicing diacritics (`l̥`, `t̬`) produced self-contradicting features/labels — `VOICING_MARKS` now flips `voiced` for consonants; (D4) a doubled tie bar split the affricate — the tokenizer now scans the run of bars.
- Gates: 923 tests / 65 files (from 766 / 59), tsc clean, eslint clean.
- Open questions recorded as behaviour tests (not defects): `tʃ` is two tokens in `splitPhonemeString` but one affricate in `describePhoneme` (by design — inventory entries use `describePhoneme`, word walks use the tokenizer); `ʍ` is filed as a fricative (not `G`); `zd-` is licensed like `st-`; `knownSymbols()` returns NFD keys (UI must read `base`); a precomposed symbol under a low-combining-class mark (`ç̴`) peels to the wrong base.


### Phase 2 — Profile, presets, settings (2026-08-22)

- Implementer: `src/generator/profile/*` (types, defaults, LIMITS, validator in `settingsSchema` style), `src/generator/engine/template.ts` (parser pulled forward from Phase 3), seven presets under `src/generator/presets/data/`, `src/generator/coverage.ts` (`computeCoverage`, `guideMapFor`), `wordGenerator` key on `EtymologSettings` (+ `KNOWN_KEYS`, delegation with `wordGenerator.`-prefixed issue paths, re-exports). The export envelope needed no change (round-trip test). 1172 tests / 70 files.
- Independent audit (`src/generator/__tests__/audit-phase2.test.ts`, 71 tests) fixed: (D1) `templateHasVowelSlot` rejected a diphthong literal group (`[ai au]`) because `describePhoneme('ai')` is null — a profile whose only vowel source was such a group was silently reset to defaults; now each member is tokenised and every token must be a vowel. (D2) a `__proto__` key in `phonemeTilt` hit the inherited setter and vanished with no issue — now `Object.defineProperty`. (D3) two raw U+0000 bytes in `coverage.ts` (key separator) made the file binary to `file`/`grep`/diff — now an escaped `KEY_SEPARATOR` constant + a control-byte ratchet over `src/generator/**`.
- Gates: 1243 tests / 71 files, tsc clean, eslint clean.
- Open questions pinned as behaviour tests: the legacy ligatures `ʧ ʤ ʦ ʣ ʨ ʥ` do not resolve (add to `EXTRA_SYMBOLS` in Phase 6); `guidePresetId` is any non-empty string (validating against `PRESET_IDS` would create a `profile → presets` cycle; `getPreset` returns null for unknown ids); `[a.k]` silently drops the dot; `CV` and `C V` are distinct templates to the duplicate check; a partial `update({ wordGenerator: { profile } })` silently clears `guidePresetId` — Phase 5 MUST spread the whole key; a no-vowel template set discards ALL templates (issue path is the array).

### Phase 4 — IPA chart guide overlay (2026-08-22; ran in parallel with Phase 3)

- Implementer: `IPAChartCell` `guide`/`guideLabel` (tier class + `data-guide` + aria-label line), `GuideOverlayProps` on all four charts, `GuidePicker` (no local state; writes the FULL `wordGenerator` key; silent on success), `GuideLegend` (counts, tagline, generator link, "why" opens the page explainer), `useGuidePreset` hook shared by `IPAChartPage` + `SyllabaryChartPage`, `ChartPageLayout` gained `belowChart` / `aboutId` / `aboutOpen` / `onAboutOpenChange`, `ROUTES.lexiconGenerate`. 93 tests.
- Independent audit (`display/ipaChart/__tests__/audit-phase4.test.tsx`, 39 tests): (D1) the "why opens the explainer" test was vacuous (`ExpandableContainer` always renders children) — replaced by an `aria-expanded` check that fails under mutation; (D2) syllabary headers lacked `data-guide` — added. Confirmed: a pre-Phase-2 settings object (no `wordGenerator`) makes the picker write a complete default key that validates with zero issues.
- Gates (scoped): 375 tests; full suite 1660 / 87 at the time; tsc clean; eslint clean.
- Open (for Phase 6): **affricates and `w` have no cell on the IPA chart**, so a preset's core `t͡ʃ`/`w` is counted in the legend but never painted (per preset: flowing/island `w t͡ʃ d͡ʒ`; japanese `w ɕ t͡ɕ d͡ʑ`; sinitic `t͡s ʈ͡ʂ t͡ɕ ɕ ɚ`; romance `t͡ʃ d͡ʒ`; guttural `t͡s w`; slavic 7 of 46) — Phase 6 adds an "Affricates & other" strip to `IPACombinedChart` from `IPA_AFFRICATES` + the extras; legend counts by base+modifiers while the overlay keys by base (`pʰ` lights `p`); the "why" button has no `aria-expanded` and does not move focus; a stale `guidePresetId` cannot be cleared by re-picking "No guide" (harmless); `useGuidePreset.coverage` is computed but the legend recomputes it (pass it down in Phase 6).

### Phase 3 — Generation engine (2026-08-22; ran in parallel with Phase 4)

- Implementer: `engine/{random,weights,constraints,normalize,generate}.ts`, `inventory.ts`, `phonemeIdentity` moved into `phonology/features.ts` (one identity key shared by inventory/constraints/weights/coverage), preset `examples` filled (seed 1, count 6) with a regeneration ratchet, diphthong templates added to every preset that declares `diphthongs` (convention + test); the engine itself found two preset data bugs (sinitic declared `ei` with no `e`; guttural declared `ai au` with no `i`/`u`). 275 tests.
- Independent audit (`src/generator/__tests__/audit-phase3.test.ts`, 65 tests; 7 presets × 300 words re-checked with independent code — zero violations): (D1) the "dropped from that group" warning claimed a sound was missing from the inventory when the user had switched it `off`; (D2) a negative `maxPerWord` rejected every word — floored at 0. Timing: 100 words × 7 presets = 16 ms.
- Gates: 1724 tests / 87 files, tsc clean, eslint clean.
- Quality notes → handled by the Phase 3b quality pass (below): flowing emits `ɲonsimnlɛnɛw`-style words (4-syllable ceiling × two cluster licences); island stacks identical/long vowels (`naːainaː`); sinitic/guttural/slavic are 40–50 % monosyllables under uniform `[1,max]`; the medial cluster of a `VCCV` syllable is treated as "nucleus" and escapes `isValidOnset/isValidCoda`; coda→next-onset junctions are unchecked (28 % of junctions rise in sonority).
- Pinned contracts: all shapes pruned while consonants exist ⇒ `shortfall.reason 'exhausted'` with `attempts 0`; an all-optional template can emit a vowel-less word; `forbidden` matches the NORMALISED joined string; `inventoryHas` caches per inventory object (treat an inventory as immutable once used).

### Phase 3b — Engine quality pass (2026-08-22; ran in parallel with Phase 5)

- Engine: **Syllable Contact Law** (`isValidContact` in `phonology/sonority.ts`: sonority across a coda→onset seam may fall or stay level, never rise) rides the EXISTING `clusters.sonority` switch — a rider, not a new profile field (the feature is unreleased; "make my words pronounceable" means sequencing AND contact). `splitMedialCluster` (maximal onset, no medial sibilant licence) + `syllableUnits` re-read a syllable as its vowel peaks so a `VCCV` template's medial cluster is checked (`arki`/`apka` pass — a two-consonant intervocalic run is always resolvable; `atska` fails on the coda half). `sonorityInClusters` now reports `detail: 'contact'`. No exported signature changed (additive exports only).
- Presets (data only): flowing `CVR → CV[n l r]`, max 3 syllables, `maxPerWord` 1, `CLV` split into `[t k d g f θ][r]V` + `[k g f][l]V` (other weights doubled to keep ratios); island `V` weight 2→1, `longVowelChance` 0.15→0.08, 15 `forbidden` entries banning a repeated vowel (`aa`/`aːa`/`aaː` × 5); guttural + slavic `syllableCount.min` 1→2; romance `phonemeTilt.r: 'rare'`, `CLV` → `[p b t d k g f][ɾ]V` + `[p b k g f][l]V` (realised onsets exactly `bl bɾ dɾ fl fɾ gl gɾ kl kɾ pl pɾ tɾ`); japanese the repeated-vowel `forbidden` recipe. Measured over 500 words × 7 presets: rising junctions 10–37 % → 0 %; guttural/slavic monosyllables 40–44 % → 0 %; island repeated vowels 0. Examples regenerated (only flowing/island/romance/guttural/slavic moved).
- Tests: `src/generator/__tests__/quality-phase3b.test.ts` (79) incl. 7 presets × 300 words zero rising junctions (and junctions returning with `sonority: false`), the two-consonant resolvability property, flavour bands (slavic/guttural < 15 % monosyllables, flowing ≤ 1 cluster and codas ∈ {n,l,r}, island no repeated vowel, romance/flowing cluster onsets obstruent+liquid with a non-vacuity floor, japanese never repeats a vowel). Two `PINNED:` expectations in `audit-phase3.test.ts` renamed `SUPERSEDED in Phase 3b:`. Generator scope: 875 tests / 20 files; eslint clean.
- NOTE for readers of §3.4: `sonorityInClusters` is now "onset rising, coda falling, contact non-rising between peaks, s+stop licence word-initially".
- Open: island "no three consecutive vowels" is a band (< 6 %, measured 4 %), not a guarantee — a hard zero would need the bare-`V` template gone.

### Phase 5 — Generator page (2026-08-22; ran in parallel with Phase 3b)

- Implementer: `/lexicon/generate` (`tabs/lexicon/generator/`: `WordGeneratorPage`, `PresetPicker` (native radios), `InventoryEditor`, `ShapeEditor`, `ConstraintsEditor`, `GeneratedWordList`, `useGeneratorProfile` (the ONE source of truth: settings + reactive data, full-key writes, 250 ms debounce with flush on blur/unmount, function-form patches against the profile at write time), `useDraftText`, `generatorText.ts`), `LexiconHome` secondary action, empty-lexicon links, `?pronunciation=` prefill via `initialPronunciation`, `autoSpellToGlyphOrder` in `spellingUtils.ts`. Live smoke on the dev server. 190 tests.
- Independent audit (`generator/__tests__/audit-phase5.test.tsx`, 77 tests): (D1) `?preset=` re-applied a flavour the profile already had — the chart legend links with the guide id, which IS the profile's flavour, so the ordinary generator → chart → generator journey wiped the user's edits; now skipped when identical, still stripped. (D2) a double-click on "Add N selected" created every word twice — the `isAdding` state never rendered; replaced by a claim/release ref that keeps a failed word retryable. Confirmed: full-key writes from all 13 controls + 4 text paths; refused writes toast and keep the draft; `generateWords` runs once per (profile, inventory, seed, count, existing) and not on unrelated context ticks; `?preset=` applies once under StrictMode.
- Gates: 2070 tests / 99 files, tsc clean, eslint clean.
- Handed to Phase 6: (D3) the "already in lexicon" pill is unreachable — the same normalised set feeds the engine's dedupe, so no surviving word can match it (remove the pill); (D4) `EtymologProvider` wraps `lexicon.create` with a per-call `refreshLexicon()`, so a 100-word batch does 100 full lexicon reads (add a batching primitive). Pinned as-is: the prefill effect is a no-op under StrictMode (harmless — `defaultValue` reaches the DOM); "Custom" leaves `guidePresetId` alone; only one notice shows at a time on a partial failure.

### Phase 6 — Hardening, audit fixes, docs (2026-08-22)

- `IPAExtraSoundsChart` ("Affricates & other sounds": affricates, the non-chart extras `ɕ ʑ w ʍ ɫ ɚ ɝ ɹ̠`, clicks, implosives — all DERIVED from `ipaChartData` + `EXTRA_SYMBOLS`, cells resolved by `phonemeIdentity` so a script's `tʃ` lights `t͡ʃ`) wired into `IPACombinedChart`; the Phase-4 "unpaintable guide keys" ratchet now asserts an EMPTY set for every preset. Legacy ligatures `ʧ ʤ ʦ ʣ ʨ ʥ` aliased to the tie-bar affricates. `GuideLegend` takes `coverage` from `useGuidePreset` (one computation), the "why" button is a real toggle (`aria-expanded`) that moves focus to the explainer (`tabIndex=-1`), avoid total deduplicated by identity. **`batchMutations`** on the context (re-entrant depth ref, pending-slice set drained before the flush, canonical slice order, try/finally) — `after()` routes through `requestRefresh`; `GeneratedWordList` batches its add loop (100 creates → 1 lexicon read). The unreachable "already in lexicon" pill removed. Weight input gets an inline error + `aria-invalid`. README "Word generator" section + route map/settings/testing rows; `todo.md` "Word generator" section. 2109 tests / 100 files, tsc + eslint clean.
- **Environment incident during this phase (not caused by this session):** at 15:25 another session half-removed the `beta` worktree; the junction-follow deleted 1734 tracked files under `packages/*` from the MAIN tree and pruned the shared store. Recovered per the runbook: `git ls-files --deleted | git restore`, `pnpm install --force` in MAIN (14m53), `prisma generate` for nochi + taxonia, dev server restarted. Gates re-run green afterwards.
- Browser pass (Claude-in-Chrome, `localhost:5174/etymolog/`): lexicon home actions + empty-state links; generator page (slavic profile, 37 sounds, 4 shapes, 20 words with syllable dots and spelling previews); "Add 1 selected" → Words in lexicon 0 → 1, row leaves the list; IPA chart with the Slavic guide: 46 cells painted (26/12/8), strip present, legend + actions; no console errors.
- Found in the browser → Phase 6b: auto-spell's IPA fallback makes a virtual glyph per CODE POINT, so an affricate renders as three glyphs (`t` `͡` `s`) and `aː` as two — pre-existing in `autoSpellService.generateSpellingWithFallback`, made visible by the generator.

### Phase 6b — Auto-spell fallback per sound (2026-08-22)

- `generateSpellingWithFallback`'s skip edge moved from one UTF-16 unit to one IPA token (`buildSkipUnits` over `tokenizeIpa`, with raw-span re-alignment for non-NFC input and a code-point fallback). `t͡s` → one virtual glyph, `aː` → one, `pʰ` → one; comparator untouched (optimality preserved); separators kept one-per-token (dropping them would merge two-word pronunciations in `translateWord`). No existing test pinned the old behaviour. 22 tests; 2131 / 100. Commit `fbd5ab6`.
- Browser: `/lexicon/create?pronunciation=kaːto` prefills the field; BUT a cancelable `beforeunload` is `defaultPrevented` on BOTH the prefilled and the plain empty create form → the create form is dirty on mount (pre-existing; `NavigationGuard` only installs the handler when `active`). → Phase 6c.

### Phase 6c — Create form dirty on mount (2026-08-22)

- Root cause: `main.tsx` wraps the app in `<StrictMode>`; React runs mount effects create → destroy → create while REFS survive, so the `isInitialRender = useRef(true)` latch in `GlyphCanvasInput`, `MeaningTableInput`, `AncestryInput` and `PronunciationTableInput` fell through on the second run and marked the field changed with nothing edited (`computeFormState.isChanged = fields.some(...)`) → `NavigationGuard active`. The same mechanism cancelled the create-mode prefill's deferred `setSmartFieldValue` (latch set before the timer, cleanup cleared the timer) — only `defaultValue` was holding the field up. Unmasked third finding: the meaning/pronunciation tables only announced changes on row add/remove, not on typing into a row.
- Fix: shared `src/components/form/customInput/useEditedSinceMount.ts` (identity of the state value vs the one captured at mount — stable however many times the effect runs); latch moved inside the prefill timer; the two table inputs mirror their inner form's `isChanged`. Proven by `LexiconEditorDirtyOnMount.test.tsx` (real `LexiconFormFields` under `<StrictMode>`; 5 failed before, 6 pass after) and in Chrome (fresh create load `defaultPrevented: false`, after typing `true`, the app's own leave modal works). 2137 / 101.
- Left for `todo.md`: edit mode is dirty on mount by design (`markChanged: true` on the initial write); `packages/smart-form` `draggableBlock` carries the same defeated latch (sets `isTouched` only).

## 6. Deviations from the plan

### Phase 1
- `ⁿ` is U+207F (not in the U+02B0–U+02FF modifier block); named explicitly in `isAttachingMark`.
- Affricate `place` = the second component's place (the plan's type comment said `null`; the prose won). Clicks keep `place: null`.
- `ɡ`→`g` is a table ALIAS (`base` is `g`, `token.text` stays `ɡ`), not a string rewrite.
- `isValidOnset` / `isValidCoda` take `string[]` (phoneme strings), matching the plan's own examples; any unclassifiable member → `false` (length ≤ 1 is always `true`).
- `splitPhonemeString` returns `IpaToken[]` (callers map `.text` or read `.features` without reclassifying).
- Extra exports beyond the contract: `isInClass`, `knownSymbols`, `TABLE_CONFLICTS`, `safeNormalize`, `separatorKindOf`, `isTieBar`, `isAttachingMark`, `VOICING_MARKS`.
- Decisions: vowel sonority 10/9/8 by height group; lateral fricatives are `F`/`O` (sonority 3/4), not `L`; extras' places — `ɕ ʑ` postalveolar, `w` velar approximant (→ `G`), `ʍ` velar fricative, `ɫ` alveolar lateral, `ɚ ɝ` mid central, `ɹ̠` registered whole; the sibilant-onset exception fires only at index 0 and only for sibilant FRICATIVE + plosive, the remainder is checked for strict rise on its own.


### Phase 2
- An optional group wraps exactly ONE item: `(CC)` is a syntax error (`TemplateItem` is a flat list with per-item `optional`; a multi-item group has no all-or-nothing representation). `()` and `[]` are errors.
- Literal-group splitting: any whitespace inside the brackets → split on whitespace; otherwise `splitPhonemeString` (`[nŋ]` → 2, `[t͡ʃk]` → 2, `[tʃk]` → 3, `[tʃ k]` → 2). Duplicate members dropped.
- `romance` closes syllables with `CV[n s r l]` instead of `CVC`; `slavic` flavour is `ɲ ʎ ɕ ʑ ʂ ʐ d͡z d͡ʒ` (bare `ʲ` is a modifier, `r̝` collides with core `r` by base); `guttural` keeps its ejectives in CORE next to the plain stops (cross-tier base collisions are forbidden); `japanese` uses `CVN` rather than a literal `[ɴ]`.
- Validator policy: absent → default, no issue; out-of-range numbers clamp WITH an issue; wrong types fall back WITH an issue; an unparseable template is dropped carrying the parser's message; `presetId` is not checked against the registry (cycle).
- Extra exports: `cloneDefaultProfile`, `cloneDefaultWordGeneratorSettings`, `presetInventory`, `ClusterRules`, `TemplateCheck`, `GuideMap`, `CoverageSet`, `PresetCoverage`, `OPTIONAL_CHANCE`, extra `LIMITS` keys. `guideMapFor`/`GuideTier` are declared in `coverage.ts` and re-exported from `presets/index.ts`.
- `src/db/api/types.ts` value-imports `DEFAULT_WORD_GENERATOR_SETTINGS` (it is the home of every default); the generator never imports the db (ratchet).

### Phase 4
- `ChartPageLayout` gained four optional props (`belowChart`, `aboutId`, `aboutOpen`, `onAboutOpenChange`) so the legend renders outside the scroll/pan box and can open the page's own explainer.
- A shared `useGuidePreset` hook instead of duplicating the settings → preset → coverage derivation in both pages.
- `data-guide="<tier>"` on painted cells/headers alongside the hashed class; the guide line is also in the cell's `aria-label` (tooltips are portal-mounted only while open).
- Focus ring moved to the LAST rule in `.cell` (same specificity as the vowel variant's guide `outline`; source order decides); syllabary `avoid` headers dim to 0.7, not 0.35.
- Legend copy: the "(n in your script)" tail always shows for core, only when non-zero for flavour/avoid; `why` is appended to the page's `about` under an `<h4>{preset.name}</h4>`; a stale id shows "No guide" selected while the raw id stays stored.

### Phase 3
- `expandTemplate` generified over `{ optional: boolean }`; `deriveInventory(source, profile, { conlangPhonemes? })`; `inventoryHas()` with a WeakMap identity cache instead of an `identities` field; `byClass` always carries all ten letters (and `off` members); `rejected` has the extra keys `emptySlot` / `duplicate`; build-time template pruning (empty required pool → shape skipped with a warning; empty optional pool → slot dropped); `count` is not clamped to `LIMITS.MAX_BATCH` (UI limit).
- Commonness lookup: identity first, then base + 0.5 (so `pʰ` sits right after `p`); unranked sounds last in input order.
- Geminates by full identity over ALL adjacent consonant pairs (vowels exempt); harmony by the first vowel of a slot with pre-partitioned pools; cluster budget counts runs of ≥ 2 consonants across the flattened word; length rolled only on a single not-already-long vowel with a one-way licence (`aː` matches inventory `a`); literal groups picked uniformly.
- Preset data: diphthong templates `C[…]` added to flowing/island/japanese/sinitic/romance/guttural; sinitic `diphthongs` `ei → ɛi`; guttural `['ai','au'] → ['aɪ','aʊ']`.

### Phase 5
- Spelling preview feeds `GlyphSpellingDisplay` with `SpellingDisplayEntry[]` + `graphemeMap` (the `LexiconComplete.spellingDisplay` path), not `buildVirtualGlyphMap` (whose path cannot expand a multi-glyph grapheme); auto-spell goes through `api.lexicon.previewAutoSpelling`.
- "Add shape" walks `SHAPE_LADDER` (a fixed `CV` duplicated the default and the validator dropped it silently); `ProfilePatch` may be a function (whole-array template edits under the debounce); the long-vowel range is a debounced draft; "Add N selected" reports once (not via `useApiAction`); "Select all / Clear" added; the source switch is disabled when the script has no sounds; "Custom" clears `presetId` only.
- Chips are filed under the first class in `P S F N L G O C V R`; tilt glyphs `· ★ ○ ✕`; `normal` deletes the tilt key.
- Not used: `ExpandableContainer` (sections are the page), `HoverToolTip` (hints are visible text), `LabelShiftTextCustomKeyboardInput` for "Add sound" (needs a SmartForm field).

### Phase 6
- The "Other" row of the extras strip is derived (`EXTRA_SYMBOLS` minus what the main charts draw) → 8 symbols incl. `ɹ̠`, not the plan's hand-listed 7. The consonant/vowel charts keep plain `phonemeMap.get` lookups (identity lookup there needs a memo + call-site change).
- `IPAChartCell`'s tooltip host is `width/height: 100%` — correct in a `<td>`, fatal in a flex row; the strip scopes `.groupCells > * { flex: 0 0 auto; width/height: auto }`.
- `Infinity` in the weight input gets the range message, not "must be a number".

## 7. Out of scope, recorded for `todo.md`

- **Text-to-speech playback of generated words.** Browser `speechSynthesis` cannot read IPA;
  eSpeak-ng (WASM, ~2 MB, offline, true IPA input, robotic voice) is the only faithful option and is
  a dependency (lockfile change → main tree). The cheaper approximation — transliterate to a
  near-phonemic language and use that browser voice — is a vibe, not a pronunciation. Decide after
  hearing a demo; not built here.
