/**
 * GlyphPickerModal
 * ----------------
 * "Select existing glyph" — the modal behind the button that shipped `disabled`
 * with the title "(coming soon)". Without it the only way to put a glyph in a
 * second grapheme was to DRAW IT AGAIN, which is how a script ends up with six
 * subtly different copies of the same mark.
 *
 * It is the same grid as the Glyphs tab, in `EntityGallery`'s selection mode:
 * every card becomes ONE `<button>` that returns the glyph, and the delete
 * action is suppressed — a picker must not be able to destroy the thing the
 * user opened it to choose. That is the pattern `PunctuationPage` already uses
 * for graphemes; this is the second consumer, not a fourth gallery.
 *
 * A modal and not a route on purpose (open decision 7): choosing a glyph
 * happens WHILE composing a grapheme, and a navigation would discard the
 * half-filled form behind it.
 */

import { useCallback, useMemo } from 'react';

import Modal from 'cyber-components/container/modal/modal';
import type { SortOption } from 'cyber-components/display/dataGallery';

import { useEtymolog, type Glyph, type GlyphWithUsage } from '../../../db';
import GlyphCard from '../../display/glyphs/glyphCard';
import {
    DialogPanel,
    EntityGallery,
    useGalleryState,
    type GalleryAdapters,
} from '../../shared';

export interface GlyphPickerModalProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Called with the chosen glyph. The modal closes itself first. */
    onSelect: (glyph: Glyph) => void;
    /**
     * Glyph ids already on the grapheme. They stay VISIBLE (so the user can see
     * what is in play) but are not selectable — picking one again would be a
     * silent no-op, and a control that does nothing is worse than a disabled one.
     */
    excludeIds?: readonly number[];
}

const SORT_OPTIONS: SortOption[] = [
    { value: 'name-asc', displayComponent: <span>Name (A-Z)</span> },
    { value: 'name-desc', displayComponent: <span>Name (Z-A)</span> },
    { value: 'usage-desc', displayComponent: <span>Most used</span> },
];

const ADAPTERS: GalleryAdapters<GlyphWithUsage> = {
    search: (glyph, query) =>
        glyph.name.toLowerCase().includes(query) ||
        (glyph.category ?? '').toLowerCase().includes(query),
    sort: (a, b, sortBy) => {
        switch (sortBy) {
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'usage-desc':
                return (b.usageCount ?? 0) - (a.usageCount ?? 0);
            default:
                return 0;
        }
    },
};

export default function GlyphPickerModal({
    isOpen,
    setIsOpen,
    onSelect,
    excludeIds,
}: GlyphPickerModalProps) {
    const { data, isReady, error } = useEtymolog();
    const state = useGalleryState({ defaultSort: 'name-asc', defaultViewMode: 'compact' });

    const taken = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

    const items = useMemo(
        () => (data.glyphsWithUsage ?? []).filter((glyph) => !taken.has(glyph.id)),
        [data.glyphsWithUsage, taken],
    );

    const handleSelect = useCallback(
        (glyph: GlyphWithUsage) => {
            // Close FIRST, then hand the glyph up: the parent's state update
            // re-renders the form behind the modal, and doing that while the
            // modal is still mounted unmounts it mid-transition.
            setIsOpen(false);
            const { usageCount: _usageCount, ...plain } = glyph;
            onSelect(plain as Glyph);
        },
        [onSelect, setIsOpen],
    );

    const renderItem = useCallback(
        (glyph: GlyphWithUsage) => <GlyphCard glyph={glyph} interactionMode="none" hideDelete />,
        [],
    );

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen} allowClose>
            <DialogPanel size="lg" title="Select an existing glyph">
                <EntityGallery<GlyphWithUsage>
                    items={items}
                    state={state}
                    adapters={ADAPTERS}
                    keyExtractor={(glyph) => glyph.id}
                    renderItem={renderItem}
                    itemLabel={(glyph) => `Add glyph ${glyph.name}`}
                    selectionMode
                    onSelect={handleSelect}
                    ariaLabel="Glyph picker"
                    isReady={isReady}
                    error={error ?? null}
                    searchPlaceholder="Search glyphs by name or category…"
                    sortOptions={SORT_OPTIONS}
                    showViewToggle={false}
                    minItemWidth="140px"
                    empty={{
                        icon: 'pencil',
                        title: taken.size > 0 ? 'No other glyphs' : 'No glyphs yet',
                        description:
                            taken.size > 0
                                ? 'Every glyph you have drawn is already on this grapheme. Use "Add new glyph" to draw another.'
                                : 'Draw one with "Add new glyph" — it will be reusable here afterwards.',
                    }}
                    noMatch={{
                        title: 'No glyphs match',
                        description: 'No glyph name or category matches the current search.',
                    }}
                />
            </DialogPanel>
        </Modal>
    );
}
