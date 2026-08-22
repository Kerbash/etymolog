# Etymolog redesign and logic-repair plan

Worktree: `D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega` (branch `omega`, clean, == master). All paths below are relative to that worktree unless absolute.

## 0. Verified facts that shape the plan (beyond the two audits)

These were confirmed by reading source; several change the approach the audits implied.

1. **sql.js `Database.export()` closes and reopens the connection** (`apps/etymolog/node_modules/sql.js/dist/sql-wasm-debug.js:1236-1248`: frees all statements, `sqlite3_close_v2`, `FS.readFile`, `sqlite3_open`). Consequences: (a) every `persistDatabase()` silently resets `PRAGMA foreign_keys` to OFF, so FK was dead even on the fresh-DB path after the first write, not only on load; (b) an `export()` issued inside an open transaction rolls that transaction back. Therefore: a single `exportDatabaseBytes()` must re-apply connection pragmas after every export, and persistence must never run while a transaction is open.
2. **`TabContainer` controlled mode has no change callback.** `controlledActiveSection` exists, but selection always goes through `showSection()` which does `setActiveSection` + `history.replaceState(?<id>=...)` (`packages/cyber-components/container/tabContainer/tabContainer.tsx:186-192`). There is no `onSectionChange`, and the `?id=` write would fight react-router. Migrating etymolog to `TabContainer` requires adding two props (`onSectionChange`, `urlSync`) to the package.
3. **`RouterTabContainer` has exactly three consumers, all in etymolog** (`MainApp.tsx`, `tabs/grapheme/main.tsx`, `tabs/writingSystem/main.tsx`). It can be deleted after migration.
4. **Next.js-coupled cyber-components are unusable in this Vite app**: `interactable/buttons/backButton` (`useRouter` from `next/navigation`), `interactable/navigation/breadcrumb` (via `subtleUnderlinedButton`, which imports `next/link`), `nav/linkListCategory`, `settings/langSelector`, `socials/socialIcon`. Etymolog has no `next` dependency, so these fail at resolve time. `PageHeader`/breadcrumb/back must be etymolog-local using react-router `Link`. The `button.tsx` hit in the grep is a doc comment only; `Button`/`IconButton` are safe (already used).
5. **Next-free and usable**: `Modal` (+ `useModalClose`), `ConfirmationOverlay` (`frame="inline"`, no danger tone, buttons are `IconButton`s with fixed `x-lg`/`check-lg`), `useConfirmationDialog` (promise API, superseding semantics, unmount-safe), `NotificationBanner` (`visible`, `title`, `message`, `severity`, `actions[]`, `onDismiss`, `autoHideMs`, `offsetTop`, parts), `FloatingBanner` (`message` null = hidden), `Shimmer` (`width/height/radius/ariaLabel`), `DarkmodeSwitch` (cookie-persisted, sets `data-theme` on `<html>`, wraps `DropDownSmall`+`Switch`), `NavigationGuard` (`active`, `translationMap`, `modalCardTemplate`, `parts`; intercepts `beforeunload`, same-origin anchor clicks, popstate; "Leave" = `window.location.href` full reload), `QuickFactsRow` (`items[{label,value,big}]`), `NumberedSectionHeader` (`number`, `title`, `sub`, `separator`, parts), `Pagination`, `DataGallery` (`renderItem`, `keyExtractor`, search/sort/view-toggle/pagination, state slots, a11y labels), `BasicTable`/`SortableTable`, `ExpandableContainer`, `DotLoader`, `SvgIcon`, `Switch` (has `aria-label`, no `id`), `BasicHeader`/`BasicBody`/`BasicFooter` (landmarks).
6. **Theme bootstrap**: `ThemeInitScript` is a React `<script>` for a Next `<head>`; the plain-string `themeInitSource` and helpers (`resolveStoredTheme`, `readThemeCookie`) live in `interactable/settings/darkmodeSwitch/themeInitSource.ts` and are environment-agnostic. Etymolog's `index.css` already has a `[data-theme="dark"]` block, so the mechanism matches.
7. **`style-switcher`** is a slot/preset registry + CSS-var injector (`StyleSwitcher base overrides`, `useSlot`), not a light/dark switch. It is a declared dependency of etymolog but imported nowhere.
8. **Tests**: vitest `environment: 'node'`, `setup.ts` mocks `localStorage`; component tests opt into happy-dom per file (`// @vitest-environment happy-dom`). Neither node nor happy-dom provides IndexedDB; persistence must be adapter-injected for tests. Current suite: 360 tests across 16 files.
9. **`vite build` writes to `docs/`** (committed static site). Build to verify, but `git checkout -- docs` before intermediate commits; rebuild as the final commit (matches history: `(etymolog): rebuild static docs site`).
10. **Lockfile**: no dependency additions/removals from the worktree (CLAUDE.md). Every phase below is dependency-neutral.
11. **Settings shape** (`src/db/api/types.ts:140-260`): `autoSaveInterval` is never read; `writingSystem.glyphStacking` never read; `DirectionValue` contains `'btu'` while the display layer uses `'btt'`.
12. **`importExportData`** (`src/db/exportImport/jsonCodec.ts:193-274`) calls `resetDatabase()` (DROP + CREATE + persist) before `BEGIN`, validates no row shapes, derives columns from `rows[0]`, imports exported closure rows verbatim, and writes settings straight to `localStorage`.

## 1. Phase overview

| # | Name | Commit message | Depends on |
|---|------|----------------|------------|
| 1 | Data safety | `(etymolog): phase 1 data safety - atomic import, IndexedDB persistence, FK pragma, init guard, settings validation` | - |
| 2 | Data-model integrity | `(etymolog): phase 2 data model - named-column mapping, spelling source of truth, transactions, closure, orphan guards, user_version migrations` | 1 |
| 3 | Domain logic | `(etymolog): phase 3 domain logic - translator boundaries/autospell, N+1 batching, targeted refresh, rendering primitives` | 2 |
| 4 | Design-system foundation | `(cyber-components): TabContainer onSectionChange/urlSync, ConfirmationOverlay tone, EmptyState` then `(etymolog): phase 4 design system - token layer, shared primitives, confirm/notify providers, sass cleanup` | 1 |
| 5 | App shell and navigation | `(etymolog): phase 5 app shell - header, accessible responsive nav, landmarks, dark mode, persistence status` | 4 |
| 6 | Lexicon and Translator pages | `(etymolog): phase 6 lexicon + translator - route-based edit, shared gallery, wired layout controls` | 3, 5 |
| 7 | Script Maker and Writing System pages | `(etymolog): phase 7 script maker + writing system - one CRUD paradigm, chart layout, labelled table` | 6 |
| 8 | Hardening and release | `(etymolog): phase 8 hardening - lint zero, a11y/responsive sweep, docs` + `(etymolog): rebuild static docs site` | 7 |

Phases 1-3 are pure logic (no visual change) and land first so every later browser check exercises safe persistence. Phase 4 can start in parallel with Phase 2/3 if desired, but should be committed after them to keep the history reviewable.

Standard acceptance for every phase: `cd apps/etymolog && pnpm test:run` (count must be >= previous), `pnpm typecheck`, `pnpm lint` (error count must not rise; target per phase noted), `pnpm build` (then `git checkout -- docs`). For package changes: `cd packages/cyber-components && pnpm test`.

---

## 2. Phase details

### Phase 1 - Data safety (E1, E2, E3, E8, E11)

**Goal**: no user action or failure path can lose or corrupt data: import is atomic and validated, persistence is debounced/async with a previous-good slot and surfaced errors, FK enforcement is real on every connection and survives `export()`, initialisation is idempotent under StrictMode, settings are validated and all changes notify.

**Ordered steps**

1.1 Connection helpers in `src/db/database.ts`
- Add `openConnection(bytes?: Uint8Array): Database` = `new SQL.Database(bytes)` + `applyConnectionPragmas(db)` (`PRAGMA foreign_keys = ON`). Use it at all four construction sites (load, load-failure fallback, fresh, `importDatabaseFile`).
- Add `exportDatabaseBytes(): Uint8Array` = `db.export()` followed by `applyConnectionPragmas(db)`; make it throw if `getTransactionDepth() > 0` (helper added in 1.3). Route `persist`, `exportDatabaseFile()`, and the import snapshot through it. This is the fix for finding 0.1.
- `initDatabase()` in-flight guard: module-level `initPromise`; return it while pending; clear it on failure. Export `createDetachedDatabase()` (fresh `SQL.Database` with pragmas, not the singleton) for migration fixture tests.
- Add `getDatabaseHealth()` returning `{ fkViolations: number, restoredFromBackup: boolean, crcMismatch: boolean }` populated during init (`PRAGMA foreign_key_check`), consumed by the shell banner in Phase 5.

1.2 Persistence module `src/db/persistence/` (new)
- `types.ts`: `DbStorageAdapter { kind; load(): Promise<StoredDb|null>; loadPrevious(); save(bytes, crc): Promise<void>; clear(); }`, `StoredDb { bytes, crc, savedAt, schemaVersion }`, `PersistenceState { status: 'idle'|'pending'|'saving'|'saved'|'error'; error?: { code: 'QUOTA'|'UNAVAILABLE'|'WRITE_FAILED'; message }; lastSavedAt?; bytes?; adapter }`.
- `indexedDbAdapter.ts`: DB `etymolog`, store `database`, keys `current`/`previous`; `save` rotates `current -> previous` and writes `current` in one readwrite transaction; opens lazily; any open/upgrade failure rejects so the selector falls back.
- `localStorageAdapter.ts`: existing base64 + CRC scheme under the existing keys (`etymolog_db_v3`, `etymolog_db_v3_crc32`) plus `etymolog_db_v3_prev`; pre-check `bytes * 4/3 > 4.5 MB` -> `QUOTA` error before attempting `setItem`; catch `QuotaExceededError` by name.
- `memoryAdapter.ts` for tests.
- `selectAdapter.ts`: IndexedDB when available and opens, else localStorage. One-time migration: IDB empty + localStorage has `etymolog_db_v3` -> load from LS, save to IDB, remove the LS copy only after the first successful IDB save.
- `scheduler.ts`: `schedulePersist()` (trailing debounce, default 300 ms), `flushPersist(): Promise<void>`, `subscribePersistence()`, `getPersistenceState()`; listeners on `pagehide` and `visibilitychange(hidden)` call `flushPersist()`; a failed save keeps the dirty flag so the next schedule/flush retries; exposes `setStorageAdapterForTests()`.
- `database.ts`: `persistDatabase()` keeps its exported name but becomes `schedulePersist()` (all 34 existing call sites keep working; Phase 2 collapses them to op boundaries). Add `persistDatabaseNow()` = flush. `closeDatabase`, `clearDatabase`, `resetDatabase`, `importDatabaseFile` await the flush. `initDatabase` loads via the adapter: verify CRC; on mismatch try `loadPrevious()`, set `restoredFromBackup`; only if both fail create a fresh DB (and keep the bad bytes under `previous` so nothing is silently thrown away).
- Remove `autoSaveInterval` from `EtymologSettings`, `DEFAULT_SETTINGS`, and the validator (debounce replaces it; it was never read). Old exports/storage containing the key are dropped by the validator in 1.4.

