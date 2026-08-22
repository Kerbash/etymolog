/**
 * @fileoverview Phonology core — the generator's answer to "what is this sound?".
 *
 * Four modules, one direction of dependency:
 *
 *   features.ts   the lookup table, built from `src/data/ipaChartData.ts`
 *   tokenize.ts   a transcription -> sounds (imports features)
 *   sonority.ts   the scale and the cluster checks (imports features)
 *   classes.ts    the template letters `C V P F S N L G R O` (imports features)
 *
 * Nothing here imports React, the db layer or a component: the whole module is
 * plain data in, plain data out, so it runs in a node test, in a worker and on
 * the render path alike. A ratchet test enforces that.
 *
 * @module generator/phonology
 */

export {
    describePhoneme,
    describePhonemeLabel,
    isAttachingMark,
    isTieBar,
    knownSymbols,
    lookupBase,
    phonemeIdentity,
    safeNormalize,
    separatorKindOf,
    EXTRA_SYMBOLS,
    LENGTH_MARK,
    NASAL_MARK,
    TABLE_CONFLICTS,
    TIE_BARS,
} from './features';
export type {
    ConsonantFeatures,
    ConsonantManner,
    ExtraSymbolEntry,
    IpaSeparator,
    MannerOfArticulation,
    PhonemeFeatures,
    PhonemeKind,
    PlaceOfArticulation,
    VowelBackness,
    VowelFeatures,
    VowelHeight,
} from './features';

export { splitPhonemeString, tokenizeIpa } from './tokenize';
export type { IpaToken } from './tokenize';

export { isValidCoda, isValidContact, isValidOnset, sonorityOf, splitMedialCluster } from './sonority';
export type { SonorityOptions } from './sonority';

export { classOf, isClassLetter, isInClass, CLASS_LABELS, CLASS_LETTERS } from './classes';
export type { ClassLetter } from './classes';
