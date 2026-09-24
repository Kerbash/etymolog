# Block script, part 2 — syllables, flexible slots, lone consonants

Follow-up to `BLOCK_SCRIPT_PLAN.md` (read §2–§4 there first). Owner request
(2026-09-24): make multi-syllable and clustered words ("spell", "strengths",
"patatapa") come out as proper blocks **without typing `.`**, and keep every
new control **plain and unconfusing**.

Status: `[ ]` todo · `[~]` in progress · `[x]` done.

| Phase | What | Status |
|---|---|---|
| A1 | `src/blocks/syllabify.ts` — pure syllable splitter | [x] |
| A2 | Slot counts (min/max/arrange), scheme `split` + `leftovers` fields, validator, template matcher, compose of repeated slots | [x] |
| B  | Wire it through: syllable-mode segmentation, lone-consonant mark, every consumer (normalization, canvas, popover, designer summary) | [x] |
| C1 | Designer: "Splitting words" + "Consonants with no vowel" sections | [x] |
| C2 | Designer: per-slot "How many signs" panel + chips/readouts | [x] |
| D  | Docs, live E2E, final audit | [x] |

A1 ∥ A2, then B, then C1 ∥ C2, then D.

---

## 1. What the user gets

1. **By-syllable splitting (recommended).** Each word is cut into syllables
   first — consonants between two vowels go to the FOLLOWING syllable when they
   can start one (`ta·pa`, `pa·ta·ta·pa`, `as·ta` or `a·sta`) — then each
   syllable becomes one block. Clusters that may start a syllable follow the
   generator's existing sonority rule (`isValidOnset` in
   `generator/phonology/sonority.ts`), with one checkbox for the `s` + stop
   exception (`sp st str`). `.` still forces a break wherever the user wants.
2. **Flexible slots.** A slot can take a COUNT of signs: exactly one (today),
   optional (0–1), 1–3, or 0–3; several signs share the slot's rectangle side
   by side or stacked. One `C1(0–3) V C2(0–3)` template then fits `a`, `spa`,
   `spɛl`, `strɛŋθs`.
3. **Consonants with no vowel.** A consonant that ends up in no block can be
   drawn with a user-chosen **vowel-killer mark** (a no-sound grapheme, like
   Devanagari's virama) placed below / above / after / before it, instead of
   on its own.

## 2. Data model (all additive; old documents mean exactly what they meant)

```ts
// BlockScheme (still version 1)
split?: { mode: 'syllables' | 'templates'; sibilantClusters?: boolean };
leftovers?: { markGraphemeId: number; placement: 'below' | 'above' | 'after' | 'before' };

// BlockSlot
min?: 0 | 1;          // absent = 1
max?: 1 | 2 | 3 | 4;  // absent = 1
arrange?: 'row' | 'column'; // absent = 'row' (side by side); only matters when max > 1

// BlockSegment (engine output)
roleIds?: string[];   // parallel to entryIndices: the role each entry fills
// SingleSegment
consonant?: true;     // a lone consonant (candidate for the vowel-killer mark)
```

- `split` absent ⇒ **template order** (today's behaviour — existing
  languages render byte-identically until the owner switches).
- `leftovers` absent ⇒ lone consonants drawn on their own (today).
- **Normalised form (pitfall N1):** the validator emits `min` only when `0`,
  `max` only when `> 1`, `arrange` only when `'column'`, `sibilantClusters`
  only when `true`. The designer's helpers MUST produce the same normalised
  form, otherwise `sameDocument(draft, saved)` reports a phantom unsaved change
  after every save.

## 3. Engine

### 3.1 Syllabify (A1) — `syllabify(units, options) → Array<[start, end)>`

Input per entry: its `EntryClass` and its sound string (grapheme's primary
phoneme / the IPA character), for ONE run (no boundaries or structural entries
inside — the segmenter cuts runs first). Output: contiguous half-open ranges
covering the whole run.

- nucleus = `phoneme` class whose letters include `V`;
- consonant = `phoneme` class whose letters include `C` (and not `V`);
- **opaque** = anything else (`syllable` sign, `silent`/logogram, `unknown`):
  its own range, and a wall — consonants never cross it;
- consonants before the first nucleus → its onset; after the last → its coda;
- between two nuclei: the LONGEST suffix of the cluster that `isValidOnset`
  accepts (with `allowSibilantOnset = options.sibilantClusters`) goes to the
  next syllable, the rest to the previous one's coda; a sound that cannot be
  described counts as a valid onset only on its own;
- two vowels side by side are two syllables (`a·i`);
- a run with no nucleus at all is ONE range.

### 3.2 Matching (A2) — `matchTemplate(template, roles, classes, start, end, mode)`

Pattern items in order, each role with `[min, max]` from its slot. Backtracking
(runs are short; cap max at 4). `mode: 'prefix'` returns the LONGEST match
starting at `start` (template mode); `'exact'` must consume `start..end`
(syllable mode). Result: `{ length, roleIds, emptyOptional }` or `null`.
A template with no counts behaves exactly like today (P2).

### 3.3 Segmentation (B)

- **template mode:** unchanged algorithm (first template in scheme order that
  matches a prefix wins; else single), now with counts → `roleIds`.
- **syllable mode:** per run, `syllabify`; per syllable, the template that
  matches the WHOLE syllable with the fewest empty optional slots (ties →
  scheme order); if none fits, fall back to template mode inside that syllable.
- singles that are consonants carry `consonant: true`.

### 3.4 Compose (A2 + B)

- A slot with n entries splits its rectangle into n parts, each sized by its
  sign's ink shape (clamped; equal when unmeasurable) (`row` →
  across, `column` → down); n = 0 draws nothing there.