1.3 Transaction helper `src/db/utils/transaction.ts` (used by import now, by all services in Phase 2)
- `withTransaction<T>(db, fn: () => T): T` with a module depth counter: depth 0 -> `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`; depth > 0 -> `SAVEPOINT sp_<n>`/`RELEASE`/`ROLLBACK TO ... ; RELEASE`. On outermost commit call `schedulePersist()`. Throw a typed `TransactionRollbackFailed` if the rollback statement itself throws. `getTransactionDepth()` exported for the export guard.

1.4 Settings `src/db/api/settingsApi.ts` + new `src/db/api/settingsSchema.ts`
- `validateSettings(raw: unknown): { settings: EtymologSettings; warnings: string[] }`: hand-written (no new dependency) deep validation - enums for `DirectionValue` (`'btu'` coerced to `'btt'` here; Phase 3 renames the type), booleans, `defaultGalleryView`, `punctuation` validated per-key against a deep-cloned `DEFAULT_PUNCTUATION_CONFIG`, `customCharts` shape; unknown keys dropped with a warning; missing keys filled from deep-cloned defaults (`structuredClone`).
- `loadSettingsFromStorage` and `resetSettings` go through the validator; `DEFAULT_SETTINGS` is never shared by reference (fixes the shared `punctuation` object).
- Remove the monkey-patch; `update`, `reset`, and the new `importSettings(raw)` all call `notifySettingsListeners()` on success. `update` validates the merged result and returns `VALIDATION_ERROR` with the first warning turned fatal for enum violations.

1.5 Atomic import `src/db/exportImport/jsonCodec.ts` + new `src/db/exportImport/validateExport.ts`
- `validateExportData(data): ValidatedExport` - per-table: column whitelist, type checks (`id` integer, required non-null strings, integer positions/flags, `glyph_order` is a JSON string array), in-memory referential integrity (child rows whose parent id is absent are pruned and counted in `report.pruned[table]`; a missing *parent* table row is a fatal error), duplicate primary keys fatal. Column list = union of keys across rows intersected with the whitelist; missing values insert as `null`.
- `importExportData(data, onProgress): ImportReport`: `snapshot = exportDatabaseBytes()`; `withTransaction(db, () => { clearAllTables(db); insert in TABLE_INSERTION_ORDER; legacy meanings migration; fix sequences; rebuildClosureTable(db) (exported closure rows are ignored); if PRAGMA foreign_key_check returns rows -> throw ImportIntegrityError })`. `clearAllTables` is the DELETE-based body shared with `clearDatabase()` (unifies C14; no DROP/CREATE inside the transaction, which also avoids the pragma-inside-transaction no-op). On any error the transaction is rolled back; if `TransactionRollbackFailed`, reopen from `snapshot` via `replaceDatabase(bytes)`. Only after success: `settingsApi.importSettings(data.settings)` then `persistDatabaseNow()`.
- `importService.ts` returns the `ImportReport` so the UI can say "Imported 312 words; 2 orphaned spelling rows were dropped".
- `databaseApi.export('json')` implemented via `exportAsJson` (quick win).

1.6 Delete deprecated and dead code
- Delete `src/db/useGlyphs.ts`, `src/db/useGraphemes.ts` (zero consumers outside `db/index.ts`), their exports in `src/db/index.ts`, `src/components/tabs/graphotactic/main.tsx`, `src/components/form/customInput/spellingInput/` (unreferenced). Keep `TranslationControls.tsx` (wired in Phase 6).

**Tests to add** (`src/db/__tests__/` unless noted)
- `persistence.test.ts`: memory adapter; debounce coalesces N schedules into 1 save (fake timers); `flushPersist` saves immediately; CRC mismatch on `current` loads `previous` and sets `restoredFromBackup`; adapter `QUOTA` rejection -> state `error.code === 'QUOTA'` and dirty retained; LS->IDB migration with two memory adapters; `exportDatabaseBytes` re-applies `foreign_keys` (assert `PRAGMA foreign_keys` == 1 after export).
- `initDatabase.test.ts`: two concurrent `initDatabase()` calls resolve to the same instance; failure clears the guard.
- `foreignKeys.test.ts`: deleting a grapheme referenced by `lexicon_spelling` throws; `grapheme_glyphs` cascade on grapheme delete; pragma still ON after a persist cycle (the previously-documented bypass in `lexiconService.test.ts:466` becomes an expected failure - update that test).
- `transaction.test.ts`: nested savepoints, rollback restores rows, persist scheduled once per outer commit.
- `exportImport/__tests__/importSafety.test.ts`: malformed row -> throws and the pre-import data is intact; dangling child rows pruned and reported; imported closure is rebuilt (seed a stale closure in the envelope); settings restored via `settingsApi` and listeners notified; unknown settings keys dropped.
- `settingsApi.test.ts` (new file): deep merge, enum rejection, `reset` notifies, `'btu'` coercion, defaults not shared by reference.

**Acceptance**: suite >= 360 + new; `pnpm typecheck` clean; lint errors <= 85. Browser (Claude-in-Chrome, `pnpm dev`, `http://localhost:5173/etymolog/`): create a word, hard-refresh within 300 ms -> word present; DevTools Application tab shows `etymolog` IndexedDB with `current` and `previous`; paste a corrupted JSON into Import -> error shown, data untouched; `React.StrictMode` dev console shows a single "Tables created"/"loaded" log.

---

### Phase 2 - Data-model integrity (E4, E5, E6, E7, E12, E15)

**Goal**: every multi-statement write is transactional with one persist at the op boundary; the lexicon has one spelling source of truth; ancestry/closure cannot go stale or cyclic; no orphan-producing delete path remains; schema versions are explicit, idempotent and fixture-tested.

**Ordered steps**

2.1 Row mapping `src/db/utils/sql.ts` (new): `execRows(db, sql, params): Record<string, unknown>[]` (uses `result.columns`). `lexiconService.ts`: replace positional `mapRowToLexicon(row: unknown[])` with `mapLexiconRecord(rec)`; rewrite `getAncestorsByLexiconId`/`getDescendantsByLexiconId` to select `l.*` plus aliased junction columns (`la.position AS ancestry_position`, `la.ancestry_type`). Apply the same helper to `graphemeService`/`glyphService` mappers opportunistically (they are also positional).

2.2 Spelling source of truth (`lexiconService.ts`, `lexiconApi.ts`)
- `setLexiconSpelling(id, spelling)` -> sorts by position, converts to `glyph_order` entries, delegates to `setLexiconGlyphOrder` (which updates `lexicon.glyph_order` and resyncs the junction). `addSpellingToLexicon` appends to `glyph_order`. `applyAutoSpelling` converts `AutoSpellResultExtended.spelling` (`isVirtual ? ipaCharacter : createGraphemeEntry(grapheme_id)`) and calls the same path.
- `syncLexiconSpellingFromGlyphOrder`: drop the dedupe and the swallowed-error loop; insert one junction row per grapheme occurrence with its true index (the `UNIQUE(lexicon_id, grapheme_id, position)` constraint already permits this). Errors propagate (inside the transaction).

2.3 Transactions everywhere: wrap `createLexicon`, `updateLexicon`, `deleteLexicon`, `setLexiconSpelling`, `setLexiconAncestry`, `addAncestorToLexicon`, `removeAncestorFromLexicon`, `createGrapheme`, `updateGrapheme`, `setGraphemeGlyphs`, `reorderGraphemeGlyphs`, `deleteGrapheme`, `addPhoneme`/`updatePhoneme`/`deletePhoneme`, `forceDeleteGlyph`, `cascadeDeleteGlyph`, `cleanupOrphanedGlyphs`, `clearDatabase`, `resetDatabase` in `withTransaction`. Delete every inner `persistDatabase()` call (the helper schedules on outer commit). `closureService.addClosurePaths`/`rebuildClosureTable` stop persisting themselves.

2.4 Closure maintenance (`closureService.ts`, `lexiconService.ts`)
- `deleteLexicon`: inside the transaction delete both ancestry directions then `rebuildClosureTable()`; with v6 schema (2.6) FK cascade handles ancestry but the explicit deletes stay for ordering clarity.
- `setLexiconAncestry`: cycle check before writing, using a recursive CTE over `lexicon_ancestry` that excludes the rows being replaced (`WHERE lexicon_id <> ?`); rebuild closure; after rebuild assert `SELECT 1 FROM lexicon_ancestry_closure WHERE ancestor_id = descendant_id LIMIT 1` is empty, else throw (rolls back).
- `removeClosurePaths` -> renamed `rebuildClosureAfterEdgeChange()` (honest name), remove the design-debate comment and the empty catch.
- `getFullAncestryTree`: per-path visited set (diamonds render), explicit `truncated: true` on nodes cut by `maxDepth`; `getAllDescendantIds` uses closure only (no ambiguous CTE fallback) because closure is now maintained.

2.5 Orphan guards
- `cascadeDeleteGlyph`: iterate affected graphemes through `deleteGrapheme(id)` (which throws if used in the lexicon) inside one transaction - a glyph used by a word-bearing grapheme cannot be cascade-deleted; the thrown message lists the words. `forceDeleteGlyph`: refuse when any grapheme would drop to zero glyphs (list them). `deleteGrapheme` checks `lexicon_spelling` (now accurate after 2.2).
- Wire `handleGraphemeDeletion` as opt-in: `graphemeApi.delete(id, { respellLexicon?: boolean })` -> when used and `respellLexicon`, call `handleGraphemeDeletion(id, primaryPhoneme)` (auto-spell entries get IPA fallback, manual entries get `needs_attention`) then delete, all in one transaction. Phase 7 surfaces this as a second confirm step.
- `repairOrphans(db)` in `src/db/migrations/repair.ts`: prune `lexicon_spelling`/`grapheme_glyphs`/`phonemes`/`lexicon_ancestry` rows with missing parents, replace `glyph_order` references to missing graphemes with `'?'` + `needs_attention = 1`, rebuild closure. Used by migration v6 and exposed as `databaseApi.repair()` for the health banner action.

2.6 Migrations `src/db/migrations/` (new)
- `index.ts`: `MIGRATIONS: Migration[]` (`{ version, description, up(db) }`), `CURRENT_SCHEMA_VERSION = 6`, `runMigrations(db)`: read `PRAGMA user_version`; if 0, `detectLegacySchemaVersion(db)` from `sqlite_master`/`table_info` (the current if-chains become detectors for v1..v5); run each pending migration in its own `BEGIN ... COMMIT` and set `user_version` inside the same transaction. Migrations needing `PRAGMA foreign_keys = OFF` (table rebuilds) toggle it outside the transaction and run `PRAGMA foreign_key_check` after.
- v1 category columns, v2 lexicon tables, v3 closure, v4 `glyph_order` backfill, v5 `lexicon_meanings` (moved verbatim from `database.ts`), v6 (new): rebuild `lexicon_ancestry` with `ancestor_id INTEGER NOT NULL ... ON DELETE CASCADE`, `repairOrphans`, closure rebuild. `createTables` stamps `user_version = CURRENT` for fresh DBs. `importDatabaseFile` uses the same pipeline.
- `database.ts` shrinks to connection/persistence concerns; schema DDL moves to `src/db/migrations/schema.ts`.
- README `apps/etymolog/README.md` lines ~590-605 (migration notes) and ~670-690 (settings travel) rewritten to match.

