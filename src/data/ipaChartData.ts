/**
 * IPA Chart Data Definitions
 *
 * Comprehensive IPA (International Phonetic Alphabet) chart data
 * organized for rendering consonant tables and vowel trapezoids.
 *
 * @module data/ipaChartData
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Place of articulation for consonants (columns in the IPA chart).
 */
export type PlaceOfArticulation =
    | 'bilabial'
    | 'labiodental'
    | 'dental'
    | 'alveolar'
    | 'postalveolar'
    | 'retroflex'
    | 'palatal'
    | 'velar'
    | 'uvular'
    | 'pharyngeal'
    | 'glottal';

/**
 * Manner of articulation for consonants (rows in the IPA chart).
 */
export type MannerOfArticulation =
    | 'plosive'
    | 'nasal'
    | 'trill'
    | 'tap'
    | 'fricative'
    | 'lateral_fricative'
    | 'approximant'
    | 'lateral_approximant';

/**
 * Vowel height (vertical axis in the vowel trapezoid).
 */
export type VowelHeight =
    | 'close'
    | 'near-close'
    | 'close-mid'
    | 'mid'
    | 'open-mid'
    | 'near-open'
    | 'open';

/**
 * Vowel backness (horizontal axis in the vowel trapezoid).
 */
export type VowelBackness = 'front' | 'central' | 'back';

/**
 * A consonant cell containing voiceless and/or voiced variants.
 * null means the sound is impossible or doesn't exist.
 */
export interface ConsonantCell {
    /** Voiceless variant IPA character, null if impossible */
    voiceless: string | null;
    /** Voiced variant IPA character, null if impossible */
    voiced: string | null;
}

/**
 * A vowel position in the chart with IPA character and coordinates.
 */
export interface VowelPosition {
    /** IPA character */
    ipa: string;
    /** Vowel height */
    height: VowelHeight;
    /** Vowel backness */
    backness: VowelBackness;
    /** Whether the vowel is rounded */
    rounded: boolean;
    /** Display name/description */
    name: string;
}

/**
 * Chart header information.
 */
export interface ChartHeader {
    key: string;
    label: string;
    abbr?: string;
}

// =============================================================================
// CONSONANT CHART DATA
// =============================================================================

/**
 * Place of articulation column headers (left to right).
 */
export const PLACES_OF_ARTICULATION: ChartHeader[] = [
    { key: 'bilabial', label: 'Bilabial', abbr: 'Bilab.' },
    { key: 'labiodental', label: 'Labio-dental', abbr: 'Lab-dent.' },
    { key: 'dental', label: 'Dental', abbr: 'Dent.' },
    { key: 'alveolar', label: 'Alveolar', abbr: 'Alv.' },
    { key: 'postalveolar', label: 'Post-alveolar', abbr: 'Post-alv.' },
    { key: 'retroflex', label: 'Retroflex', abbr: 'Retrofl.' },
    { key: 'palatal', label: 'Palatal', abbr: 'Pal.' },
    { key: 'velar', label: 'Velar', abbr: 'Vel.' },
    { key: 'uvular', label: 'Uvular', abbr: 'Uvu.' },
    { key: 'pharyngeal', label: 'Pharyngeal', abbr: 'Phar.' },
    { key: 'glottal', label: 'Glottal', abbr: 'Glot.' },
];

/**
 * Manner of articulation row headers (top to bottom).
 */
export const MANNERS_OF_ARTICULATION: ChartHeader[] = [
    { key: 'plosive', label: 'Plosive' },
    { key: 'nasal', label: 'Nasal' },
    { key: 'trill', label: 'Trill' },
    { key: 'tap', label: 'Tap or Flap' },
    { key: 'fricative', label: 'Fricative' },
    { key: 'lateral_fricative', label: 'Lateral fricative' },
    { key: 'approximant', label: 'Approximant' },
    { key: 'lateral_approximant', label: 'Lateral approximant' },
];

/**
 * The main IPA consonant chart data.
 * Organized as: manner -> place -> { voiceless, voiced }
 *
 * null values indicate sounds that are impossible or not attested.
 * The shaded areas in the official IPA chart are represented by both voiceless and voiced being null.
 */
