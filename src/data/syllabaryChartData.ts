/**
 * Syllabary Chart Data
 *
 * Derives a hiragana-style CV (consonant+vowel) syllabary grid
 * from existing IPA chart data. Each cell represents a syllable
 * formed by combining a consonant row with a vowel column.
 *
 * @module data/syllabaryChartData
 */

import {
    IPA_VOWEL_CHART,
    IPA_CONSONANT_CHART,
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_IMPLOSIVES,
    type MannerOfArticulation,
    type PlaceOfArticulation,
    type VowelBackness,
} from './ipaChartData';

// =============================================================================
// TYPES
// =============================================================================

export interface ConsonantGroup {
    label: string;
    consonants: string[];
}

export interface VowelBacknessGroup {
    backness: VowelBackness;
    label: string;
    vowels: string[];
}

// =============================================================================
// VOWELS — ordered by backness (Front → Central → Back), then by height
// =============================================================================

const HEIGHT_ORDER = [
    'close',
    'near-close',
    'close-mid',
    'mid',
    'open-mid',
    'near-open',
    'open',
] as const;

function vowelsByBackness(backness: VowelBackness): string[] {
    return HEIGHT_ORDER.flatMap(height =>
        IPA_VOWEL_CHART
            .filter(v => v.backness === backness && v.height === height)
            .map(v => v.ipa)
    );
}

/**
 * Vowels grouped by backness for column group headers.
 */
export const VOWEL_BACKNESS_GROUPS: VowelBacknessGroup[] = [
    { backness: 'front', label: 'Front', vowels: vowelsByBackness('front') },
    { backness: 'central', label: 'Central', vowels: vowelsByBackness('central') },
    { backness: 'back', label: 'Back', vowels: vowelsByBackness('back') },
];

/**
 * All vowels in display order (Front → Central → Back).
 */
export const SYLLABARY_VOWELS: string[] = VOWEL_BACKNESS_GROUPS.flatMap(g => g.vowels);

// =============================================================================
// CONSONANTS — extracted from IPA chart data and grouped by manner
// =============================================================================

/** Extract non-null consonant symbols from the pulmonic chart for a given manner. */
function pulmonicConsonants(manner: MannerOfArticulation): string[] {
    const places: PlaceOfArticulation[] = [
        'bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar',
        'retroflex', 'palatal', 'velar', 'uvular', 'pharyngeal', 'glottal',
    ];
    const symbols: string[] = [];
    for (const place of places) {
        const cell = IPA_CONSONANT_CHART[manner][place];
        if (cell.voiceless) symbols.push(cell.voiceless);
        if (cell.voiced) symbols.push(cell.voiced);
    }
    return symbols;
}

/**
 * Consonant groups organized by manner of articulation.
 */
export const SYLLABARY_CONSONANT_GROUPS: ConsonantGroup[] = [
    { label: 'Plosives', consonants: pulmonicConsonants('plosive') },
    { label: 'Nasals', consonants: pulmonicConsonants('nasal') },
    { label: 'Trills', consonants: pulmonicConsonants('trill') },
    { label: 'Taps', consonants: pulmonicConsonants('tap') },
    { label: 'Fricatives', consonants: pulmonicConsonants('fricative') },
    { label: 'Lateral Fricatives', consonants: pulmonicConsonants('lateral_fricative') },
    { label: 'Approximants', consonants: pulmonicConsonants('approximant') },
    { label: 'Lateral Approximants', consonants: pulmonicConsonants('lateral_approximant') },
    { label: 'Affricates', consonants: IPA_AFFRICATES.map(a => a.ipa) },
    { label: 'Clicks', consonants: IPA_CLICKS.map(c => c.ipa) },
    { label: 'Implosives', consonants: IPA_IMPLOSIVES.map(i => i.ipa) },
];

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Build the CV syllable string from a consonant and vowel.
 */
export function getSyllable(consonant: string, vowel: string): string {
    return consonant + vowel;
}
