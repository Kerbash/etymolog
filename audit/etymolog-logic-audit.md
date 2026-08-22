# Etymolog data/logic audit (2026-08-21)

## (A) Confirmed bugs
A1 FKs never enforced: database.ts:86 `PRAGMA foreign_keys=ON` only in createTables(); on load (:54 new SQL.Database(bytes)) no pragma → all ON DELETE CASCADE/RESTRICT/SET NULL dead. lexicon_ancestry.ancestor_id is NOT NULL + ON DELETE SET NULL (:234,238) contradictory. Test lexiconService.test.ts:466 documents bypass.
A2 getAncestorsByLexiconId (lexiconService.ts:669-687) / getDescendantsByLexiconId (:696-713) select columns in a different order than mapRowToLexicon (:990) expects (idx 8 glyph_order, 9 needs_attention, 10 created_at, 11 updated_at) → ancestor.glyph_order=datetime string → [] ; created_at=position; updated_at='derived'/undefined. Ancestor spellings never render.
A3 api.lexicon.updateSpelling (lexiconApi.ts:364) & applyAutoSpelling (:541) call setLexiconSpelling (lexiconService.ts:622) which writes only lexicon_spelling, never lexicon.glyph_order (source of truth read by getLexiconComplete :253 / getAllLexiconComplete :306 via buildSpellingDisplay). No-ops; next updateLexicon wipes junction via syncLexiconSpellingFromGlyphOrder.
A4 Failed import destroys data: jsonCodec.ts:195 resetDatabase() (drops + persists empty, database.ts:718-719) BEFORE the insert transaction (:204). parseAndValidateJson (:138) validates only magic/version/table keys, not row shapes. Malformed row → throw → ROLLBACK to empty → conlang gone.
A5 Import writes settings straight to localStorage (jsonCodec.ts:273); settingsApi in-memory currentSettings/isInitialized (settingsApi.ts:22-23,83-87) untouched; no listener notify; useExportImport.ts:75,101 refresh() is DB only → header name/writing system/punctuation stale until reload.
A6 settingsApi.reset() (settingsApi.ts:130) never calls notifySettingsListeners (only update is wrapped :182-192 via monkey-patch) → context settings stale.
A7 Translator word boundaries in wrong index space: TranslatorHome.tsx:41-48 builds wordBoundaries/lineBreaks as indices into combinedSpelling (1/entry) but composedBlockStrategy.splitIntoWords (:63) indexes normalized RenderableGlyph[] where each grapheme expands to N glyphs (normalization.ts:129-131). Multi-glyph graphemes shift all later breaks.
A8 TranslatorHome.tsx:45 detects separators by `entry.type==='ipa' && ipaCharacter===' '`; configured wordSeparator grapheme emits type 'grapheme' (phraseService.ts:172-183) → zero boundaries → wordBoundaries undefined → whole phrase one word.
A9 phraseService.ts:127-143 autospell branch: ipaCharacter = originalWord[index] uses entry index not char offset (multi-char phoneme match shifts tail); non-virtual branch always type 'ipa' → matched real graphemes never rendered as graphemes.
A10 handleGraphemeDeletion (lexiconService.ts:1154) dead — graphemeApi.delete (:308) → serviceDeleteGrapheme throws when used (graphemeService.ts:289). Respell/needs_attention machinery unreachable.
A11 combineSvgStrings (glyphCanvasInput/utils/graphemeUtils.ts:50-64) ignores source viewBox (virtual 0 0 48 48, display 0 0 100 100) → re-emits in viewBox 0 0 W 24 with translate(i*26) → ~4× overscale/overlap; non-greedy regex breaks nested svg; style class collisions.
A12 Two divergent virtual-glyph ID hashes: normalization.ts:16 vs virtualGlyphUtils.ts:26-51 → different IDs for same IPA char.
A13 GlyphCanvasInput.tsx:260-273 buildGlyphOrder: unknown negative id → createGraphemeEntry → "grapheme--259831" → extractGraphemeId rejects (spellingUtils.ts:106) → parsed as IPA literal text. isVirtualGlyphId (virtualGlyphUtils.ts:67) unused as guard.
A14 deleteLexicon (lexiconService.ts:501-523) never cleans lexicon_ancestry_closure / rebuildClosureTable → ghost descendants (getAllDescendantIds :933-940) + false-positive cycle blocks.
A15 setLexiconAncestry (:781-802) no cycle check (addAncestorToLexicon :747 has one); closure rebuild only depth<50 failsafe (closureService.ts:132).
A16 forceDeleteGlyph (glyphService.ts:276-296) can leave graphemes with zero glyphs (createGrapheme enforces ≥1 at graphemeService.ts:43).
A17 cascadeDeleteGlyph (glyphService.ts:304-341) raw DELETE FROM graphemes bypasses lexicon guard (graphemeService.ts:285-290); wired via useGlyphs.cascadeRemove / glyphApi.cascadeDelete → orphan lexicon_spelling + dangling "grapheme-N" in glyph_order.
A18 syncLexiconSpellingFromGlyphOrder (:1014-1047) dedupes + renumbers positions; errors swallowed in loop (:1042-1045).
A19 strategies/index.ts:37 'composed-block': blockStrategy → when writingSystem absent (GlyphSpellingDisplay.tsx:141) direction silently ignored.

