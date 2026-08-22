/**
 * IPA Chart Display Components
 *
 * Components for rendering interactive IPA (International Phonetic Alphabet)
 * charts with support for grapheme assignment display.
 *
 * @module display/ipaChart
 */

export { default as IPAChartCell } from './IPAChartCell';
export { default as IPAConsonantChart } from './IPAConsonantChart';
export { default as IPAVowelChart } from './IPAVowelChart';
export { default as IPAExtraSoundsChart } from './IPAExtraSoundsChart';
export type { IPAExtraSoundsChartProps } from './IPAExtraSoundsChart';
export { default as IPACombinedChart } from './IPACombinedChart';
export { default as IPASyllabaryChart } from './IPASyllabaryChart';

// The flavour guide overlay (Phase 4 of the word generator).
export { default as GuidePicker } from './GuidePicker';
export type { GuidePickerProps } from './GuidePicker';
export { default as GuideLegend } from './GuideLegend';
export type { GuideLegendProps } from './GuideLegend';
export { useGuidePreset } from './useGuidePreset';
export type { GuidePresetState } from './useGuidePreset';
export * from './guideTiers';

export * from './types';
