/**
 * The translation map lives in its own module, away from the component.
 *
 * A `.tsx` that exports both a component and a plain constant defeats
 * react-refresh: the whole module is treated as non-component and remounts on
 * every edit, dropping the row state the input is holding. That is what
 * `react-refresh/only-export-components` is warning about, and the same split
 * the notification and confirm providers already use.
 */

export const defaultTranslationMap = {
    addPronunciation: "Add Pronunciation",
    removePronunciation: "Remove",
    pronunciationLabel: "Pronunciation",
    useInAutoSpellingLabel: "Use in auto-spelling",
};

export const translationMapKeys = Object.keys(defaultTranslationMap);

export type PronunciationTranslationMap = typeof defaultTranslationMap;
