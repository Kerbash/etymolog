/**
 * GraphemePickerModal
 * -------------------
 * "Choose an existing grapheme" — the grapheme twin of `GlyphPickerModal`, and
 * the same pattern `PunctuationPage` already uses: the Script Maker's own
 * `GraphemeGallery` in selection mode, where every card becomes ONE button that
 * returns the grapheme and the delete action is suppressed.
 *
 * Used by the word form's Logogram tab to make an existing grapheme the whole
 * spelling of a word, and by the Blocks page to choose the vowel-killer mark.
 * A filter narrows the grid by KIND (`logogramOption.ts`): "Word symbols"
 * (logograms), "Marks" (no-sound signs added to other signs) or "All". A
 * filter whose list would be empty is not shown (All always is), and an
 * asked-for filter with nothing in it falls back to All. `hideMarks` leaves
 * marks out entirely — the Logogram tab never offers a mark as a word.
 *
 * A modal and not a route for the same reason as the glyph picker: choosing
 * happens WHILE filling a form, and a navigation would discard it.
 */

import { useCallback, useMemo, useState } from 'react';
import classNames from 'classnames';

import Modal from 'cyber-components/container/modal/modal';

import { useEtymolog, type GraphemeComplete } from '../../../db';
import GraphemeGallery from '../../tabs/grapheme/galleryGrapheme/graphemeGallery';
import { DialogPanel } from '../../shared';
import { isLogogramGrapheme, isMarkGrapheme } from './logogramOption';

import styles from './graphemeFormFields.module.scss';

export type GraphemePickerFilter = 'logograms' | 'marks' | 'all';

export interface GraphemePickerModalProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Called with the chosen grapheme. The modal closes itself first. */
    onSelect: (grapheme: GraphemeComplete) => void;
    /** Dialog title. */
    title?: string;
    /**
     * Which graphemes to show first. Defaults to word symbols (logograms) when
     * the script has any, otherwise every grapheme. A filter with nothing in
     * it falls back to All (an empty grid is a dead end).
     */
    defaultFilter?: GraphemePickerFilter;
    /**
     * Leave marks out entirely: no "Marks" filter and no marks under "All".
     * For choosers where a mark makes no sense (a word's whole spelling).
     */
    hideMarks?: boolean;
}

const FILTER_LABELS: Record<GraphemePickerFilter, string> = {
    logograms: 'Word symbols',
    marks: 'Marks',
    all: 'All',
};

export default function GraphemePickerModal({
    isOpen,
    setIsOpen,
    onSelect,
    title = 'Choose a grapheme',
    defaultFilter,
    hideMarks = false,
}: GraphemePickerModalProps) {
    const { data } = useEtymolog();
    const lists = useMemo(() => {
        const every = data.graphemesComplete ?? [];
        const marks = hideMarks ? [] : every.filter(isMarkGrapheme);
        return {
            logograms: every.filter(isLogogramGrapheme),
            marks,
            all: hideMarks ? every.filter((g) => !isMarkGrapheme(g)) : every,
        } satisfies Record<GraphemePickerFilter, GraphemeComplete[]>;
    }, [data.graphemesComplete, hideMarks]);

    // `null` until the user presses a filter: the default is DERIVED from the
    // current lists, so a picker mounted before the data loaded (or before a
    // logogram existed) still opens on the right one.
    const [chosenFilter, setFilter] = useState<GraphemePickerFilter | null>(null);
    const filter = chosenFilter ?? defaultFilter ?? (lists.logograms.length > 0 ? 'logograms' : 'all');
    // A filter whose list is empty is hidden — so it is never the one shown
    // (asked for by `defaultFilter`, or emptied by a delete elsewhere).
    const visibleFilters = (['logograms', 'marks', 'all'] as const).filter(
        (value) => value === 'all' || lists[value].length > 0,
    );
    const activeFilter: GraphemePickerFilter = lists[filter].length > 0 ? filter : 'all';

    const handleSelect = useCallback(
        (grapheme: GraphemeComplete) => {
            // Close FIRST, then hand the grapheme up (see GlyphPickerModal).
            setIsOpen(false);
            onSelect(grapheme);
        },
        [onSelect, setIsOpen],
    );

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen} allowClose>
            <DialogPanel size="lg" title={title}>
                <div className={styles.pickerFilter} role="group" aria-label="Which graphemes to show">
                    {visibleFilters.map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={activeFilter === value}
                            data-picker-filter={value}
                            className={classNames(styles.pickerFilterButton, {
                                [styles.pickerFilterActive]: activeFilter === value,
                            })}
                            onClick={() => setFilter(value)}
                        >
                            {`${FILTER_LABELS[value]} (${lists[value].length})`}
                        </button>
                    ))}
                </div>
                <GraphemeGallery
                    selectionMode
                    graphemes={lists[activeFilter]}
                    onSelect={handleSelect}
                />
            </DialogPanel>
        </Modal>
    );
}
