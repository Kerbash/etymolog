/**
 * @fileoverview The generation engine — public surface.
 *
 * Six modules, and the dependency runs one way through them:
 *
 *   random.ts       the seeded rng, and the ONE non-deterministic function
 *   weights.ts      commonness ranking x frequency curve x the user's tilt
 *   template.ts     the syllable-shape parser (the profile validator needs it too)
 *   normalize.ts    the comparison form of a pronunciation, for dedupe
 *   constraints.ts  the rules a candidate has to survive
 *   generate.ts     rejection sampling over the five above
 *
 * Nothing here reaches for the db, React or a component; a ratchet test
 * enforces it, and a second one pins that the platform random source is named
 * exactly once in the whole directory.
 *
 * @module generator/engine
 */

export {
    expandTemplate,
    isValidTemplatePattern,
    parseTemplate,
    templateHasVowelSlot,
    TemplateSyntaxError,
    OPTIONAL_CHANCE,
} from './template';
export type { TemplateCheck, TemplateItem } from './template';

export { createRng, pickInt, pickWeighted, randomSeed } from './random';
export type { Rng } from './random';

export { phonemeWeights, tiltFor, COMMONNESS_RANK } from './weights';

export { normalizePronunciation } from './normalize';

export {
    buildSyllable,
    checkWord,
    clusterBudget,
    explainViolation,
    inventoryOnly,
    isVocalic,
    noForbiddenSequences,
    noIllegalGeminates,
    slotHarmony,
    sonorityInClusters,
    soundsOf,
    vowelHarmony,
    wordSounds,
    CONSTRAINT_RULES,
} from './constraints';
export type { ConstraintRule, Syllable, Violation } from './constraints';

export { generateWords, ATTEMPTS_PER_WORD } from './generate';
export type { GeneratedBatch, GeneratedWord, GenerateOptions, Shortfall } from './generate';