export const IPA_CONSONANT_CHART: Record<MannerOfArticulation, Record<PlaceOfArticulation, ConsonantCell>> = {
    plosive: {
        bilabial: { voiceless: 'p', voiced: 'b' },
        labiodental: { voiceless: null, voiced: null }, // Not possible
        dental: { voiceless: null, voiced: null }, // Dental plosives use alveolar symbols with diacritics
        alveolar: { voiceless: 't', voiced: 'd' },
        postalveolar: { voiceless: null, voiced: null }, // Not in standard IPA pulmonic
        retroflex: { voiceless: 'ʈ', voiced: 'ɖ' },
        palatal: { voiceless: 'c', voiced: 'ɟ' },
        velar: { voiceless: 'k', voiced: 'g' },
        uvular: { voiceless: 'q', voiced: 'ɢ' },
        pharyngeal: { voiceless: null, voiced: null }, // Epiglottal plosive is separate
        glottal: { voiceless: 'ʔ', voiced: null }, // No voiced glottal plosive
    },
    nasal: {
        bilabial: { voiceless: null, voiced: 'm' },
        labiodental: { voiceless: null, voiced: 'ɱ' },
        dental: { voiceless: null, voiced: null }, // Use alveolar with diacritic
        alveolar: { voiceless: null, voiced: 'n' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: 'ɳ' },
        palatal: { voiceless: null, voiced: 'ɲ' },
        velar: { voiceless: null, voiced: 'ŋ' },
        uvular: { voiceless: null, voiced: 'ɴ' },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null }, // Not possible
    },
    trill: {
        bilabial: { voiceless: null, voiced: 'ʙ' },
        labiodental: { voiceless: null, voiced: null },
        dental: { voiceless: null, voiced: null },
        alveolar: { voiceless: null, voiced: 'r' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: null },
        palatal: { voiceless: null, voiced: null },
        velar: { voiceless: null, voiced: null },
        uvular: { voiceless: null, voiced: 'ʀ' },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null },
    },
    tap: {
        bilabial: { voiceless: null, voiced: null },
        labiodental: { voiceless: null, voiced: 'ⱱ' },
        dental: { voiceless: null, voiced: null },
        alveolar: { voiceless: null, voiced: 'ɾ' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: 'ɽ' },
        palatal: { voiceless: null, voiced: null },
        velar: { voiceless: null, voiced: null },
        uvular: { voiceless: null, voiced: null },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null },
    },
    fricative: {
        bilabial: { voiceless: 'ɸ', voiced: 'β' },
        labiodental: { voiceless: 'f', voiced: 'v' },
        dental: { voiceless: 'θ', voiced: 'ð' },
        alveolar: { voiceless: 's', voiced: 'z' },
        postalveolar: { voiceless: 'ʃ', voiced: 'ʒ' },
        retroflex: { voiceless: 'ʂ', voiced: 'ʐ' },
        palatal: { voiceless: 'ç', voiced: 'ʝ' },
        velar: { voiceless: 'x', voiced: 'ɣ' },
        uvular: { voiceless: 'χ', voiced: 'ʁ' },
        pharyngeal: { voiceless: 'ħ', voiced: 'ʕ' },
        glottal: { voiceless: 'h', voiced: 'ɦ' },
    },
    lateral_fricative: {
        bilabial: { voiceless: null, voiced: null },
        labiodental: { voiceless: null, voiced: null },
        dental: { voiceless: null, voiced: null },
        alveolar: { voiceless: 'ɬ', voiced: 'ɮ' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: null },
        palatal: { voiceless: null, voiced: null },
        velar: { voiceless: null, voiced: null },
        uvular: { voiceless: null, voiced: null },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null },
    },
    approximant: {
        bilabial: { voiceless: null, voiced: null },
        labiodental: { voiceless: null, voiced: 'ʋ' },
        dental: { voiceless: null, voiced: null },
        alveolar: { voiceless: null, voiced: 'ɹ' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: 'ɻ' },
        palatal: { voiceless: null, voiced: 'j' },
        velar: { voiceless: null, voiced: 'ɰ' },
        uvular: { voiceless: null, voiced: null },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null },
    },
    lateral_approximant: {
        bilabial: { voiceless: null, voiced: null },
        labiodental: { voiceless: null, voiced: null },
        dental: { voiceless: null, voiced: null },
        alveolar: { voiceless: null, voiced: 'l' },
        postalveolar: { voiceless: null, voiced: null },
        retroflex: { voiceless: null, voiced: 'ɭ' },
        palatal: { voiceless: null, voiced: 'ʎ' },
        velar: { voiceless: null, voiced: 'ʟ' },
        uvular: { voiceless: null, voiced: null },
        pharyngeal: { voiceless: null, voiced: null },
        glottal: { voiceless: null, voiced: null },
    },
};