## (B) Fragilities
B1 Persistence: persistDatabase (database.ts:576-597) called synchronously 34× across services (glyph 6, grapheme 11, lexicon 10, closure 2, database 5); no debounce; full db.export + byte loop + btoa each time; createGrapheme w/ 3 glyphs + 2 phonemes = 7 serializations; addClosurePaths persists per edge; removeClosurePaths = full rebuild + persist. No size limit; QuotaExceededError swallowed (:594) → silent death ~3.7MB. autoSaveInterval setting never read. Not IndexedDB despite claims.
B2 Migrations: README:601-605 wrong. v2→v3 ALTER preserves; "v1" branch (:313-319) createTables IF NOT EXISTS leaves old tables unreachable; storage key etymolog_db_v3 (:22) so v1/v2 only reachable via importDatabaseFile. No user_version; v4 backfill loop (:468-488) untransacted.
B3 CRC mismatch on load only warns (:47-51), loads anyway; no backup slot.
B4 initDatabase (:28-73) no in-flight promise guard; StrictMode + useGlyphs:118/useGraphemes:148/useDatabase:294 each call it → double Database construction, first instance's writes lost.
B5 Every mutation → full refresh() (EtymologContext.tsx:226,255-311): getAllGraphemesComplete 1+2N queries; getAllLexiconComplete 1+N×3 + buildSpellingDisplay one SELECT per character (lexiconService.ts:1067-1070).
B6 refreshGlyphs (:185) only applies on success; failures swallowed, no error surfaced.
B7 useGlyphs/useGraphemes deprecated but exported, own state, raw service imports.
B8 settingsApi.loadSettingsFromStorage (:52-67) shallow merge → missing nested keys undefined; writingSystem:null crashes composedBlockStrategy.ts:132. Only validation autoSaveInterval<0 (:105). DEFAULT_SETTINGS.punctuation shallow copy (api/types.ts:249) shares PunctuationConfig refs.
B9 README:677-684 wrong: settings DO travel in JSON/PNG export (jsonCodec.ts:88-105, :273) but NOT sqlite export (databaseApi.ts:65) / importDatabaseFile.
B10 API inconsistencies: updateGrapheme (graphemeService.ts:241-276) validates nothing; createLexicon lemma NULL path; return shapes {items,total} vs bare arrays vs entries/glyphs/graphemes; CONSTRAINT_VIOLATION only via string match (lexiconApi.ts:368,410) — can't happen; databaseApi.export('json') returns 'not yet implemented' (:63) though exportService exists; subscribeToSettings side channel.
B11 closureService.removeClosurePaths (:87) ignores params, full rebuild; :88-107 first-person design-debate comment; addClosurePaths empty catch (:29-31).
B12 getFullAncestryTree (lexiconService.ts:857-893) shared visited set across siblings → diamond ancestry renders wrong; depth bail indistinguishable from root. getAllDescendantIds (:929) closure-empty vs broken ambiguous.
B13 No transactions: createGrapheme (graphemeService.ts:39-84), setGraphemeGlyphs (:428), deleteGrapheme (:281), createLexicon (lexiconService.ts:98), updateLexicon (:398), deleteLexicon (:501), setLexiconSpelling/setLexiconAncestry, cleanupOrphanedGlyphs (glyphService.ts:376). Only forceDeleteGlyph, cascadeDeleteGlyph, importExportData use them.
B14 SQL injection: none found; ? binding everywhere; jsonCodec whitelists columns (:41-51). glyphService.ts:228 id.toString() type lie.
B15 Layout engine: glyphStacking never read; wordWrap:'glyph' == 'word' (composedBlockStrategy.ts:170); contradictory direction combos (wordOrder ltr + lineProgression ltr) pile lines (:238-249); rules/types.ts:18 key bare string; 'btu' (api/types.ts:207, composedBlockStrategy) vs 'btt' (LayoutStrategyType, linearStrategy, layoutUtils); layoutUtils.ts duplicates linearStrategy.ts; graphemeUtils:131-132 fabricates dates.
B16 boustrophedonStrategy.ts:48-50 magic 5/row; emptyBounds (bounds.ts:14-23) vs calculateBounds padding convention mismatch.

