/**
 * @fileoverview The word generator — public surface.
 *
 * Pure TypeScript, in the spirit of `src/rules/`: no React, no db, no DOM. The
 * page layer supplies the profile and the conlang's sounds; everything in here
 * is a function of its arguments.
 *
 * Phases 1 and 2 ship the phonology core, the profile model and its validator,
 * the flavour presets, the coverage/guide computation, and the syllable-template
 * parser (which lives under `engine/` because the generator expands templates,
 * but which the profile validator needs in order to reject a bad pattern).
 * Phase 3 adds the engine itself — the seeded rng, the frequency weights, the
 * constraints, dedupe normalisation and `generateWords` — plus `inventory.ts`,
 * which classifies whichever list of sounds the page decides to generate from.
 * The rest of the app only ever imports `../../generator`.
 *
 * Re-exports are named rather than `export *`: two of the sub-barrels
 * deliberately surface the same symbol (`presets` re-exports `guideMapFor` from
 * `coverage`), and a star export of both would make the name ambiguous.
 *
 * @module generator
 */

export * from './phonology';

export {
    cloneDefaultProfile,
    cloneDefaultWordGeneratorSettings,
    validateGeneratorSettings,
    DEFAULT_PROFILE,
    DEFAULT_WORD_GENERATOR_SETTINGS,
    LIMITS,
} from './profile';
export type {
    ClusterRules,
    FrequencyTilt,
    GeneratorSettingsValidation,
    SettingsIssue,
    SyllableTemplate,
    WordGeneratorProfile,
    WordGeneratorSettings,
} from './profile';

export {
    buildSyllable,
    checkWord,
    clusterBudget,
    createRng,
    expandTemplate,
    explainViolation,
    generateWords,
    inventoryOnly,
    isValidTemplatePattern,
    isVocalic,
    noForbiddenSequences,
    noIllegalGeminates,
    normalizePronunciation,
    parseTemplate,
    phonemeWeights,
    pickInt,
    pickWeighted,
    randomSeed,
    slotHarmony,
    sonorityInClusters,
    soundsOf,
    templateHasVowelSlot,
    tiltFor,
    vowelHarmony,
    wordSounds,
    ATTEMPTS_PER_WORD,
    COMMONNESS_RANK,
    CONSTRAINT_RULES,
    TemplateSyntaxError,
    OPTIONAL_CHANCE,
} from './engine';
export type {
    ConstraintRule,
    GeneratedBatch,
    GeneratedWord,
    GenerateOptions,
    Rng,
    Shortfall,
    Syllable,
    TemplateCheck,
    TemplateItem,
    Violation,
} from './engine';

export { deriveInventory, inventoryHas } from './inventory';
export type { ClassifiedInventory, DeriveInventoryOptions, InventoryMember } from './inventory';

export { applyPreset, getPreset, presetInventory, PRESETS, PRESET_IDS } from './presets';
export type { FlavourPreset, PresetId, PresetProfile, PresetSounds, PresetVowels } from './presets';

export { computeCoverage, guideMapFor } from './coverage';
export type { CoverageSet, GuideMap, GuideTier, PresetCoverage } from './coverage';