// =============================================================================
// VOWEL CHART DATA
// =============================================================================

/**
 * SVG coordinate mapping for vowel positions.
 * The IPA vowel chart is a trapezoid with:
 * - Front vowels on the left
 * - Back vowels on the right
 * - Close vowels at the top
 * - Open vowels at the bottom
 *
 * Coordinates are percentages for responsive scaling.
 */
const VOWEL_COORDINATES: Record<VowelBackness, Record<VowelHeight, { x: number; y: number }>> = {
    front: {
        'close': { x: 10, y: 5 },
        'near-close': { x: 15, y: 18 },
        'close-mid': { x: 20, y: 31 },
        'mid': { x: 25, y: 44 },
        'open-mid': { x: 30, y: 57 },
        'near-open': { x: 35, y: 70 },
        'open': { x: 40, y: 95 },
    },
    central: {
        'close': { x: 50, y: 5 },
        'near-close': { x: 50, y: 18 },
        'close-mid': { x: 50, y: 31 },
        'mid': { x: 50, y: 44 },
        'open-mid': { x: 50, y: 57 },
        'near-open': { x: 50, y: 70 },
        'open': { x: 50, y: 95 },
    },
    back: {
        'close': { x: 90, y: 5 },
        'near-close': { x: 85, y: 18 },
        'close-mid': { x: 80, y: 31 },
        'mid': { x: 75, y: 44 },
        'open-mid': { x: 70, y: 57 },
        'near-open': { x: 65, y: 70 },
        'open': { x: 60, y: 95 },
    },
};

/**
 * Main IPA vowel chart data.
 * Each entry contains the IPA symbol and its phonetic position.
 */
export const IPA_VOWEL_CHART: VowelPosition[] = [
    // Close vowels
    { ipa: 'i', height: 'close', backness: 'front', rounded: false, name: 'Close front unrounded' },
    { ipa: 'y', height: 'close', backness: 'front', rounded: true, name: 'Close front rounded' },
    { ipa: 'ɨ', height: 'close', backness: 'central', rounded: false, name: 'Close central unrounded' },
    { ipa: 'ʉ', height: 'close', backness: 'central', rounded: true, name: 'Close central rounded' },
    { ipa: 'ɯ', height: 'close', backness: 'back', rounded: false, name: 'Close back unrounded' },
    { ipa: 'u', height: 'close', backness: 'back', rounded: true, name: 'Close back rounded' },

    // Near-close vowels
    { ipa: 'ɪ', height: 'near-close', backness: 'front', rounded: false, name: 'Near-close front unrounded' },
    { ipa: 'ʏ', height: 'near-close', backness: 'front', rounded: true, name: 'Near-close front rounded' },
    { ipa: 'ʊ', height: 'near-close', backness: 'back', rounded: true, name: 'Near-close back rounded' },

    // Close-mid vowels
    { ipa: 'e', height: 'close-mid', backness: 'front', rounded: false, name: 'Close-mid front unrounded' },
    { ipa: 'ø', height: 'close-mid', backness: 'front', rounded: true, name: 'Close-mid front rounded' },
    { ipa: 'ɘ', height: 'close-mid', backness: 'central', rounded: false, name: 'Close-mid central unrounded' },
    { ipa: 'ɵ', height: 'close-mid', backness: 'central', rounded: true, name: 'Close-mid central rounded' },
    { ipa: 'ɤ', height: 'close-mid', backness: 'back', rounded: false, name: 'Close-mid back unrounded' },
    { ipa: 'o', height: 'close-mid', backness: 'back', rounded: true, name: 'Close-mid back rounded' },

    // Mid vowels
    { ipa: 'ə', height: 'mid', backness: 'central', rounded: false, name: 'Mid central (schwa)' },

    // Open-mid vowels
    { ipa: 'ɛ', height: 'open-mid', backness: 'front', rounded: false, name: 'Open-mid front unrounded' },
    { ipa: 'œ', height: 'open-mid', backness: 'front', rounded: true, name: 'Open-mid front rounded' },
    { ipa: 'ɜ', height: 'open-mid', backness: 'central', rounded: false, name: 'Open-mid central unrounded' },
    { ipa: 'ɞ', height: 'open-mid', backness: 'central', rounded: true, name: 'Open-mid central rounded' },
    { ipa: 'ʌ', height: 'open-mid', backness: 'back', rounded: false, name: 'Open-mid back unrounded' },
    { ipa: 'ɔ', height: 'open-mid', backness: 'back', rounded: true, name: 'Open-mid back rounded' },

    // Near-open vowels
    { ipa: 'æ', height: 'near-open', backness: 'front', rounded: false, name: 'Near-open front unrounded' },
    { ipa: 'ɐ', height: 'near-open', backness: 'central', rounded: false, name: 'Near-open central' },

    // Open vowels
    { ipa: 'a', height: 'open', backness: 'front', rounded: false, name: 'Open front unrounded' },
    { ipa: 'ɶ', height: 'open', backness: 'front', rounded: true, name: 'Open front rounded' },
    { ipa: 'ɑ', height: 'open', backness: 'back', rounded: false, name: 'Open back unrounded' },
    { ipa: 'ɒ', height: 'open', backness: 'back', rounded: true, name: 'Open back rounded' },
];