**Tests to add**
- `ancestry.test.ts`: ancestors/descendants carry correct `glyph_order`, `created_at`, `updated_at`; ancestor `spellingDisplay` non-empty; diamond ancestry tree renders both branches.
- `spellingSourceOfTruth.test.ts`: `api.lexicon.updateSpelling` then `getByIdComplete` shows the new spelling; `applyAutoSpelling` visible; a subsequent `updateLexicon` without `glyph_order` preserves it; duplicate graphemes keep positions.
- `closureService.test.ts` (direct): add/remove/rebuild, cycle via `setLexiconAncestry` rejected, `deleteLexicon` leaves no rows referencing the id, post-rebuild self-path assertion.
- `orphans.test.ts`: cascadeDeleteGlyph refused when word-bearing; forceDeleteGlyph refused at zero-glyph; `delete(id,{respellLexicon:true})` marks/respells; `repairOrphans` counts.
- `migrations.test.ts` with `__tests__/fixtures/legacySchemas.ts` (DDL + seed rows for v2, v3-no-lexicon, v4-no-meanings, v5): each migrates to `CURRENT_SCHEMA_VERSION`, data preserved, `foreign_key_check` empty, second run is a no-op, fresh DB is stamped.
- `transactions.test.ts`: a failing phoneme insert inside `createGrapheme` leaves no grapheme row; persist scheduled exactly once per op (spy on scheduler).

**Acceptance**: all Phase 1 tests still pass; `lexiconService.test.ts`/`lexiconDangerZones.test.ts` updated where they documented the old bypasses; lint <= 70 (the `any` in services/API removed as files are touched). Browser: load an older export (from `docs/` era) -> migration log shows v6, words with ancestors show ancestor glyph spellings on the view page.

---

### Phase 3 - Domain logic (E9, E10, E13, E14)

**Goal**: translator output is structurally correct for multi-glyph graphemes and configured separators; list queries are O(1) statements; rendering primitives have one implementation each.

**Ordered steps**

3.1 Semantic roles instead of index arrays
- `SpellingDisplayEntry` gains optional `role?: 'word-separator' | 'line-break' | 'punctuation'` (`src/db/types.ts`); `translatePhrase` sets it on the entries it synthesises (`phraseService.ts`). `RenderableGlyph` gains `role` and `sourceIndex` (`components/display/spelling/types.ts`), set in `normalizeSpellingDisplay` (`utils/normalization.ts`). `createComposedBlockStrategy(writingSystem)` splits on `glyph.role` (`composedBlockStrategy.ts: splitIntoWords`); `wordBoundaries`/`lineBreaks` props are removed from `GlyphSpellingDisplay`/`PhraseDisplay` (only `TranslatorHome` used them). `TranslatorHome` drops its boundary `useMemo`.
- `strategies/index.ts`: `'composed-block'` resolves to `createComposedBlockStrategy(DEFAULT_WRITING_SYSTEM_SETTINGS)` instead of silently falling back to `blockStrategy`.

3.2 Autospell in the translator (`phraseService.translateWord`)
- Use `autoSpellResult.spelling` + `segments` as the consumed-span source: virtual -> `{type:'ipa', ipaCharacter: entry.ipaCharacter}`; real -> `{type:'grapheme', grapheme}` resolved through a `graphemeMap` passed in `TranslationConfig` (phraseApi already receives graphemes for punctuation; extend to all). Never index `originalWord`.
- Tokenizer strips leading/trailing punctuation `[.,!?;:]` into separate tokens; `translatePhrase` emits them via `createPunctuationEntry` with the `settings.punctuation` key map (`.`/`!`/`?` -> sentence end, `,` -> comma, etc.; map table lives next to `PunctuationSettings`). This gives `createPunctuationEntry` its first caller.

3.3 N+1 batching
- `getAllLexiconComplete`: 4 statements (lexicon, all graphemes -> `Map`, ancestry joined both directions, meanings) grouped in JS; `buildSpellingDisplay(glyphOrder, graphemeIndex?)` accepts a prefetched map; `getLexiconComplete` passes a map built from the ids in its own `glyph_order` (`WHERE id IN (...)`). `getAllGraphemesComplete`: 3 statements (graphemes, `grapheme_glyphs JOIN glyphs ORDER BY grapheme_id, position`, phonemes).
- `EtymologContext.tsx`: replace the blanket `refresh` wrapper with a refresh matrix - glyph mutations -> `refreshGlyphs + refreshGraphemes` (+ `refreshLexicon` for `forceDelete`/`cascadeDelete`); grapheme create/update/updateGlyphs -> `refreshGraphemes + refreshGlyphs` (usage counts); grapheme delete -> all three; phoneme -> graphemes; lexicon -> lexicon; database ops and import -> all. Refresh functions record failures in `data.lastRefreshError` (surfaced by the Phase 5 banner) instead of swallowing. Replace the `any` generics with `<T extends (...args: never[]) => ApiResponse<unknown>>`.