## (C) Data-integrity risks
C1 FK off. C2 orphan glyph_order refs via cascadeDeleteGlyph. C3 orphan lexicon_spelling. C4 zero-glyph graphemes. C5 stale closure after deleteLexicon. C6 cycles via setLexiconAncestry. C7 glyph_order vs lexicon_spelling divergence. C8 quota silent. C9 CRC loads anyway. C10 failed import = loss. C11 stale closure exported verbatim, never rebuilt on import (jsonCodec.ts:206-228). C12 import columns from rows[0] only (:212). C13 unvalidated settings on import. C14 clearDatabase vs resetDatabase differ (database.ts:684,705), neither transactional. C15 half-written mutations persisted. C16 virtual glyph id hash%1e6 collisions.

## (D) Missing tests
persistDatabase/quota; migrations (zero); importDatabaseFile; failed-import recovery; closureService direct; ancestor field mapping; updateSpelling/applyAutoSpelling visible effect; settingsApi (no file); EtymologContext (no file); composedBlockStrategy (no file; 16 direction combos, wrap, baseline); normalization/detectInputType; combineSvgStrings; translateWord autospell chars; createPunctuationEntry (0 tests, 0 callers); sanitize.ts (Node fallback returns UNSANITIZED :35 → XSS invisible in CI); orphan/cascade scenarios; pngFrame; idempotency.

## (E) Top 15 repairs
1 Non-destructive import (snapshot bytes, validate rows/types before touching DB, restore on failure, persist only after COMMIT) — jsonCodec.ts:193-274.
2 Persistence rebuild: debounce (~500ms trailing + flush on beforeunload/visibilitychange), IndexedDB blob w/ localStorage fallback, size check + QuotaExceeded surfaced, previous-good snapshot; wire or delete autoSaveInterval.
3 PRAGMA foreign_keys=ON after every new SQL.Database (:54,:62,:67,:648); fix ancestor_id NOT NULL+SET NULL → CASCADE; dedupe manual cascades.
4 Fix ancestor/descendant mapping (named-column mapper).
5 One source of truth for spelling: setLexiconSpelling/applyAutoSpelling write glyph_order, derive junction (keep dupes/positions) or delete the methods.
6 Transactions around multi-statement writes; persist once at op boundary.
7 Closure maintenance: clean in deleteLexicon + rebuild; cycle guard in setLexiconAncestry; rebuild closure from lexicon_ancestry on import.
8 initDatabase in-flight promise; delete useGlyphs/useGraphemes.
9 Translator boundaries in glyph space + semantic separator flag.
10 translateWord autospell: track consumed span, emit type 'grapheme' for real matches; punctuation stripping + createPunctuationEntry.
11 Settings: schema validate, deep merge, deep-clone defaults, notify from reset + import, import via settingsApi.
12 Orphan holes: cascadeDeleteGlyph via deleteGrapheme; forceDeleteGlyph refuse to empty grapheme; wire handleGraphemeDeletion as opt-in respell or delete it.
13 N+1: batch buildSpellingDisplay (WHERE id IN / grapheme map), batch ancestors/descendants/meanings, no full refresh for glyph-only mutations.
14 Rendering primitives: combineSvgStrings viewBox rescale; single generateVirtualGlyphId; isVirtualGlyphId guard; implement/remove glyphStacking + wordWrap glyph; unify btt/btu; dedupe layoutUtils vs linearStrategy; validate contradictory directions in UI.
15 PRAGMA user_version + transactional idempotent migrations + fixture tests; fix README :601-605, :677-684.
Quick wins: databaseApi.export('json'); empty catch closureService:29; comment block :88-107; sanitizeSvg Node fallback; shared visited set getFullAncestryTree:864.