/**
 * Get SVG coordinates for a vowel.
 */
export function getVowelCoordinates(vowel: VowelPosition): { x: number; y: number } {
    return VOWEL_COORDINATES[vowel.backness][vowel.height];
}

/**
 * Vowel chart dimensions (relative coordinates).
 */
export const VOWEL_CHART_VIEWBOX = {
    width: 100,
    height: 100,
    padding: 5,
};

/**
 * Height row labels for the vowel chart.
 */
export const VOWEL_HEIGHT_LABELS: ChartHeader[] = [
    { key: 'close', label: 'Close' },
    { key: 'near-close', label: 'Near-close' },
    { key: 'close-mid', label: 'Close-mid' },
    { key: 'mid', label: 'Mid' },
    { key: 'open-mid', label: 'Open-mid' },
    { key: 'near-open', label: 'Near-open' },
    { key: 'open', label: 'Open' },
];

/**
 * Backness column labels for the vowel chart.
 */
export const VOWEL_BACKNESS_LABELS: ChartHeader[] = [
    { key: 'front', label: 'Front' },
    { key: 'central', label: 'Central' },
    { key: 'back', label: 'Back' },
];

// =============================================================================
// ADDITIONAL CONSONANT CHARTS (Non-pulmonic, Affricates, etc.)
// =============================================================================

/**
 * Common affricates (not in the main pulmonic consonant chart).
 */
export interface AffricateEntry {
    ipa: string;
    voiceless: boolean;
    description: string;
}

export const IPA_AFFRICATES: AffricateEntry[] = [
    { ipa: 't͡s', voiceless: true, description: 'Voiceless alveolar affricate' },
    { ipa: 'd͡z', voiceless: false, description: 'Voiced alveolar affricate' },
    { ipa: 't͡ʃ', voiceless: true, description: 'Voiceless postalveolar affricate' },
    { ipa: 'd͡ʒ', voiceless: false, description: 'Voiced postalveolar affricate' },
    { ipa: 'ʈ͡ʂ', voiceless: true, description: 'Voiceless retroflex affricate' },
    { ipa: 'ɖ͡ʐ', voiceless: false, description: 'Voiced retroflex affricate' },
    { ipa: 't͡ɕ', voiceless: true, description: 'Voiceless alveolo-palatal affricate' },
    { ipa: 'd͡ʑ', voiceless: false, description: 'Voiced alveolo-palatal affricate' },
    { ipa: 't͡ɬ', voiceless: true, description: 'Voiceless alveolar lateral affricate' },
    { ipa: 'd͡ɮ', voiceless: false, description: 'Voiced alveolar lateral affricate' },
];

