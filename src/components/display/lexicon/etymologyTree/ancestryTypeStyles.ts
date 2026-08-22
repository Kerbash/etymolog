/**
 * Ancestry-type → the class that paints it, in ONE place.
 *
 * The tree used to carry the colours as inline `style={{ backgroundColor:
 * 'var(--status-info)' }}` objects in two files — the legend listed six
 * literals and `EtymologyTreeNode` repeated the same map for badges and
 * connectors, so the legend and the tree could disagree about what "borrowed"
 * looks like. They are CSS modifier classes now: one stylesheet owns the
 * mapping, and every consumer reads it from here.
 */

import type { AncestryType } from '../../../../db/types';

import styles from './EtymologyTree.module.scss';

/** Modifier class for a node/badge/connector of the given ancestry type. */
export const ANCESTRY_TYPE_CLASS: Record<AncestryType, string> = {
    derived: styles.typeDerived,
    borrowed: styles.typeBorrowed,
    compound: styles.typeCompound,
    blend: styles.typeBlend,
    calque: styles.typeCalque,
    other: styles.typeOther,
};

/** The class for an entry with no ancestry type (the tree's root). */
export const ANCESTRY_TYPE_NONE_CLASS = styles.typeNone;

/** `type → class`, falling back to the neutral "no type" class. */
export function ancestryTypeClass(type: AncestryType | null | undefined): string {
    return type ? ANCESTRY_TYPE_CLASS[type] : ANCESTRY_TYPE_NONE_CLASS;
}

/**
 * The legend, in display order. `color` is a TOKEN name, handed to
 * `MiniIconCard`'s `iconColor` — the swatch is an icon, so it cannot take a
 * class; a token string is still theme-following, which a hex would not be.
 */
export const ANCESTRY_LEGEND: ReadonlyArray<{
    type: AncestryType;
    label: string;
    color: string;
    description: string;
}> = [
    {
        type: 'derived',
        label: 'Derived',
        color: 'var(--status-info)',
        description: 'Grew out of the ancestor within the language',
    },
    {
        type: 'borrowed',
        label: 'Borrowed',
        color: 'var(--status-warning)',
        description: 'Taken from another language',
    },
    {
        type: 'compound',
        label: 'Compound',
        color: 'var(--status-good)',
        description: 'Built by joining whole words',
    },
    {
        type: 'blend',
        label: 'Blend',
        color: 'var(--interactive-base)',
        description: 'Parts of two words fused together',
    },
    {
        type: 'calque',
        label: 'Calque',
        color: 'var(--status-neutral)',
        description: 'A piece-by-piece translation of a foreign word',
    },
    {
        type: 'other',
        label: 'Other',
        color: 'var(--text-secondary)',
        description: 'Any relationship the list above does not cover',
    },
];