3.4 Rendering primitives
- One `generateVirtualGlyphId` in `src/db/utils/virtualGlyph.ts` (full 31-bit djb2 hash, no `% 1e6`); `normalization.ts` and `virtualGlyphUtils.ts` import it. `GlyphCanvasInput.buildGlyphOrder` guards with `isVirtualGlyphId` and throws a descriptive error for an unknown negative id rather than emitting `grapheme--N`.
- `combineSvgStrings` (`glyphCanvasInput/utils/graphemeUtils.ts`): parse each source `viewBox`, extract inner content by first `>` after `<svg` and last `</svg>` (not a non-greedy regex), wrap as nested `<svg x y width height viewBox=source>` so the browser rescales; fixed cell size. Delete the fabricated dates in `graphemeUtils.ts:131-132` (use the grapheme's real timestamps).
- `'btu'` -> `'btt'` everywhere (`DirectionValue`, `composedBlockStrategy`, `WritingSystemRow` options; settings validator already coerces). Delete `rules/layout/glyphStacking.ts` and the `glyphStacking` setting (never read); implement `wordWrap: 'glyph'` (break inside words) in `composedBlockStrategy`; add `validateWritingSystem()` returning warnings for contradictory axes (wordOrder and lineProgression on the same axis) - used by the Phase 7 UI. Delete `layoutUtils.ts` duplicates in favour of `linearStrategy`. Fix `boustrophedonStrategy` magic `5/row` to derive from `maxWidth`; align `emptyBounds` with `calculateBounds` padding.
- `sanitizeSvg` Node fallback (`db/utils/sanitize.ts`): in non-DOM environments use `DOMPurify(new (await import('happy-dom')).Window())`? No new dependency is allowed and happy-dom is already a devDependency - but runtime code must not import it. Instead: throw in non-browser environments unless `ALLOW_UNSANITIZED_SVG_FOR_TESTS` is set by `setup.ts`, so CI cannot silently pass unsanitised SVG.

**Tests to add**
- `composedBlockStrategy.test.ts` (new): multi-glyph grapheme before a separator keeps the separator at the right glyph; configured grapheme separator splits words; 16 direction combinations produce monotonic positions; `wordWrap: 'glyph'` wraps mid-word; line-break role starts a new line.
- `phraseService.test.ts` additions: multi-char phoneme autospell keeps tail characters; matched real graphemes emitted as `type:'grapheme'`; punctuation emitted via settings.
- `queryCount.test.ts`: spy on `db.exec`/`db.run`; `getAllLexiconComplete` with 50 seeded entries executes <= 6 statements; `getAllGraphemesComplete` <= 4.
- `virtualGlyph.test.ts`: same id from both call sites; `combineSvgStrings` output viewBox and nested svg count; `normalization` sets `role`/`sourceIndex`.
- `EtymologContext.test.tsx` (happy-dom): glyph update refreshes graphemes, not lexicon; lexicon create refreshes only lexicon; refresh failure sets `lastRefreshError`.

**Acceptance**: Browser: in Translator, a word whose grapheme has 2+ glyphs followed by a space renders the break after the whole grapheme; a configured word-separator grapheme appears between words; typing `hello, world.` shows punctuation entries. Lint <= 55.

---

### Phase 4 - Design-system foundation

**Goal**: a complete, dark-mode-correct token layer; shared primitives every page will use; all deletes behind one confirmation dialog; all errors behind one notification surface; sass deprecations gone.

**Ordered steps**

4.1 cyber-components changes (separate commit, with tests and `COMPONENT_DIRECTORY.md` updates)
- `container/tabContainer/tabContainer.tsx`: add `onSectionChange?: (id: string) => void` (fired from click, keyboard and dropdown selection - not from the `controlledActiveSection` sync effect, to avoid navigate loops) and `urlSync?: boolean` (default `true`; `false` skips `history.replaceState` and the URL-param read on mount, taking `controlledActiveSection ?? isVisible ?? first`). Update `__tests__`, `README.md`, directory entry.
- `container/modal/confirmationOverlay.tsx`: add `tone?: 'neutral' | 'danger'` (danger: confirm button icon `trash`, `--status-bad` colour, `styles.confirmDanger`); test.
- New `display/emptyState/` (`emptyState.tsx`, `.module.scss`, `index.ts`, `README.md`, `__tests__`): `{ icon?: string; title: ReactNode; description?: ReactNode; action?: ReactNode; parts?: { root, icon, title, description, action }; className }`, tokens only, `role="status"` optional via `ariaLive`. Directory entry under Display.

4.2 Token layer `src/index.css` (rewrite; stays a single global file)
- Remove the two blocking Google Fonts `@import`s; move to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html` (PWA runtime cache already handles offline after first load).
- `:root` light (warm) and `[data-theme="dark"]` blocks that define the **full** CLAUDE.md set: `--page-background-*`, `--bg-*`, `--text-primary/-secondary/-primary-muted/-secondary-muted`, `--surface-base/-raised/-overlay`, `--border-primary/-secondary`, `--interactive-base/-hover/-active/-text`, transient `--status-success/-warning/-error/-info` (+`-bg`), persistent `--status-good/-bad/-disabled` (+`-bg`), utilities, `--max-content-width`, `--content-padding`, `--font-body`, `--font-mono`, plus the 16 nochi shape tokens from `apps/nochi/src/styles/themeTokens.ts` `SHAPE_TOKEN_NAMES` with house values (`--radius-surface: 0.5em`, `--shadow-raised: 0 4px 6px rgba(0,0,0,.1)`, `--heading-prefix: '//'`, etc.).
- A clearly delimited `/* app-derived tokens */` block for names the app needs that the canonical table lacks, each defined in terms of canonical tokens: `--surface-hover`, `--surface-raised-hover`, `--border-hover`, `--focus-ring`, `--status-neutral`, `--scrim`. No other custom names.
- Global: `box-sizing`, body uses `--font-body`, headings use `--heading-transform/-letter-spacing`, `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }`, `@media (prefers-reduced-motion)`; delete the empty reset rule and the typo banner.
- Token sweep across all 49 stylesheets: `--danger` -> `--status-bad`; `--color-primary` -> `--interactive-base`; `--color-text-primary/secondary/tertiary` -> `--text-primary/-secondary/-secondary-muted`; `--color-border` -> `--border-primary`; `--color-bg-secondary` -> `--bg-secondary`; `--color-bg-hover` -> `--surface-hover`; `--color-success/-warning/-danger` -> `--status-*`; `--error-*` -> `--status-error`/`--status-bad`; `--text-muted` -> `--text-primary-muted`; `--text-tertiary` -> `--text-secondary-muted`; `--status-bad-border` -> `--status-bad`; `--status-info-text` -> `--status-info`; `--color-*-rgb` removed (use the `-bg` tokens or `color-mix`). Strip every `var(--x, #hex)` fallback and every `rgba(0,0,0,.1)` shadow (-> `--shadow-raised`), zebra rows (-> `--surface-base`), focus rings (-> `--focus-ring`), scrims (-> `--scrim`), `border-radius` literals (-> `--radius-*`).
- `src/styles/__tests__/tokens.test.ts` (node env, `fs`): every `var(--name)` used under `src/**/*.{scss,css,tsx}` is defined in `index.css`; no hex/rgb(a)/hsl literals outside `index.css` (allowlist: the IPA SVG generator). This is the ratchet that keeps dark mode working.

4.3 Sass cleanup
- Replace `@import '@styles/modal.module.scss'` + `@extend .modalContentTemplate` in the 8 files with the `DialogPanel` component (4.4); delete `src/styles/modal.module.scss` and each file's `.modalContent`. If any shared SCSS remains necessary, `src/styles/_mixins.scss` consumed via `@use '@styles/mixins' as *;` (Vite resolves the alias for sass).
- `components/display/grapheme/detailed/detailed.css` -> `detailed.module.scss` with tokens; update `detailed.tsx`; remove the custom scrollbar rules (use `--scrollbar-thumb`).
- `flex.flexCol` -> `flex.flexColumn` in `GlyphForm.tsx`, `GlyphFormFields.tsx`, `GraphemeFormFields.tsx`, `LexiconFormFields.tsx`, `GlyphEditPage.tsx`.
- `src/styles/graphic_template.module.scss` (app-level template per CLAUDE.md): `.surfaceCard`, `.surfaceRaised`, `.dangerZone`, `.pageSection`, `.menuItem` (the dropdown link style currently inlined in `grapheme/main.tsx` and `exportImport.module.scss`).

4.4 Shared primitives `src/components/shared/` (new; each `<Name>/<Name>.tsx` + `.module.scss` + `__tests__/`)
- `pageHeader/PageHeader.tsx`: `<header>`; optional breadcrumb `<nav aria-label="Breadcrumb"><ol>` of react-router `Link`s (last item `aria-current="page"`); `title` (`as: 'h1'|'h2'`, default `h2`; the conlang name in the shell is the page `h1`), `description`, `actions` slot (right-aligned, wraps), optional `facts` rendered with `QuickFactsRow`, optional `back: { to, label }` (Link + `SvgIcon 'arrow-left'`).
- `emptyState` consumption helper `AppEmptyState` only if app defaults (icon set) are needed; otherwise import `cyber-components/display/emptyState` directly.
- `loadingState/LoadingState.tsx`: `variant: 'page'|'gallery'|'form'|'inline'` built from `Shimmer` blocks; wrapper `role="status" aria-label="Loading ..."`; `inline` uses `DotLoader`.
- `dialogPanel/DialogPanel.tsx`: Modal content surface (`--surface-raised`, `--radius-surface`, `--shadow-overlay`, `width: min(<size>, calc(100vw - 2rem))`), `title` (h2), body, `actions` row; replaces all `.modalContent` blocks.
- `confirmDialog/ConfirmDialogProvider.tsx` + `useConfirm()`: one `useConfirmationDialog()` instance app-wide; `confirm({ title, message, confirmLabel, cancelLabel, tone: 'neutral'|'danger', extra?: ReactNode }) => Promise<boolean>`; renders `Modal isOpen={isVisible} setIsOpen={(o) => !o && onCancel()} allowClose` containing `ConfirmationOverlay frame="inline" tone translationMap={{confirmTitle, confirmMessage, confirmButton, cancelButton}}`. Every delete in the app goes through this and names the entity (`Delete glyph "ka"?`). Also replaces `window.confirm` in `CustomChartsPage`.
- `notifications/NotificationProvider.tsx` + `useNotify()` + `useApiAction()`: queue of notices; head rendered with `NotificationBanner` (`severity`, `title`, `message`, `actions` e.g. Retry/Export, `onDismiss`; success/info `autoHideMs: 2500`, `pauseAutoHideOnHover`); `offsetTop` clears the sticky header. `useApiAction()(fn, { success?: string })` runs an `ApiResponse` call and notifies on `!success` - replaces the 22 `console.error` sites.
- `forms/FormActionBar.tsx`: right `[Cancel][Save]` (`buttonStyles.secondary`/`.primary`), optional left `danger` slot (`buttonStyles.danger`) visually separated; used by every create/edit page and modal.
- `forms/FieldHelp.tsx`: keyboard-reachable help trigger (`<button aria-describedby>` + `HoverToolTip` or an `ExpandableContainer`) replacing the mouse-only `?` icons.

4.5 Apply the live-bug fixes now (they are mechanical once the primitives exist)
- Migrate the 8 delete modals (`LexiconGallery`, `LexiconViewPage`, `graphemeGallery`, `galleryGlyphs`, `GlyphEditPage`, `GraphemeEditPage`, `EditGlyphModal`, `CustomChartsPage`) to `useConfirm()` with danger tone and entity names; the invisible `--danger` buttons disappear with them.
- Wipe confirm in `MainApp` and import-replace confirm in `ExportImportButtons` -> `useConfirm({ tone: 'danger' })`.
- `galleryGlyphs.confirmDelete` refresh bug disappears because it now uses `api.glyph.delete` through the context wrapper.

**cyber-components used**: `Modal`, `ConfirmationOverlay` (+tone), `useConfirmationDialog`, `NotificationBanner`, `Shimmer`, `DotLoader`, `QuickFactsRow`, `SvgIcon`, `Button`/`buttonStyles`, `IconButton`, `EmptyState` (new), `HoverToolTip`/`ExpandableContainer`.

**Tests to add** (happy-dom): `PageHeader.test.tsx` (landmark, breadcrumb `aria-current`, actions render), `ConfirmDialogProvider.test.tsx` (confirm resolves true/false; second confirm supersedes; Escape cancels; danger tone class present), `NotificationProvider.test.tsx` (queue order, auto-hide, `useApiAction` notifies on failure), `DialogPanel.test.tsx`, `tokens.test.ts` (above). cyber-components: `tabContainer` `onSectionChange`/`urlSync` tests, `confirmationOverlay` tone test, `emptyState` test.

**Acceptance**: `tokens.test.ts` passes with an empty allowlist except the SVG generator; toggling `document.documentElement.dataset.theme = 'dark'` in DevTools recolours every page including Translator; all 8 delete flows open the same dialog with the entity name and a visibly red confirm; `pnpm test` in cyber-components green. Lint <= 40.

---

### Phase 5 - App shell and navigation

**Goal**: semantic landmarks, a keyboard/screen-reader accessible primary nav that collapses on phones, header with conlang controls and dark-mode toggle, persistence/health status surfaced, consistent scroll model.

**Ordered steps**

5.1 Routing (`src/App.tsx`, `src/url_mapping.ts`)
- `url_mapping.ts`: add `writingSystem: '/writing-system'`, `translator: '/translator'`, `lexiconEdit: '/lexicon/db/:id/edit'`, `graphemes: '/script-maker'` alias clarity, and `TAB_ROUTES: readonly { id, path, label }[]` (the single source for the nav); `resolveUrl(template, params?)`.
- Route tree: `<Route path={ROUTES.new} element={<NewConlangPage/>}/>` and a layout route `<Route element={<ConlangGuard><AppShell/></ConlangGuard>}>` with `<Route index element={<Navigate to={ROUTES.lexicon} replace/>}/>`, `<Route path="lexicon/*" element={<LexiconMain/>}/>`, `script-maker/*`, `writing-system/*`, `translator/*`. Tab mains keep owning their nested `<Routes>` (unchanged structure inside).
- `ConlangGuard` also renders `LoadingState variant="page"` while `isLoading` and an `EmptyState` with "Export what we could" action when `error` (today an init error renders nothing useful).

5.2 Shell `src/components/shell/` (new; `MainApp.tsx` deleted, `components/background/background.tsx` folded in)
- `AppShell.tsx`: `BackgroundComponent` (full-height, `min-height: 100dvh`, column) > `AppHeader` > `AppNav` (contains `<main>`) > `AppFooter`; `NotificationProvider` and `ConfirmDialogProvider` mount here (and on `NewConlangPage`) - or in `App.tsx` above the routes so `/new` shares them (preferred).
- `AppHeader.tsx`: `BasicHeader` (sticky, `graphic.blurEffectBefore`) with `<h1>{conlangName}</h1>` + rename `IconButton` (`aria-label="Rename conlang"`), `ExportButton`, `ImportButton`, `DarkmodeSwitch` (`themeType="basic"`, `contentPin="bottom-end"`; hide its "Mode" label under 480 px via the documented `[data-toggle-label]` hook), "New conlang" (danger confirm). Collapses to a two-row layout under 640 px.
- `AppNav.tsx`: `TabContainer id="primary-nav" urlSync={false} controlledActiveSection={activeId} onSectionChange={(id) => guardedNavigate(path)} dropdownBelowWidth={480} sections={TAB_ROUTES.map(t => ({ id, toggle: t.label, content: <Outlet/> }))} parts={{ root: { 'aria-label': 'Primary' }, panel: { className: tabContainerBorderStyle ... } }}`; `activeId` derived with `useLocation().pathname` first segment; panel wraps `<BasicBody>` (`<main id="main-content">`) so the skip link and scroll container are standard; `<a class="skipLink" href="#main-content">` first in the header.
- `unsavedChanges/UnsavedChangesRegistry.tsx`: context where edit pages register `isDirty`; `guardedNavigate` asks `useConfirm()` before leaving when dirty (covers tab clicks that bypass `NavigationGuard`'s anchor interception).
- `PersistenceStatus.tsx`: subscribes to `subscribePersistence()` + `getDatabaseHealth()`; footer shows a polite `aria-live` "Saved" / "Saving" / "Unsaved changes" text; errors (`QUOTA`, `UNAVAILABLE`, `WRITE_FAILED`, `restoredFromBackup`, `fkViolations > 0`) raise a persistent `NotificationBanner` with actions `Retry`, `Export JSON`, and `Repair` (calls `databaseApi.repair()`).
- `AppFooter.tsx`: `BasicFooter` with build stamp (`formatBuildStamp()`), author, and the persistence indicator.
- Theme bootstrap in `src/main.tsx` before `createRoot`: `const stored = resolveStoredTheme(); document.documentElement.dataset.theme = (stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))`. `vite.config.ts` PWA `theme_color` switched to the token value; `index.html` gets `<meta name="color-scheme" content="light dark">`.
- Delete `packages/cyber-components/container/tabContainer/routerTabContainer.tsx`, its README/directory mentions (second `(cyber-components)` commit).

5.3 Conlang pages
- `ConlangNameModal` -> `DialogPanel` + `SmartForm` with `LabelShiftTextInput` (the app's first input finally gets a label); `NewConlangPage` -> tokens, `EmptyState`-style hero, no inline styles; "Currently loaded" block uses `QuickFactsRow`.
- `ExportImportButtons`: `ImportJsonModal` textarea labelled, `ImportImageModal` file input labelled; success notice shows the `ImportReport` counts; `useExportImport` failures also notify (the processing modal stays for progress).

**Tests to add** (happy-dom): `AppShell.test.tsx` (renders `header`, `[role=tablist]`, `main#main-content`, `footer`; ArrowRight on the active tab moves focus and calls navigate; dropdown mode under 480 px via mocked `matchMedia`; dirty registry blocks tab navigation until confirmed), `url_mapping.test.ts` (`resolveUrl`, `TAB_ROUTES` paths exist in `ROUTES`), `PersistenceStatus.test.tsx` (error state shows banner with Retry/Export).

**Acceptance** (browser): Tab from the address bar reaches the skip link, then the header controls, then the tablist; Arrow keys switch tabs and the URL updates; at 400 px width the nav is a dropdown and the header wraps without horizontal scroll; DarkmodeSwitch flips the whole app and survives reload (cookie `theme-preference`); DevTools "Offline" + a write -> no banner (IDB), and a throttled quota (Application > Storage) -> banner with Export action. Lint <= 30.

---

### Phase 6 - Lexicon and Translator

**Goal**: one CRUD paradigm (routes for entities), a shared gallery, every state (loading/empty/no-match/error/not-found) handled by the shared primitives, the layout controls wired.

**Ordered steps**

6.1 Gallery decision gate: read `packages/cyber-components/display/dataGallery/README.md` + `types.ts` (props verified: `renderItem`, `keyExtractor`, search with `searchFn`, sort, view toggle, pagination, state slots, `ariaLabel`, keyboard navigation, `selectionMode`-style behaviour must be checked). Go if it supports client-side filtering over an in-memory array and a controlled "selection mode" render (needed by the Punctuation picker); otherwise build `src/components/shared/gallery/` (`GalleryToolbar` with labelled search/select, `useGalleryPaging` with a derived page clamp - no `setState` during render, `GalleryGrid`, `EntityCard` with CSS `:hover`/`:focus-visible`, cyber `Pagination`). Either way `LexiconGallery`, `graphemeGallery`, `galleryGlyphs` collapse onto one implementation with per-entity `renderItem` and the two empty states (`EmptyState` "no words yet" with CTA vs "no match" with clear-filter action).

6.2 Lexicon
- `LexiconHome`: `PageHeader` (title "Lexicon", facts: word count / needs attention, actions: "New word" `IconButton as={Link}`), gallery below; `LexiconMain` loses its inline margin.
- `CreateLexiconPage` and a new `EditLexiconPage` (`ROUTES.lexiconEdit`) share `LexiconEditor` (`mode`, `initialData`), `FormActionBar`, `NavigationGuard active={isDirty}` + registry registration, loading via `LoadingState variant="form"`, errors via `useApiAction`. `LexiconFormFields`: sections reordered (Basic info, Meanings, Spelling, Ancestry) with `NumberedSectionHeader`, help icons -> `FieldHelp`.
- `LexiconViewPage`: view only; `PageHeader back={lexicon} actions=[Edit (Link), Delete (confirm, names lemma and pronunciation consistently)]`; invalid id / not found -> `EmptyState` with back action; `LexiconViewPage.module.scss` trimmed; `EtymologyTree` inline styles -> module, legend via `MiniIconCard`, swatches via tokens; ancestor reorder via `ReorderableList` (position is already persisted) as a small addition inside `AncestryInput`.

6.3 Translator
- `TranslatorHome`: `PageHeader` (title, description); `TranslationControls` rendered and driving `strategy` state (default `'block'`); `EmptyState` before any input; `isTranslating` -> `LoadingState variant="inline"`; failures from `api.phrase.translate` notified.
- `PhraseDisplay`: metadata -> `QuickFactsRow`; warning emoji -> `SvgIcon iconName="exclamation-triangle" color="var(--status-warning)"` with text.
- `ExportDropdown`: toggle is a `<button>` via `DropDownSmall toggleBtn`, emoji -> `SvgIcon`, every failure -> `notify.error`, export background -> `--page-background-primary`.
- `translator.module.scss` rewritten on tokens (the whole file was light-only).

**Tests to add** (happy-dom): `LexiconEditor.test.tsx` (mode switch, dirty registers with the registry), `LexiconViewPage.test.tsx` (not-found EmptyState; delete goes through confirm), `TranslatorHome.test.tsx` (strategy select changes the rendered strategy; empty state; error notify). Extend `GlyphSpellingDisplay.test.tsx` for role-based splitting.

**Acceptance** (browser): create, view, edit (URL `/lexicon/db/:id/edit`), delete a word with confirmation; navigating away from a dirty edit prompts (tab click, browser back, reload); the "no match" state has a clear-filter action; Translator strategy dropdown changes layout live. Lint <= 20.

---

### Phase 7 - Script Maker and Writing System

**Goal**: the same paradigm and primitives applied to graphemes, glyphs, charts, punctuation and writing-system settings.

**Ordered steps**

7.1 Script Maker shell (`tabs/grapheme/main.tsx` -> `tabs/scriptMaker/ScriptMakerShell.tsx` + route files)
- Nested `TabContainer id="script-maker-nav" urlSync={false}` (Graphemes / Glyphs) with `<Outlet/>` panel; active id from `useMatch(ROUTES.glyphs + '/*')`; nested `<Routes>` with a layout route. `GraphemeNav` becomes `PageHeader actions` (New grapheme, View chart `DropDownSmall` whose items use `graphic_template.menuItem` `Link`s, Punctuation); the Glyphs index gets the same treatment.

7.2 One CRUD paradigm
- Routes: `NewGlyphPage` (`ROUTES.glyphCreate`), `GlyphEditPage`, `newGrapheme` (`ROUTES.scriptMakerCreate`), `GraphemeEditPage`; all on a shared `EntityEditLayout` (`PageHeader back`, form, `FormActionBar` with Cancel/Save and a separated danger-zone Delete) and one `entityEditPage.module.scss`; `NavigationGuard` + registry; loading/error via primitives; `newGrapheme` gains Cancel; `NewGlyphPage`/`NewGlyphModal` share `GlyphForm` and stop importing `newGrapheme.module.scss`.
- Modals only for pickers and nested creation: keep `NewGlyphModal` (creating a glyph while composing a grapheme must not discard the grapheme form; remove the 20 ms `setTimeout` by using Modal `onOpen`), delete `EditGlyphModal` (edit links to the route), implement "Select existing glyph" as `GlyphPickerModal` using the gallery's selection mode (the same pattern `PunctuationPage` already uses for graphemes).
- Grapheme delete when used by words: the confirm dialog's `extra` slot explains "used in N words" and offers "Respell and delete" (calls `api.grapheme.delete(id, { respellLexicon: true })`) vs Cancel.
- Glyph order in `GraphemeFormFields` via `ReorderableList` (position already persisted). `autoManageGlyphs` switch: `Switch aria-label` + adjacent text (no dangling `htmlFor`).

7.3 Charts: `ChartPageLayout` (`PageHeader back`, `QuickFactsRow` stats, content, `ExpandableContainer` "About this chart") + one `chartPage.module.scss` replacing the four near-identical TSX skeletons' SCSS; `IPAChartPage`, `SyllabaryChartPage`, `PunctuationPage`, `CustomChartsPage` become thin; loading -> `LoadingState variant="page"`, errors -> `EmptyState` with Retry (`useApiAction`); `CustomChartsPage` create button in header actions, empty -> `EmptyState` CTA; IPA/syllabary tables wrapped in `overflow-x: auto` with `max-width: 100%`; `CreateChartModal` on `DialogPanel`.

7.4 Writing System: drop the single-tab chrome; `GeneralTab` -> `WritingSystemPage` with `PageHeader`; table -> `BasicTable` (`<th scope="col">`, one `<tbody>`), each rule row's `<select>` labelled (`aria-labelledby` the rule-name cell id); change -> `useApiAction(..., { success: 'Rule saved' })` toast; `validateWritingSystem` warnings rendered as an inline `NotificationBanner severity="warning"`; `btt` labels. Punctuation saves get the same toast.

**Tests to add** (happy-dom): `ScriptMakerShell.test.tsx` (nested tablist, glyphs route active), `EntityEditLayout.test.tsx`, `GlyphPickerModal.test.tsx`, `WritingSystemPage.test.tsx` (every select has an accessible name; contradictory combo shows warning), `CustomChartsPage.test.tsx` (delete via confirm, empty CTA).

**Acceptance** (browser): create glyph -> compose grapheme (including "new glyph" nested modal and "select existing") -> use in a word -> attempt grapheme delete shows the respell choice; every chart page shares header/stats/info layout; at 400 px the Script Maker nested nav is a dropdown and charts scroll horizontally inside their container. Lint <= 10.

---

### Phase 8 - Hardening and release

- Lint to zero: remaining `no-explicit-any` (prefer `unknown` + narrowing), unused vars, hooks-rule fixes (`setState` in effects replaced by derived values), `react-refresh/only-export-components` (move constants/types out of component files, e.g. `ROUTES`-style exports).
- Responsiveness sweep at 360/768/1280: modal floors `min(400px, calc(100vw - 2rem))` (now centralised in `DialogPanel`), card grids `repeat(auto-fill, minmax(...))`, header wrap, `--max-content-width` honoured.
- A11y sweep: run `design:accessibility-review` against the five top-level pages; `:focus-visible` on cards/tabs/table controls; heading order (one `h1` in the header, `h2` page titles); all icon-only buttons have `aria-label`.
- `DetailedLexiconDisplay` replacement-character fallback; self-hosted fonts decision (see open decisions); `README.md` architecture/persistence/migrations/settings sections updated; `COMPONENT_DIRECTORY.md` entries for the three package changes and the `RouterTabContainer` removal.
- Final: `pnpm build` and commit `docs/` as `(etymolog): rebuild static docs site`.

**Acceptance**: `pnpm lint` 0 errors; full suite green; Lighthouse a11y >= 95 on `/lexicon`, `/script-maker`, `/translator` via Claude-in-Chrome; the built site at `docs/` boots from an empty origin, imports a JSON export, and survives reload.

---

## 3. Risks and gotchas

1. **sql.js `export()` resets pragmas and kills open transactions** (0.1). Centralise all exports in `exportDatabaseBytes()`; assert `getTransactionDepth() === 0` there; never call `persistDatabase()` inside `withTransaction` bodies (the helper schedules on commit). A test in Phase 1 locks this in.
2. **`PRAGMA foreign_keys` is a no-op inside a transaction**; migrations that rebuild tables must toggle it outside `BEGIN`, and `foreign_key_check` must run after `COMMIT`. `BEGIN` inside `BEGIN` throws in SQLite - the savepoint-based helper is mandatory once services nest (e.g. `createLexicon` -> `addAncestorToLexicon`).
3. **IndexedDB is async; the current API is sync.** `persistDatabase()` keeps a sync signature by scheduling; callers that must know the write landed (`import`, `reset`, `closeDatabase`, the "Export now" banner action) use `persistDatabaseNow()`. On `pagehide` a flush is started but cannot be awaited; with persist-at-commit plus a 300 ms debounce the exposure window is small, and the `previous` slot plus CRC check cover a torn write. `NavigationGuard`'s "Leave" is a full reload, so the `pagehide` flush matters.
4. **StrictMode** double-invokes the provider effect; the `initPromise` guard is the fix, and `EtymologContext.test.tsx` should render under `StrictMode`. `NotificationBanner`/`TabContainer` effects are already idempotent.
5. **happy-dom limitations**: no IndexedDB (inject `memoryAdapter`), `offsetWidth` = 0 (TabContainer never enters arrow mode in tests - assert `role`/keyboard behaviour only), `matchMedia` must be mocked for `DarkmodeSwitch` and dropdown mode, `ResizeObserver` may be missing (guarded in `TabContainer`). DB tests stay in the node environment.
6. **TabContainer URL sync vs react-router**: without `urlSync={false}` the component writes `?primary-nav=lexicon` on every switch and reads it on mount, fighting `BrowserRouter` (and the GitHub-Pages `404.html` redirect in `main.tsx`). The `controlledActiveSection` effect must not fire `onSectionChange` or navigation loops occur.
7. **Next-coupled components** (0.4): do not import `backButton`, `breadcrumb`, `subtleUnderlinedButton`, `langSelector`, `linkListCategory`, `socialIcon` from etymolog; a build would fail resolving `next`.
8. **`style-switcher` is not a theme switch** (0.7): using it for dark mode would mean a wrapper `<div style="--bg-primary: ...">` that cannot restyle `<html>`/`<body>` or portaled overlays. The `[data-theme]` + `DarkmodeSwitch` route is correct; see open decision 3.
9. **Theme cookie is host-only** (`theme-preference`, `path=/`): on `localhost` it is shared with nochi/taxonia dev instances regardless of port (documented in `themeInitSource.ts`) - expected, not a bug.
10. **`vite build` writes to `docs/`**: verify builds, then `git checkout -- docs` before intermediate commits.
11. **FK ON exposes latent data**: existing users may hold orphan rows from the old bugs; migration v6's `repairOrphans` must run before any delete path would otherwise fail with "FOREIGN KEY constraint failed". `importDatabaseFile` must migrate+repair too.
12. **Export envelope stays `EXPORT_SCHEMA_VERSION = 1`**: `role` is runtime-only, removed settings keys are dropped by the validator, closure rows are still exported (ignored on import). Do not bump the version; old files must keep importing.
13. **`lexicon_spelling` UNIQUE(lexicon_id, grapheme_id, position)**: inserting one row per occurrence is legal, but ensure positions are the occurrence index (no two rows with equal triple).
14. **Private-mode browsers** may throw on `indexedDB.open`; the selector must catch and fall back, and `UNAVAILABLE` must be surfaced (not silently localStorage with a 4 MB ceiling) - include the adapter kind in the footer indicator.
15. **No lockfile changes from the worktree**: every step above uses existing dependencies (`dompurify`, `sql.js`, `react-router-dom@6.30`, `motion` via cyber-components). `useBlocker` would require migrating to a data router; not needed with the registry approach.
16. **Performance of full closure rebuilds** on every ancestry edit is fine for thousands of words (single recursive CTE) but runs inside the write transaction; keep the `depth < 50` guard and the self-path assertion.

## 4. Open decisions (defaults recommended)

1. **Primary nav: extend `TabContainer` (`onSectionChange`, `urlSync`) and delete `RouterTabContainer`** rather than adding a11y/responsive code to `RouterTabContainer`. Reason: `TabContainer` already has the tablist a11y, three-mode responsive strip and parts API; duplicating them is the bandaid; a nav component owning `<Routes>` was the architectural wart; etymolog is the only consumer. Package change is ~30 lines plus tests.
2. **`PageHeader`/breadcrumb/back are etymolog-local** (react-router), not cyber-components, because the package versions require Next. `EmptyState` goes into cyber-components (framework-free, useful elsewhere).
3. **Dark mode = `DarkmodeSwitch` + `[data-theme]` tokens; do not use `style-switcher`.** Leave the unused `style-switcher` and `nochi-oauth` dependencies in `package.json` for now (removing them touches the lockfile); flag for a separate main-tree commit.
4. **Persistence**: IndexedDB primary, localStorage fallback, 300 ms trailing debounce, one `previous` slot, `autoSaveInterval` deleted. No `fake-indexeddb` (would add a dependency); adapter injection covers tests.
5. **Import semantics**: replace-all stays (with the danger confirm); validation prunes dangling child rows and reports counts rather than failing the whole import; closure is always rebuilt from `lexicon_ancestry`.
6. **Confirmation UI**: `ConfirmationOverlay frame="inline"` inside `Modal`, with a new `tone="danger"` prop in the package, rather than a bespoke etymolog dialog.
7. **CRUD paradigm**: routes for create/edit/view of glyphs, graphemes, words; modals only for pickers (`GlyphPickerModal`, grapheme picker in Punctuation) and the nested "new glyph while composing a grapheme". `EditGlyphModal` deleted.
8. **Unsaved-changes protection**: cyber `NavigationGuard` (reload/close/anchor/back) plus an app `UnsavedChangesRegistry` consulted by the tab strip's `onSectionChange`; no migration to a data router.
9. **Fonts**: move the Google Fonts `@import`s to `<link>` tags in `index.html` now; self-hosting (binary assets + OFL notice) deferred to a follow-up.
10. **Gallery**: adopt `DataGallery` if the Phase 6.1 gate passes (client-side filtering of in-memory arrays and a selection-mode render); otherwise the shared `gallery/` primitives. Decide at the start of Phase 6, not before.
11. **Settings validation**: hand-written validators (no zod). `glyphStacking` removed; `wordWrap: 'glyph'` implemented; `'btu'` renamed `'btt'` with coercion on load/import.
12. **Commit prefixes**: cyber-components changes land as separate `(cyber-components): ...` commits immediately before the etymolog phase that needs them; everything else `(etymolog): phase N ...`; `docs/` rebuilt only in the final commit.

### Critical Files for Implementation
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\apps\etymolog\src\db\database.ts (connection pragmas, export guard, init guard, persistence wiring, migration extraction)
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\apps\etymolog\src\db\exportImport\jsonCodec.ts (atomic, validated import)
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\apps\etymolog\src\db\lexiconService.ts (named-column mapping, spelling source of truth, transactions, closure maintenance)
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\packages\cyber-components\container\tabContainer\tabContainer.tsx (`onSectionChange` + `urlSync`, prerequisite for the accessible shell)
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\apps\etymolog\src\index.css (complete token layer incl. shape tokens; everything visual depends on it)
- D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega\apps\etymolog\src\db\context\EtymologContext.tsx (refresh matrix, persistence/health state exposure)
---

## 5. Execution log

| Phase | Status | Commit | Tests after |
|---|---|---|---|
| 1 Data safety | DONE | `5588b83` | 417 |
| 2 Data-model integrity | DONE | `e477dc4` | 546 (with 3) |
| 3 Domain logic | DONE | `e477dc4` | 546 |
| 4 Design-system foundation | DONE | `18efa86` | 603 |
| 5 App shell and navigation | DONE (uncommitted) | | 629 |
| 6 Lexicon and Translator | DONE | `f33b18a` | 679 |
| 7 Script Maker and Writing System | DONE (uncommitted) | | 725 |
| 8 Hardening and release | DONE (uncommitted) | | 750 |



Deviations from the plan above, made during execution (the plan text is left as
written; this log is authoritative where they differ):

- `glyphStacking` was removed in Phase 3 (not Phase 3.4's "implement or remove" — removed; it was never read).
- `'btu'` → `'btt'` rename happened in Phase 1 (validator coerces legacy values).
- Closure incremental inserts UPSERT the shortest depth so diamonds match a rebuild (Phase 2 said INSERT OR IGNORE).
- `getAllAncestorIds/getAllDescendantIds(id, maxDepth?)` keep the optional depth limit (closure `depth <= ?`).
- `TranslationControls` was wired in Phase 3 (plan had it in 6.3) because `TranslatorHome` was being edited anyway.
- `EtymologContext` exposes `persistence` and `health` already (plan had this in Phase 5).
- Migration detector returns the version the file is AT (0–5); exactly the pending migrations run. `CURRENT_SCHEMA_VERSION` lives in `src/db/migrations/version.ts`.
- Phase 4 aliased `cyber-components` / `utils-styles` / `utils-func` by relative path in vite/vitest/tsconfig so a worktree resolves its OWN package edits (node_modules there is a junction to the main repo).
- Phase 4 kept `ExportDropdown`'s white export background and `pngFrame.ts` literals (allowlisted in `tokens.test.ts`): pixels baked into downloaded files must not follow the reader's theme. Plan 6.3's "export background → `--page-background-primary`" is therefore WRONG and must not be applied.
- Phase 6.1 gate (decided 2026-08-22): the three galleries already use cyber `DataGallery` (presentation-only; parent owns search/sort/page state). Adopt it — build ONE etymolog `useGalleryState` hook (query, filter, sort, page with a derived clamp — no setState during render) + `EntityGallery` wrapper (toolbar, the two empty states, selection mode via `renderItem`) + `EntityCard` (CSS `:hover`/`:focus-visible`, no nested buttons). Do not build a second gallery.

Phase 4 deviations:

- `vite.config.ts` / `vitest.config.ts` / `tsconfig.app.json` now alias `cyber-components`, `utils-styles` and `utils-func` to `../../packages/<name>`. Not in the plan, but REQUIRED: in a worktree those `node_modules` entries are junctions to the MAIN repo, so 4.1's package edits were invisible to this app's own dev server, build and typecheck (the `tone` prop failed to typecheck for exactly this reason).
- `index.css` also gives `input` / `textarea` / `select` an explicit token background. The plan's `<meta name="color-scheme" content="light dark">` makes the UA paint undeclared controls with its own dark chrome, which does not follow `[data-theme]` — the translator textarea and the writing-system selects declared only a border and went grey.
- The ratchet test reads sources with `node:fs` behind an explicit `/// <reference types="node" />`, NOT `import.meta.glob(..., '?raw')`: vitest stubs every `*.module.*` stylesheet to an empty object before the raw query is honoured, so the glob silently skipped ~45 of the ~50 stylesheets and the ratchet passed while checking almost nothing.
- The ratchet allows a custom property DECLARED in the same file it is used in (DialogPanel's `--dialog-panel-width`), and allowlists `db/exportImport/pngFrame.ts` (canvas pixels baked into a downloaded file — must NOT follow the reader's theme) plus one SVG test fixture.
- `ConfirmDialogProvider` / `NotificationProvider` each split their context + hooks into a sibling `.ts` module, so the `.tsx` exports only a component (`react-refresh/only-export-components`, and a real HMR state-loss bug behind it).
- The `EditGlyphModal` delete was an INLINE confirmation that replaced the modal's whole body; it now goes through `useConfirm()` like the other eight, so the form is never destroyed by the question.
- `galleryGlyphs` keeps `api.glyph.cascadeDelete` (not `delete`): the context wrapper already refreshes it via `afterAll`, which is what fixes the missing-refresh bug, and cascade is the correct semantic for a glyph whose graphemes go with it.

Phase 5 deviations:

- **`TabContainer` gained FULLY-CONTROLLED semantics** (package change, not in the plan, but required): with BOTH `controlledActiveSection` and `onSectionChange`, a user selection now only REPORTS intent — `showSection` is not called optimistically. Without it, a refused navigation (the unsaved-changes prompt answered "stay") left the strip pointing at one tab while the panel showed another AND remounted the panel, destroying the very form the prompt was protecting. Consumers passing `controlledActiveSection` ALONE (taxonia's map panel) keep the old optimistic behaviour — they have nobody to accept the change, so a strict reading would freeze their strip. Three tests in `tabContainer.control.test.tsx`.
- **`BackgroundComponent` gained `as?: 'main' | 'div' | 'section'`** (default `'main'`, every existing consumer unchanged). It renders a `<main>`, and the shell contains another one via `BasicBody`; nested `<main>` is invalid and gives assistive tech two "main content" landmarks. `AppBackground` passes `as="div"`.
- `activeTabId(pathname)` lives in `url_mapping.ts`, not in `AppNav.tsx` — a non-component export in a `.tsx` trips `react-refresh/only-export-components`, and it is route logic anyway (tested in `src/__tests__/url_mapping.test.ts`).
- The header's rename and New-conlang actions call `confirmDiscard()` (the registry primitive `guardedNavigate` is built on) rather than `guardedNavigate` itself: rename opens a modal instead of navigating, and the wipe must ask about unsaved edits BEFORE it destroys the database, not after.
- `NewConlangPage`'s hero is hand-built rather than cyber `EmptyState`: `EmptyState` renders its title as a `<p>`, and `/new` is a standalone page that needs a real `<h1>`. It uses `QuickFactsRow` for "currently loaded" as planned.
- Two banner surfaces, two offsets: the persistent `ShellStatusBanner` sits at `SHELL_BANNER_OFFSET_TOP` = 73 (57px header + 16px gutter) and the transient toast queue keeps `NotificationProvider`'s default 16. Both are `position: fixed` and horizontally centred, so a shared offset would stack a storage error under a "saved" toast.
- The dead `.toggleContainer` rule went with `routerTabContainer.tsx` (it was that component's strip — the `overflow-x: hidden` the audit blamed for clipped tabs on phones).
- Known cosmetic consequence of the ARIA tab pattern: on a tab switch, `AnimatePresence` crossfades the old and new panels for 300 ms, so there are briefly TWO `<main id="main-content">` nodes. Unavoidable while the panel owns the content; it resolves as soon as the exit finishes. (In a hidden browser pane rAF is frozen, so the exits never complete and the copies accumulate — an environment artifact, not a leak.)

Phase 6 deviations:

- **`EntityGallery` does NOT forward `onItemActivate` to `DataGallery`.** The
  gridcell wrapper's own `onClick` calls that callback, so a card that is itself
  a `<Link>`/`<button>` plus a forwarded `onItemActivate` fires TWICE per click
  (double navigation; double `onSelect` in a picker). The CARD owns activation;
  `DataGallery` keeps only the roving-arrow keyboard navigation. `EntityGallery`
  exposes its own `onItemActivate` prop for cards that have no `itemHref` — it is
  wired to `EntityCard`, not to the gallery.
- **`import NavigationGuard from 'cyber-components/container/navigationGuard'`
  is `undefined` at runtime.** That index re-exports the component by NAME only;
  the default import typechecks cleanly under `allowSyntheticDefaultImports` and
  then blows up as "Element type is invalid". Import it by name. Phase 7 will hit
  the same trap on the other edit pages.
- **A `forwardRef` render function must declare TWO parameters even when the ref
  is unused.** Deleting the unused second parameter to satisfy
  `@typescript-eslint/no-unused-vars` makes React warn "forwardRef render
  functions accept exactly two parameters" on every mount. `AncestryInput` and
  `MeaningTableInput` keep `_ref` behind an `eslint-disable-next-line`.
- `NumberedSectionHeader` hardcodes an `<h2>`. Under `PageHeader as="h2"` the
  form sections need level 3, so they pass
  `parts={{ title: { id, 'aria-level': 3 } }}` and the `<section>` carries
  `aria-labelledby`. Phase 7 should do the same on the grapheme/glyph forms.
- `EtymologyTree` no longer renders its own "no etymology data" branch — it
  returns `null` and the CALLER renders an `EmptyState` with an "Add ancestors"
  action, because the view page is the one place that can fix an empty tree.
  Ancestry colours moved out of two duplicated inline-style maps into
  `ancestryTypeStyles.ts` + `--ancestry-color` modifier classes.
- The lexicon's display name is now ONE rule (`lexiconIdentity.ts`,
  `lexiconDisplayName` = pronunciation else lemma), imported by the page title,
  the delete confirmation, the gallery card label and the tree nodes. They
  previously disagreed.
- `settings.defaultGalleryView` is finally honoured (it is `useGalleryState`'s
  default `viewMode`; the legacy `'expanded'` value maps to `'detailed'`). All
  three galleries used to hardcode their own default and ignore the setting.
- Lint went 62 → 51 errors, not to the ≤40 target: the remaining errors are
  concentrated in Phase 7 files (`glyphForm` ×6, `newGlyph`/`newGrapheme` ×4,
  `insertionStrategies` ×4, `pronunciationTableInput` ×4, the chart pages) and in
  `EtymologContext` (×5 `react-refresh/only-export-components`, fixable by the
  same context/hooks split Phase 4 applied to the two providers). Phase 7 should
  clear its own; Phase 8 takes the rest to zero.

Phase 7 deviations:

- **`SvgDrawer` gained `colors` + `defaultColor`** (cyber-components) and
  `SvgDrawerInput` forwards them (smart-form). There was no existing way to
  restrict the palette; etymolog passes a SINGLE entry (`GLYPH_INK`,
  `currentColor`), and the drawer renders no colour picker at all for a
  one-entry palette. The stroke-width slider also gained
  `aria-label="Stroke width"` — it announced as a bare "2".
- **`smart-form` is now ALIASED like the other three packages** in
  `vite.config.ts` / `vitest.config.ts` / `tsconfig.app.json`. Without it the
  `SvgDrawerInput` change above would have been invisible to this app (the
  worktree's `node_modules/smart-form` is a junction to the MAIN repo) — the
  exact trap the Phase 4 deviation documents. Side effect: `tsc` now reports
  smart-form's own pre-existing errors, which the `grep -v packages/` filter
  drops like cyber-components'.
- **`normalizeGlyphSvg` rewrites EVERY paint to `currentColor` on save**, not
  just black/white: a script glyph is one colour, and the stored value cannot
  follow a theme otherwise. `none`, `transparent` and `url(#…)` are left alone —
  they are not colours. Its fixture file is allowlisted in `tokens.test.ts`.
- **The pages own the `useSmartForm`, not the form components.** `EntityEditLayout`
  renders the shared `FormActionBar` (so the danger separation is guaranteed in
  ONE place) and hands it to the page as a render-prop child to place inside its
  `<SmartForm>`; the page therefore knows `isSubmittable`. Submission itself is
  shared through `useGlyphSubmit` / `useGraphemeSubmit`, so "what saving means"
  is defined once across the page, the edit page and the nested-create modal.
- **`PronunciationTableInput` was UNSUBMITTABLE.** Its validation effect's only
  reactive trigger is `selfFormProps.formState.isValid`, and its inner field had
  no validator, so that boolean never changed and the outer field stayed
  "Invalid entries" forever — the grapheme form's submit button was disabled no
  matter what was typed, and only unstuck if a row was added or removed. Fixed
  by giving the row a required validator (which is what `MeaningTableInput` has,
  and why it never showed the bug). Found by driving the real form in a browser.
- **`eslint.config.js` gained `argsIgnorePattern: '^_'`** (and siblings) plus a
  `react-refresh/only-export-components` off-switch for `__tests__`. `_name`
  means "required by the signature, deliberately unused" — an interface method's
  parameter, a `forwardRef` render function's second parameter (React WARNS if
  it is dropped) — and the alternative is a `disable-next-line` on each one,
  which hides real unused variables among the exemptions.
- `main.tsx` was NOT renamed to `scriptMaker/ScriptMakerShell.tsx` (the plan
  called it preferred, not required): the rename touches every import of the
  Script Maker area for no behavioural gain, and Phase 8 has the lint sweep that
  would collide with it.
- **KNOWN, NOT FIXED (Phase 8):** `useDrawing`'s notify effect is gated on
  `initializedRef`, which is only set when an INITIAL value was loaded — so
  `onChange` never fires for a glyph drawn from scratch. Submission is
  unaffected (SmartForm reads the drawer's imperative `value` getter), but the
  field's `isChanged` never flips, so a drawing-only edit is not seen by the
  unsaved-changes guard. The naive fix fires `onChange` with an empty canvas on
  mount and makes every freshly-opened create form report itself dirty.

## 6. Pitfalls for implementing agents (read before touching code)

Repo-wide rules that bite:

1. **Worktree only.** All edits in `D:\Coding\Javascript\greatest-Monorepo\.claude\worktrees\omega`. Never `pnpm install` there (frozen-lockfile only), never `git add -A` (stage by path), never `rm -rf` anything under `.claude/worktrees`.
2. **`vite build` writes into `apps/etymolog/docs/`** (the committed static site). Build to verify, then `git checkout -- apps/etymolog/docs` and delete the new untracked `docs/assets/*` / `docs/workbox-*.js` files by name. Do not commit `docs/` until Phase 8.
3. **`tsc -b` never reaches etymolog** — `packages/smart-form` fails first on `process` typings. Typecheck with `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v packages/`. There are ~21 PRE-EXISTING errors (InteractiveGlyphDisplay, compression.ts, pngFrame.ts, setup.ts, useViewport, CustomChartCard, Import*Modal, ExportImportButtons, phraseService.test, jsonCodec.test). Capture the baseline before starting; add none.
4. **Lint baseline is 68 errors / 5 warnings** (`npx eslint .`). Each phase must not raise it; Phase 8 takes it to zero.
5. **Tests**: `npx vitest run` (node env; component tests opt into happy-dom with `// @vitest-environment happy-dom` at the top of the file). 546 passing. No IndexedDB in either env — inject `createMemoryAdapter()` via `configurePersistence`. `setup.ts` sets `__ETYMOLOG_ALLOW_UNSANITIZED_SVG__`; a happy-dom test file must set it itself (see `EtymologContext.test.tsx`). React 18.3: `act` comes from `react-dom/test-utils`, not `react`.
6. **sql.js `export()` reopens the connection** — only `exportDatabaseBytes()` may call it; never inside `withTransaction`.
7. **Persistence is debounced (300 ms)**. Nothing needs to call `persistDatabase()` after a service call any more; `withTransaction` schedules it on commit. `persistDatabaseNow()` for must-land paths.
8. **Dev servers**: `omega-etymolog` launch config → `http://localhost:5174/etymolog/` (note the `/etymolog/` base). The main-tree server is on 5173 and runs master, not the worktree. localStorage/IndexedDB are per origin, so 5173 and 5174 have separate data.
9. **cyber-components that import Next.js are unusable here**: `interactable/buttons/backButton`, `interactable/navigation/breadcrumb`, `buttons/subtleUnderlinedButton`, `nav/linkListCategory`, `settings/langSelector`, `socials/socialIcon`. Build etymolog-local equivalents on react-router `Link`.
10. **`TabContainer` controlled mode has no change callback and writes `?id=` to the URL** — Phase 4.1 adds `onSectionChange` + `urlSync={false}`; Phase 5 depends on it. Do not fire `onSectionChange` from the `controlledActiveSection` sync effect (navigation loop).
11. **`ConfirmationOverlay`** uses `IconButton`s with fixed `x-lg` / `check-lg` icons and has no danger tone until Phase 4.1 adds `tone="danger"`.
12. **CSS tokens**: only semantic names from CLAUDE.md + the 16 shape tokens + the small app-derived block in `index.css`. ~22 names used today are UNDEFINED (see `audit/etymolog-ui-audit.md` §C1) and `var(--x, #hex)` fallbacks hide it — strip every fallback. `flex.flexCol` does not exist in `utils-styles` (it is `flexColumn`).
13. **Sass**: `@import '@styles/modal.module.scss'` is deprecated; the `@styles` alias is configured in `vite.config.ts` for `@use` too.
14. **Forms**: SmartForm (`packages/smart-form`) for every form; `disabled={!formState.isSubmittable}` on submit; nested SmartForms need the modal form to stop propagation (already handled in `useSmartForm`). The SmartForm submit button is NOT reachable through the a11y-tree reader in the Browser pane (it truncates after the meaning table) — in browser checks locate it with `javascript_tool` and click by coordinates or `.click()`.
15. **Settings**: `api.settings.update()` is STRICT — an unknown key or bad enum value rejects the whole update with VALIDATION_ERROR. Always spread the current nested object (`{ writingSystem: { ...settings.writingSystem, wordWrap } }`).
16. **Deleting a grapheme used by words** returns `CONSTRAINT_VIOLATION` with `details.lexiconCount`; pass `{ respellLexicon: true }` to proceed (Phase 7 UI). `api.grapheme.getLexiconUsage(id)` lists the words.
17. **Browser pane screenshots time out when the pane is hidden** — verify with `read_page`, `get_page_text`, `javascript_tool`, console/network readers instead.


## 7. Phase 8 deviations

- **`EtymologContext.tsx` was RENAMED to `EtymologProvider.tsx`.** The plan's
  split (context + hooks into `etymologContext.ts`, provider left behind) is
  impossible as written on Windows: TypeScript resolves `./EtymologContext` to
  `EtymologContext.ts` before trying `.tsx`, and on a case-insensitive
  filesystem that matches `etymologContext.ts` — producing TS1149/TS1261 "differs
  only in casing" and a broken barrel. Renaming the provider file to what it now
  exclusively contains removes the collision and reads better. `src/db/context/index.ts`
  re-exports both, so the only importers that changed are the two files that
  reached past the barrel.
- **`GlyphCanvasInput.test.tsx` was rewritten, not just un-`@ts-nocheck`ed.** It
  held three empty `describe.skip` placeholders waiting for
  `@testing-library/react` (which cannot be added from a worktree). Deleting the
  directive alone would have left a file that tests nothing; it now covers the
  insertion strategies and the renderable normalisation the placeholders
  described — 10 real tests, no DOM needed.
- **`useViewport` OWNS the SVG ref.** The plan said "implement `getSvgElement`
  on the viewport ref"; the honest way to do that was to move `svgRef` into the
  hook so `refMethods` satisfies the whole `GlyphSpellingDisplayRef` contract in
  one place, instead of `InteractiveGlyphDisplay` assembling a second partial ref
  object on top of it.
- **Buffer types were NARROWED, not cast.** `compression.ts` / `pngFrame.ts` /
  `pixelCodec.ts` / `imageCodec.ts` now declare `Uint8Array<ArrayBuffer>` and
  `Uint8ClampedArray<ArrayBuffer>` along the whole export/import chain. Every
  buffer on that path is locally allocated and can never be a `SharedArrayBuffer`,
  so the narrow type is the true one; `new Uint8Array(x.buffer as ArrayBuffer)`
  would have been a cast hiding the same fact.
- **`ExportImportButtons` uses `IconButton as="span"` inside the real toggle
  button**, rather than dropping `IconButton`. `DropDownSmall` BUILDS the toggle
  element itself, so the fix is to stop suppressing it with `toggleBtnAs="div"`;
  rendering the IconButton as a span keeps the header's button styling without
  nesting an interactive element inside an interactive element.
- **`useDrawing`'s dirty flag is "did the USER change it", not a `dirtyRef` set
  by each action type.** Every mutation routes through one `setElements` wrapper
  (15 call sites) plus wrapped `undo` / `redo` / `clear`; `setSvgContent` CLEARS
  the flag, because a parent replacing the content is a new baseline and echoing
  it back would risk a `value → onChange → value` loop. Side effect worth
  noting: the old gate ALSO fired `onChange` immediately after an initial value
  loaded (the re-serialised SVG never matches the stored string byte for byte),
  so every glyph EDIT form reported itself dirty on mount. That is fixed too.
- **Three responsiveness fixes landed in the PACKAGES, not the app**, because
  the causes were there:
  1. `TabContainer`'s animated panel is a CSS grid with no `minmax(0, 1fr)` and
     no `min-width: 0` on the item, so a grid item's min-content automatic
     minimum pushed the panel and every ancestor past the viewport (675px inside
     a 360px window on the punctuation page). This was the single root cause of
     nearly every narrow-viewport overflow in the app.
  2. `DataGallery`'s `.toolbarRight` was one unbreakable ~460px flex line.
  3. `SvgDrawer`'s `.container` was `width: fit-content` around a fixed 300px
     canvas with no cap. Only the app-side half (the `sizing.fitContent` wrapper
     in `GlyphFormFields`) was etymolog's.
- **A CONTRAST ratchet was added to `tokens.test.ts`** (invariant 4) rather than
  fixing the two tokens the plan named and moving on. It parses `index.css`,
  composites the translucent surfaces over the page background the way a browser
  does, and fails if any text token drops below 4.5:1 on any background in either
  theme. That turned a two-token fix into a six-token one — the whole light
  transient status family was between 2.08:1 and 3.46:1 while carrying small
  text — and makes the two deliberate exemptions (`--status-good`,
  `--status-disabled`; see `todo.md`) explicit.
- **`prefers-reduced-motion` needed a motion/react fix, not CSS.** The app's
  global `@media (prefers-reduced-motion: reduce)` block zeroes CSS
  `transition-duration`, which cannot touch the tab crossfade or the notification
  banner — both animate through inline styles updated per frame. Both components
  now consult `useReducedMotion()`. The media query cannot be emulated in the
  Browser pane, so this half is code-reviewed, not live-verified (`todo.md`).
- **The `DataGallery` view-toggle `aria-label` work was added mid-phase** on the
  coordinator's note; it is a package change with its own tests, and it uses the
  component's existing per-string prop convention (`searchPlaceholder`,
  `filterButtonLabel`, `sortLabel`) rather than introducing a `translationMap`.
- **Claude-in-Chrome was still unreachable**, so 8.4 and 8.5 were measured in
  the in-app Browser pane with `javascript_tool`: element boxes, `scrollWidth`
  vs `innerWidth`, computed styles, and a walk of `document.styleSheets` to prove
  which focus rules actually reached the document. Screenshots remain impossible;
  `todo.md` records what a human should still look at.

### Final fresh-eyes review (2026-08-22, after Phase 8)

An independent read-only review of the full diff found no regressions versus master and no
cross-app breakage. Its defects were fixed in the release commit:

- A1 localStorage fallback could never save again past half the quota (rotation needs 2× the
  payload): `save()` now drops the `previous` slot and retries before reporting QUOTA.
- A2 the shell banner's dismissal silenced a repeated storage error for the session: dismissal
  is now keyed by condition + last successful save / violation count, and the provider
  re-samples `health` after `repair()` and `import()`.
- A3 an imported word whose `glyph_order` named a missing grapheme became uneditable (FK on the
  spelling resync): `validateExportData` rewrites such entries to `?` and flags the word.
- D1 error/warning toasts auto-hide after 8 s (a sticky head wedged the queue); D3 a failed
  COMMIT rolls back instead of leaving depth 0 on an open transaction; D4 a malformed virtual
  glyph becomes a field error, not an unmounted app; D5 `repairOrphans` resyncs
  `lexicon_spelling`; D6 editing a word can change Native/Auto-spell; D7 respelling keeps an
  existing review flag; D8 `reorderGraphemeGlyphs` works by junction row; D11 no `await` inside
  the IndexedDB transaction; D12 `closeDatabase` detaches the scheduler, the wipe checks
  `reset()`'s result, `extractSvgInner` finds `</svg>` without a lower-cased shadow string.
- Known and documented, not changed: `pagehide` cannot await an IndexedDB write (the
  `visibilitychange` flush covers the common case); `layoutUtils.ts` is an adapter over the
  shared linear strategies rather than deleted; `activeTabId` highlights the first tab for
  unknown paths.