/**
 * Non-pulmonic consonants: Clicks
 */
export interface ClickEntry {
    ipa: string;
    description: string;
}

export const IPA_CLICKS: ClickEntry[] = [
    { ipa: 'ʘ', description: 'Bilabial click' },
    { ipa: 'ǀ', description: 'Dental click' },
    { ipa: 'ǃ', description: 'Alveolar click' },
    { ipa: 'ǂ', description: 'Palatoalveolar click' },
    { ipa: 'ǁ', description: 'Alveolar lateral click' },
];

/**
 * Non-pulmonic consonants: Implosives
 */
export interface ImplosiveEntry {
    ipa: string;
    description: string;
}

export const IPA_IMPLOSIVES: ImplosiveEntry[] = [
    { ipa: 'ɓ', description: 'Voiced bilabial implosive' },
    { ipa: 'ɗ', description: 'Voiced alveolar implosive' },
    { ipa: 'ʄ', description: 'Voiced palatal implosive' },
    { ipa: 'ɠ', description: 'Voiced velar implosive' },
    { ipa: 'ʛ', description: 'Voiced uvular implosive' },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get all IPA consonant symbols from the chart.
 */
export function getAllConsonantSymbols(): string[] {
    const symbols: string[] = [];

    for (const manner of Object.keys(IPA_CONSONANT_CHART) as MannerOfArticulation[]) {
        for (const place of Object.keys(IPA_CONSONANT_CHART[manner]) as PlaceOfArticulation[]) {
            const cell = IPA_CONSONANT_CHART[manner][place];
            if (cell.voiceless) symbols.push(cell.voiceless);
            if (cell.voiced) symbols.push(cell.voiced);
        }
    }

    return symbols;
}

/**
 * Get all IPA vowel symbols from the chart.
 */
export function getAllVowelSymbols(): string[] {
    return IPA_VOWEL_CHART.map(v => v.ipa);
}

/**
 * Get all IPA symbols (consonants + vowels + affricates + non-pulmonic).
 */
export function getAllIPASymbols(): string[] {
    return [
        ...getAllConsonantSymbols(),
        ...getAllVowelSymbols(),
        ...IPA_AFFRICATES.map(a => a.ipa),
        ...IPA_CLICKS.map(c => c.ipa),
        ...IPA_IMPLOSIVES.map(i => i.ipa),
    ];
}

/**
 * Check if a cell position is "impossible" (shaded in official IPA chart).
 * These are positions where the articulation is physically impossible.
 */
export function isImpossibleCell(manner: MannerOfArticulation, place: PlaceOfArticulation): boolean {
    const cell = IPA_CONSONANT_CHART[manner][place];
    // A cell is impossible if both voiceless and voiced are null AND
    // it's one of the known impossible combinations
    if (cell.voiceless === null && cell.voiced === null) {
        // Labiodental plosives, pharyngeal plosives, glottal nasals, etc.
        const impossibleCombinations: Array<[MannerOfArticulation, PlaceOfArticulation]> = [
            ['plosive', 'labiodental'],
            ['plosive', 'pharyngeal'],
            ['nasal', 'pharyngeal'],
            ['nasal', 'glottal'],
            ['trill', 'glottal'],
            ['tap', 'glottal'],
            ['lateral_fricative', 'bilabial'],
            ['lateral_fricative', 'labiodental'],
            ['lateral_fricative', 'pharyngeal'],
            ['lateral_fricative', 'glottal'],
            ['lateral_approximant', 'bilabial'],
            ['lateral_approximant', 'labiodental'],
            ['lateral_approximant', 'pharyngeal'],
            ['lateral_approximant', 'glottal'],
        ];

        return impossibleCombinations.some(([m, p]) => m === manner && p === place);
    }

    return false;
}

export default {
    IPA_CONSONANT_CHART,
    IPA_VOWEL_CHART,
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_IMPLOSIVES,
    PLACES_OF_ARTICULATION,
    MANNERS_OF_ARTICULATION,
    VOWEL_HEIGHT_LABELS,
    VOWEL_BACKNESS_LABELS,
    getVowelCoordinates,
    getAllConsonantSymbols,
    getAllVowelSymbols,
    getAllIPASymbols,
    isImpossibleCell,
};
