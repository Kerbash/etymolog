# Etymolog UI/UX audit (2026-08-21)

## (A) Shell & navigation
- App.tsx:14-21 — two routes: /new and /* → ConlangGuard → MainApp. ConlangGuard redirects to /new when conlangName falsy.
- MainApp.tsx:22-43 — top tabs (lexicon, script-maker, writing-system, translator) via RouterTabContainer (:96-103).
- Nested tabs only under Script Maker (grapheme/main.tsx:209-222 Graphemes ''/Glyphs) and Writing System (single "General" tab = pure chrome). Lexicon/Translator have no nested container → inconsistent 2nd level.
- tabs/graphotactic/main.tsx — unrouted placeholder, dead file.
- BLOCKING A11Y: routerTabContainer.tsx:69-76 renders tabs as <div onClick>; no role/tabIndex/aria-selected/onKeyDown. Primary nav unreachable by keyboard. Sibling tabContainer.tsx has full a11y (:355-360, :535-558) + responsive ARROW/DROPDOWN modes + parts API. COMPONENT_DIRECTORY.md:239 says migrate.
- tabContainer.module.scss:1-4 .toggleContainer overflow-x:hidden → tabs clipped on phones.
- background.tsx:23-31 inline {height:100dvh,width:100%} + {maxWidth:1200px}; --max-content-width unused. 100dvh + padding + no overflow handling forces each page to manage scroll.
- MainApp.tsx:64-94 hand-rolled header; footer is bare div; no <main>/<header>/<nav>/<footer> landmarks.
- NO DARK MODE TOGGLE. index.css:140-159 has [data-theme=dark] block; style-switcher is a dependency; nothing uses it.
- index.css:1-2 blocking Google Fonts @import (offline-hostile for PWA). :183-186 empty reset rule. :5 typo banner.

## (B) Per-page
### Lexicon
- LexiconHome.tsx:38-43 raw inline flex; 4× style={{.
- LexiconGallery.tsx — 17× style={{. :208-236 card div role=button with JS-mutated hover transform/boxShadow (:227-228,:233-234), hardcoded rgba. :239-246/:257-264 delete btn absolutely positioned with different offsets (8 vs 6). :277-295 native <select> inline-styled, no <label>. :300-326 good empty state (no-match vs nothing) — re-implemented in graphemeGallery.tsx:281-320. :414-452 delete modal all inline incl. warning box dup of LexiconViewPage.module.scss:129-135. :141-144 setCurPage() during render (also graphemeGallery:164-167, galleryGlyphs:100-103).
- CreateLexiconPage.tsx clean (SmartForm+SCSS); loading :92 / error :96 bare text.
- LexiconViewPage.tsx best structured. Edit is in-page mode toggle (:246) while other entities edit on routes/modals (3 paradigms). :222-241 Edit/Delete vanish in edit mode → layout jump. :340 delete copy uses lemma while title :220 uses pronunciation??lemma. Not-found :201-208 / invalid-id :192-199 bare <p>+Link.
### Script Maker
- grapheme/main.tsx 4× marginBottom inline on <nav>s, dropdownLinkStyle CSSProperties object (:37-43). Glyphs tab index inlines nav (:169-185) vs Graphemes delegates. CreateGlyphPage passthrough (:129-131).
- graphemeGallery.tsx 14× style={{, clone of LexiconGallery. :402-404 delete modal nameless copy vs GraphemeEditPage.tsx:133 named.
- galleryGlyphs.tsx 7× style. :244 nameless delete. :126-139 confirmDelete NEVER calls refresh() → deleted glyph stays on screen. :207-220 label htmlFor="auto-manage-glyphs" points to id CyberSwitch never gets.
- GlyphEditPage/GraphemeEditPage structurally identical; [Save][Cancel][Delete] one row (GlyphEditPage:197-222). SCSS near-identical. GlyphEditPage:189 flex.flexCol bug.
- newGrapheme.tsx only Save (:134-140), no Cancel; back nav in main.tsx:114-122. :107/:112 unstyled loading/error.
- NewGlyphPage.tsx:7 + NewGlyphModal.tsx:7 import newGrapheme.module.scss. NewGlyphModal:46 setTimeout 20ms hack. Glyph create exists as page AND modal; same for edit (GlyphEditPage vs EditGlyphModal at GraphemeFormFields:384).
- IPAChartPage/SyllabaryChartPage/PunctuationPage/CustomChartsPage: identical skeleton (.nav back → .pageTitle → .description → .statsBar → content → .infoSection) ×4 TSX and ×4 SCSS. Loading as loadingText div; errors static, no retry.
- CustomChartsPage.tsx:69 window.confirm (only native dialog). :137-143 create button placed below stats. :146-149 empty state bare <p> no CTA.
- PunctuationPage.tsx:213-233 reuses GraphemeGallery selectionMode in modal — good picker pattern, only one. GraphemeFormFields:317-326 "Select Existing Glyph" disabled "coming soon".
### Writing System
- GeneralTab no page title. WritingSystemTable.tsx:18-47 multiple tbody, th lack scope. WritingSystemRow.tsx:23-33 ~15 <select> with no label/aria-label. Saves on change, no confirmation/toast/undo (GeneralTab:15-22).
### Translator
- TranslatorHome.tsx:96 strategy="block" HARDCODED. _components/TranslationControls.tsx DEAD (offers 8 strategies, exported, never rendered) → src/rules + 6 spelling strategies unreachable from UI.
- :92 "Translating..." string. No empty state. PhraseDisplay.tsx:77 ⚠️ emoji. ExportDropdown.tsx:82-84 toggle is <span>; :95,:102 emoji; :34,:48,:57,:73 every export failure console.error only; :41-43,:65-68 backgroundColor:'white'.
### New Conlang / global
- NewConlangPage 5× style. ConlangNameModal.tsx:56-71 raw <input>, inline style, no label — app's first input; everywhere else uses smart-form LabelShiftTextInput.
- MainApp.tsx:124-149 wipe confirm destructive uses buttonStyles.primary (:142). ExportImportButtons.tsx:97-121 import-replace also primary (:114). ImportJsonModal.tsx:44-50 unlabelled textarea.

## (C) Styling/theming debt (49 stylesheets, 5294 lines)
### C1 ~22 CSS vars used but NEVER DEFINED
--danger (7 delete buttons); --color-primary/-danger/-border/-text-primary/-secondary/-tertiary/-bg-secondary/-bg-hover/-success/-warning*/-primary-bg/-*-rgb (translator.module.scss whole file, AncestryNodeDisplay.module.scss:15-16,64, exportImport.module.scss:23,54); --error-base/-dark/-light, --warning (glyphEditPage.module.scss:16-19,40; graphemeEditPage:20-23,44); --text-muted, --text-tertiary, --status-neutral, --status-bad-bg, --status-bad-border, --status-good-bg, --status-info-text, --surface-hover, --surface-raised-hover, --border-hover, --interactive-text, --focus-ring, --font-mono (~30 sites).
1. LIVE BUG: delete buttons invisible (white text, no bg) in 7 modals: LexiconGallery:447, LexiconViewPage:358, graphemeGallery:413, galleryGlyphs:275, GlyphEditPage:258, GraphemeEditPage:137, EditGlyphModal:128. buttonStyles.danger exists (used at GlyphEditPage:215, GraphemeEditPage:126).
2. Dark mode defeated: hex fallbacks (var(--color-text-primary,#1a1a1a) etc.) always win. Whole Translator tab fixed light.
- EtymologyTree.tsx:78 blend swatch var(--color-primary) transparent; :82 --status-neutral.
### C2 Deprecated @import '@styles/modal.module.scss' + @extend in 8 files: MainApp, CreateChartModal, exportImport, editGlyphModal, ConlangNameModal, glyphEditPage, graphemeEditPage, newGrapheme .module.scss. modal.module.scss is 5 lines and consumers override padding anyway.
### C3 Copy-paste: IPAChartPage.module.scss vs SyllabaryChartPage.module.scss ~100 identical; glyphEditPage vs graphemeEditPage ~45 identical; .loading ×8 files, .error ×5, .loadingText ×4, .nav ×6, .pageTitle/.statsBar/.stat ×4, .infoSection ×3, .description ×8, .modalContent ×9, .emptyState ×9, .container ×11. meaningTableInput (146) vs pronunciationTableInput (181) same table styling.
### C4 Hardcoded colours: box-shadow rgba(0,0,0,.1) in glyphCard:10, grapheme/compact:19, lexicon/compact:20, EtymologyTree:81, PunctuationTable:12, graphemeFormFields:54, newGrapheme:68; zebra rgba(0,0,0,.03) in meaning/pronunciation table inputs; focus ring rgba(0,123,255,.1) / rgba(0,102,204,.1); GlyphKeyboardOverlay:19,235 scrims; crayon palette index.css:124-134 only --red/--green used.
### C5 display/grapheme/detailed/detailed.css — only non-module global stylesheet (133 lines, generic class names, custom scrollbar).
### C6 flex.flexCol DOES NOT EXIST (utils-styles exports flexColumn) — 5 sites silently not column-flexed: GlyphForm.tsx:121, GlyphFormFields.tsx:120, GraphemeFormFields.tsx:331, LexiconFormFields.tsx:397, GlyphEditPage.tsx:189.
### C7 88 style={{ across 28 files (LexiconGallery 17, graphemeGallery 14, galleryGlyphs 7, EtymologyTree 6, NewConlangPage 5, LexiconHome 4, grapheme/main 4, MainApp 3).
### C8 Responsiveness: 10 @media total. min-width:400px modals (CreateChartModal:6, exportImport:6, MainApp.module:6), minWidth 320/360 inline (LexiconGallery:414, galleryGlyphs:240); IPAVowelChart:23 / IPACombinedChart:44 width:600px.
### C9 Focus: 19 :focus, zero :focus-visible; GlyphSpellingDisplay:104 var(--focus-ring,#3b82f6). Cards/tabs/WS table have no focus style.

## (D) cyber-components candidates (unused today)
- container/tabContainer (non-router) — a11y + responsive; replace routerTabContainer at MainApp:96, grapheme/main:227, writingSystem/main:24. HIGHEST VALUE.
- information/notificationBanner — 22 console.error sites with no UI (ExportDropdown:34/48/57/73, galleryGlyphs:131/135, graphemeGallery:199/210, LexiconGallery:193/200, LexiconViewPage:127/168/171) + .errorMessage divs.
- information/floatingBanner — toast for silent auto-saves (GeneralTab:15, PunctuationPage:83/96/107).
- container/modal/confirmationOverlay + useConfirmationDialog — all 8 delete modals + window.confirm.
- container/table/sortableTable — WritingSystemTable/Row (+122 SCSS), PunctuationTable/Cell (+254 SCSS).
- graphics/loading/shimmer — all "Loading..." strings (10 sites). loading/dotLoader — button label swaps ×7.
- decor/numbered-section-header — page headers, LexiconFormFields sectionHeader :379/395/419/460.
- navigation/breadcrumb + buttons/backButton — 8 duplicated back nav rows (all hard-navigate to fixed route → wrong tab on back).
- container/sideBar — alternative nav for 11 destinations.
- display/cards/miniIconCard — CustomChartCard, EtymologyTree legend. display/quickFactsRow — statsBars + PhraseDisplay metadata.
- container/navigationGuard — no unsaved-changes warning on any edit page.
- settings/darkmodeSwitch. reorderableList — glyph order (GraphemeFormFields:296-304), ancestor order (AncestryInput:279-376) have no reorder UI though position persisted. expandableContainer — .infoSection explainers.
- NO empty-state component in cyber-components — extract one.

## (E) Top 15
1 keyboard-operable nav (TabContainer migration). 2 fix invisible delete buttons (buttonStyles.danger). 3 define missing token layer, strip hex fallbacks → dark mode works. 4 dark mode toggle. 5 flexCol→flexColumn ×5. 6 one confirmation dialog, always name entity. 7 visible failure messages (22 sites; export silent; galleryGlyphs missing refresh). 8 render TranslationControls. 9 reorder lexicon form: Basic Info before Spelling (LexiconFormFields:378-395). 10 unify create/edit paradigm (route for entities, modal for pickers). 11 extract PageHeader + EmptyState. 12 label every control (ConlangNameModal:56, ImportJsonModal:44, LexiconGallery:277, WritingSystemRow:23, galleryGlyphs:209; help ? icons LexiconFormFields:432/447 mouse-only). 13 CSS hover/focus-visible instead of JS mutation. 14 separate Delete from Cancel; danger styling on wipe/import-replace. 15 phone survival (modal floors min(400px,100vw-2rem), tab dropdown mode, chart widths).
Quick wins: delete graphotactic/main.tsx, form/customInput/spellingInput/ (unreferenced), wire/delete TranslationControls; detailed.css → module; '�' fallback DetailedLexiconDisplay:91; @import→@use ×8; emoji→SvgIcon (PhraseDisplay:77, GlyphEditPage:241, EditGlyphModal:116, ExportDropdown:95,102); self-host fonts.
