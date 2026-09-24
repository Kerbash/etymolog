/**
 * GlyphListEditor
 * ---------------
 * ONE form's ordered glyph list: the reorderable rows (pointer drag AND
 * keyboard, via cyber `ReorderableList`), an edit LINK per glyph (a sibling of
 * the card, never inside it — no nested anchors), Remove, and the two ways to
 * add a glyph — "Add new glyph" (draw it in {@link NewGlyphModal}) and "Select
 * existing glyph" ({@link GlyphPickerModal}).
 *
 * Shared by the grapheme form's default-form section and by every "other form"
 * card in `VariantsSection`, so the two cannot drift. It is controlled: the
 * owner holds the list and receives the next one through `onChange`.
 *
 * A glyph can appear at most once per list (the picker greys out what is
 * already there). The SAME glyph may appear in several forms of one grapheme —
 * that is the point of schema v9's `UNIQUE(variant_id, glyph_id, position)`.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import ReorderableList from "cyber-components/interactable/reorderableList";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import Button, { buttonStyles } from "cyber-components/interactable/buttons/button";
import SvgIcon from "cyber-components/graphics/decor/svgIcon/svgIcon";

import type { Glyph, GlyphWithUsage } from "../../../db";
import { ROUTES, resolveUrl } from "../../../url_mapping";
import GlyphCard from "../../display/glyphs/glyphCard/glyphCard";
import NewGlyphModal from "../../tabs/grapheme/newGlyph/NewGlyphModal.tsx";
import GlyphPickerModal from "./GlyphPickerModal";

import styles from "./glyphListEditor.module.scss";

export interface GlyphListEditorProps {
    /** The list, in writing order. */
    glyphs: Glyph[];
    /** Receives the next list (after an add, a remove or a reorder). */
    onChange: (next: Glyph[]) => void;
    /** Accessible name of the list, e.g. "Glyphs of the form "head", in writing order". */
    listLabel: string;
    /** Shown instead of the list when it is empty. */
    emptyText: string;
    /** What the glyphs belong to, for the Remove button's label ("this grapheme", "the form "head""). */
    ownerLabel?: string;
    /**
     * Called after a glyph was added, with whether it was the list's first —
     * the default form uses it to seed the grapheme's name and category.
     */
    onGlyphAdded?: (glyph: Glyph, wasFirst: boolean) => void;
    /**
     * Disable Remove on the last remaining glyph. The default form of a stored
     * grapheme can never be empty ("a grapheme needs at least one glyph"), so
     * the control that would make it so is off rather than failing on save.
     */
    preventRemovingLast?: boolean;
}

/** `GlyphCard` wants a usage count; inside the form there is nothing to count. */
function toGlyphWithUsage(glyph: Glyph): GlyphWithUsage {
    return { ...glyph, usageCount: 0 };
}

export default function GlyphListEditor({
    glyphs,
    onChange,
    listLabel,
    emptyText,
    ownerLabel = "this grapheme",
    onGlyphAdded,
    preventRemovingLast = false,
}: GlyphListEditorProps) {
    const [isNewGlyphOpen, setIsNewGlyphOpen] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const addGlyph = useCallback(
        (glyph: Glyph) => {
            if (glyphs.some((g) => g.id === glyph.id)) return;
            onChange([...glyphs, glyph]);
            onGlyphAdded?.(glyph, glyphs.length === 0);
        },
        [glyphs, onChange, onGlyphAdded],
    );

    const removeGlyph = useCallback(
        (glyphId: number) => onChange(glyphs.filter((g) => g.id !== glyphId)),
        [glyphs, onChange],
    );

    const handleReorder = useCallback(
        (newOrderIds: string[]) => {
            const byId = new Map(glyphs.map((glyph) => [String(glyph.id), glyph]));
            onChange(
                newOrderIds
                    .map((id) => byId.get(id))
                    .filter((glyph): glyph is Glyph => glyph !== undefined),
            );
        },
        [glyphs, onChange],
    );

    const selectedIds = useMemo(() => glyphs.map((g) => g.id), [glyphs]);
    const removeLocked = preventRemovingLast && glyphs.length <= 1;

    return (
        <div className={styles.glyphSelectionBox}>
            {glyphs.length === 0 ? (
                <p className={styles.emptyState}>{emptyText}</p>
            ) : (
                <>
                    <p className={styles.orderHint}>
                        Drag a glyph, or focus its grip and use the arrow keys, to change the
                        order they are written in.
                    </p>
                    <ReorderableList<Glyph>
                        items={glyphs}
                        getId={(glyph) => String(glyph.id)}
                        onReorder={handleReorder}
                        aria-label={listLabel}
                        className={styles.glyphList}
                        renderItem={({ item, index, dragHandleProps }) => (
                            <div className={styles.glyphRow}>
                                <span
                                    {...dragHandleProps}
                                    className={styles.dragHandle}
                                    aria-label={`Reorder ${item.name}, position ${index + 1} of ${glyphs.length}`}
                                >
                                    <SvgIcon iconName="grip-vertical" aria-hidden="true" />
                                </span>

                                <span className={styles.glyphPosition}>{index + 1}</span>

                                <GlyphCard
                                    glyph={toGlyphWithUsage(item)}
                                    interactionMode="none"
                                    hideDelete
                                />

                                {/* Siblings of the card, never inside it. */}
                                <div className={styles.glyphRowActions}>
                                    <IconButton
                                        as={Link}
                                        to={resolveUrl(ROUTES.glyphEdit, { id: item.id })}
                                        iconName="pencil"
                                        aria-label={`Edit glyph ${item.name}`}
                                    />
                                    <IconButton
                                        type="button"
                                        iconName="x-lg"
                                        onClick={() => removeGlyph(item.id)}
                                        disabled={removeLocked}
                                        title={removeLocked ? "A form needs at least one glyph" : undefined}
                                        aria-label={`Remove glyph ${item.name} from ${ownerLabel}`}
                                    />
                                </div>
                            </div>
                        )}
                    />
                </>
            )}

            <div className={styles.glyphButtons}>
                <IconButton
                    iconName="plus-lg"
                    type="button"
                    onClick={() => setIsNewGlyphOpen(true)}
                    className={buttonStyles.primary}
                >
                    Add new glyph
                </IconButton>
                <Button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    className={buttonStyles.secondary}
                >
                    Select existing glyph
                </Button>
            </div>

            <NewGlyphModal
                isOpen={isNewGlyphOpen}
                setIsOpen={setIsNewGlyphOpen}
                onGlyphCreated={addGlyph}
            />

            <GlyphPickerModal
                isOpen={isPickerOpen}
                setIsOpen={setIsPickerOpen}
                onSelect={addGlyph}
                excludeIds={selectedIds}
            />
        </div>
    );
}
