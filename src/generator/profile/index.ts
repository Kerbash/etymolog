/**
 * @fileoverview The generator profile — the persisted model and its validator.
 *
 *   types.ts      the shape that goes into `localStorage` and the export envelope
 *   defaults.ts   the starting profile and the bounds every profile is held to
 *   validate.ts   untrusted value in, complete profile + corrections out
 *
 * `src/db/api/types.ts` imports the TYPE from here and the default VALUE from
 * `defaults.ts`; the db layer's `settingsSchema.ts` delegates to
 * `validateGeneratorSettings`. The dependency runs one way only — nothing under
 * `src/generator/` knows the db exists.
 *
 * @module generator/profile
 */

export {
    cloneDefaultProfile,
    cloneDefaultWordGeneratorSettings,
    DEFAULT_PROFILE,
    DEFAULT_WORD_GENERATOR_SETTINGS,
    LIMITS,
} from './defaults';

export { validateGeneratorSettings } from './validate';
export type { GeneratorSettingsValidation, SettingsIssue } from './validate';

export type {
    ClusterRules,
    FrequencyTilt,
    SyllableTemplate,
    WordGeneratorProfile,
    WordGeneratorSettings,
} from './types';