- `ComposedSlot` becomes one per ENTRY (roleId + entryIndex …), in entry order.
- Lone consonant + mark (B): `composeLoneConsonant(...)` → a `ComposedBlock`
  with `templateId = LONE_CONSONANT_TEMPLATE_ID` (`'@lone'`, reserved — the
  validator drops a user template with that id), the consonant and the mark
  placed by the placement preset (the mark takes 30 % of the box). A mark
  grapheme that no longer exists ⇒ drawn alone (never throw).

## 4. Designer UX (C1, C2) — plain language first

- New section **"Splitting words into blocks"** above Roles:
  - `(•) By syllable — recommended` "Each word is cut into syllables, and each
    syllable becomes one block: *tapa* → *ta · pa*."
  - `( ) By template order` "Reads left to right and uses the first template
    that fits (how earlier versions worked): *tapa* → *tap · a*."
  - under By syllable: `[ ] Let a syllable start with s + consonant (sp, st, str)`.
  - a small live line using the user's first spelled words: "*tapa* → ta · pa".
  - when `split` is absent: a visible note "Words are split by template order
    (how earlier versions worked). Most scripts want By syllable." — no silent
    switch.
- New section **"Consonants with no vowel"**: `(•) Draw it on its own` /
  `( ) Add a vowel-killer mark`; with the mark: the chosen grapheme's thumbnail,
  `[Choose mark…]` (GraphemePickerModal), `Place it: [below ▾]`, a live
  preview. No suitable grapheme yet → "Draw the mark first: Script Maker → New
  grapheme, tick *No sound*" with a link.
- Template editor (C2): selecting a slot shows **"How many signs"**
  `[Exactly one ▾]` = Exactly one · Optional (none or one) · One to three ·
  Up to three (or none), and when more than one is allowed
  `Several signs sit: [side by side ▾ / stacked]`. Pattern chips and the list
  read "C2 (optional)", "C1 (1–3)", "C1 (up to 3)".
- Preview captions show the split: "ta · pa → 2 blocks: CV, CV".

## 5. Pitfalls (read before writing code)

- **P1 byte identity.** Scheme off ⇒ nothing here runs. Scheme on with no
  `split`, no counts, no `leftovers` ⇒ output identical to today (existing
  snapshot + compose tests must pass UNCHANGED except where a test hand-builds
  a `BlockSegment` — `roleIds` is optional for that reason: absent ⇒ pattern
  order, lengths must match).
- **P2 counts default to exactly one.** Every code path reads
  `slot.min ?? 1`, `slot.max ?? 1`.
- **N1 normalised form** (§2) — designer helpers and the validator agree.
- **P3 no jargon in the UI.** Never "onset", "coda", "nucleus", "sonority",
  "virama" in visible text (code comments may use them).
- **P4 visible, not silent** (CLAUDE.md): no automatic switch of an existing
  scheme's split mode.
- **P5 token ratchet** (`src/styles/__tests__/tokens.test.ts` scans every src
  file incl. tests): no colour literals, no `var()` fallbacks, no undefined
  custom properties.
- **P6 React rules here:** component files export only components
  (react-refresh); do not hand-memo derived values (React compiler lint);
  StrictMode double-invokes effects.
- **P7 `useEtymolog` mocks** in tests return ONE stable object (a fresh object
  per call loops effects and kills the vitest worker silently).
- **P8** Never commit; never `git add -A`; never run `pnpm ci:full`; never a
  non-frozen `pnpm install`; never `rm -rf` in a worktree.

## 6. Outcome (2026-09-24)

Shipped on `alpha`: engine `ad5156d`, designer `0f26c4d`, docs + E2E in the
follow-up commit. 3327 tests green, typecheck clean in etymolog. Live-checked
in Chrome: `patatapa` → `pa · ta · ta · pa` (4 CV blocks), `strɛŋθs` → one
CVC block with `C1`/`C2` up to 3, `st` → two consonants with the mark, save
round-trips without a phantom unsaved change, settings survive a reload.

Known limits (in `todo.md`): logograms are their own unit in syllable mode;
several signs in one box get small at word-preview size; the vowel-killer
mark is any grapheme (no dedicated "mark" kind).
