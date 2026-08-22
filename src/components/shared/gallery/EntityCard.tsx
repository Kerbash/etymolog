import classNames from 'classnames';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import styles from './EntityCard.module.scss';

export interface EntityCardProps {
    /**
     * Accessible name of the clickable region — `Kato` / `Delete grapheme ka`.
     * Required: a card whose only name is its rendered body reads as a wall of
     * text in a screen reader's control list.
     */
    label: string;
    /** Route the card navigates to. Renders the region as a react-router `Link`. */
    to?: string;
    /**
     * Click handler. Renders the region as a `<button type="button">`. Used by
     * selection mode (a picker returns the item rather than navigating).
     * Ignored when `to` is set.
     */
    onActivate?: () => void;
    /**
     * Row of controls rendered BELOW the clickable region, as its sibling.
     * Never place an interactive element in `children` — that is the nesting
     * bug this component exists to remove.
     */
    actions?: ReactNode;
    /** Tighter chrome for the compact view mode. */
    compact?: boolean;
    /** The card body — the entity's display component. Non-interactive. */
    children: ReactNode;
    className?: string;
}

/**
 * EntityCard — one card, one hit area, actions on the outside.
 *
 * ```
 *  ┌───────────────────────────────┐
 *  │  <Link> or <button>           │  ← the ONE interactive region
 *  │    …entity display…           │
 *  ├───────────────────────────────┤
 *  │                    [⋯] [🗑]   │  ← actions, a SIBLING of the region
 *  └───────────────────────────────┘
 * ```
 *
 * Replaces three copies of a `<div role="button" tabIndex={0}>` that carried
 * `onMouseEnter`/`onMouseLeave` handlers writing inline `transform` and
 * `boxShadow`, and contained an absolutely-positioned delete `<button>`. That
 * shape had four separate defects — no `:focus-visible` affordance, a hover
 * effect keyboard users never saw, a nested interactive element, and per-pointer-
 * move style recalculation — all of which are CSS problems solved in CSS here.
 */
export default function EntityCard({
    label,
    to,
    onActivate,
    actions,
    compact = false,
    children,
    className,
}: EntityCardProps) {
    const interactive = Boolean(to || onActivate);

    const body = to ? (
        <Link to={to} aria-label={label} className={styles.hit}>
            {children}
        </Link>
    ) : onActivate ? (
        <button type="button" aria-label={label} className={styles.hit} onClick={onActivate}>
            {children}
        </button>
    ) : (
        <div className={classNames(styles.hit, styles.hitStatic)}>{children}</div>
    );

    return (
        <article
            className={classNames(
                styles.card,
                compact && styles.compact,
                !interactive && styles.static,
                className,
            )}
        >
            {body}
            {actions != null && <div className={styles.actions}>{actions}</div>}
        </article>
    );
}
