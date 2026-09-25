/**
 * Block script engine — pure (no React, no DB).
 *
 *   validate.ts   the block scheme document: validateBlockScheme, EMPTY_BLOCK_SCHEME
 *   classify.ts   spelling entry → EntryClass (incl. marks, `‿` joins); roleAccepts
 *   match.ts      one template vs a stretch of entries (slot counts, backtracking)
 *   syllabify.ts  one run of entries → syllable ranges (syllabic consonants,
 *                 syllable-sign codas); glueNuclei (diphthongs, joined vowels);
 *                 unitRoleOf
 *   segment.ts    spelling → Segment[] (template order, or one block per syllable)
 *   compose.ts    block segment → one SVG + slot report; lone consonant + mark;
 *                 pickVariant, blockKey
 *
 * See `BLOCK_SCRIPT_PLAN.md` §2.4 and §3.
 *
 * @module blocks
 */

export type {
    BlockGraphemeIndex,
    BlockGraphemeInfo,
    BlockLeftovers,
    BlockRole,
    BlockScheme,
    BlockSegment,
    BlockSlot,
    BlockSpellingEntry,
    BlockSplit,
    BlockTemplate,
    ComposedBlock,
    ComposedSlot,
    EntryClass,
    LeftoverPlacement,
    PassthroughSegment,
    RoleMatcher,
    SchemeIssue,
    SchemeValidation,
    Segment,
    SingleSegment,
    SlotFill,
    SlotPin,
} from './types';
export {
    cloneEmptyBlockScheme,
    EMPTY_BLOCK_SCHEME,
    LONE_CONSONANT_TEMPLATE_ID,
    MAX_DIPHTHONG_LENGTH,
    MAX_DIPHTHONGS,
    MAX_SLOT_COUNT,
    MAX_SOUND_LENGTH,
    MAX_SOUND_LIST,
    MIN_SLOT_SIZE,
    normalizeDiphthongs,
    normalizeSoundList,
    SLOT_FILLS,
    SLOT_PINS,
    validateBlockScheme,
} from './validate';
export {
    BLOCK_BOUNDARY,
    BLOCK_JOIN,
    classifyEntry,
    entrySound,
    MARK_CATEGORY_NAME,
    resolveEntryGrapheme,
    roleAccepts,
} from './classify';
export { matchTemplate, templateHasCounts } from './match';
export type { TemplateMatch } from './match';
export { glueNuclei, syllabify, unitRoleOf, unitRoles } from './syllabify';
export type { SyllableUnit, SyllabifyOptions, UnitRole } from './syllabify';
export { segmentEntries } from './segment';
export { BLOCK_VIEWBOX_SIZE, blockKey, composeBlock, composeLoneConsonant, pickVariant, variantSvg } from './compose';
export type { PickedVariant } from './compose';
