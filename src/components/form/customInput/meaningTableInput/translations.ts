/**
 * `MeaningTableInput`'s translation map, in its own module.
 *
 * Split out of the `.tsx` so that file exports a COMPONENT and nothing else:
 * `react-refresh/only-export-components` is warning about a real Fast Refresh
 * failure — a module that mixes a component with plain constants gets fully
 * remounted on every edit, dropping the row state the input is holding.
 */

export const defaultTranslationMap = {
    addMeaning: 'Add Meaning',
    removeMeaning: 'Remove',
    meaningLabel: 'Meaning',
    partOfSpeechLabel: 'Part of Speech',
    usageNotesLabel: 'Usage Notes',
};

export const translationMapKeys = Object.keys(defaultTranslationMap);
