import classNames from 'classnames';

import DotLoader from 'cyber-components/graphics/loading/dotLoader/dotLoader';
import Shimmer from 'cyber-components/graphics/loading/shimmer';

import styles from './LoadingState.module.scss';

export type LoadingStateVariant = 'page' | 'gallery' | 'form' | 'inline';

export interface LoadingStateProps {
    /**
     * Which skeleton to draw. Pick the one whose SHAPE matches what is about to
     * appear — a skeleton that does not match the incoming layout causes a
     * visible reflow, which is worse than no skeleton at all.
     *
     * - `page`    a title bar + a few text rows (a whole route);
     * - `gallery` a grid of cards (any of the three galleries);
     * - `form`    stacked label/field pairs;
     * - `inline`  a `DotLoader` for a short in-place wait (a button label, a
     *             translation in flight) where a skeleton would be too heavy.
     */
    variant: LoadingStateVariant;
    /** Screen-reader label. Default `'Loading'`. Say WHAT is loading when you can. */
    label?: string;
    /** Card/row count for the `gallery` and `form` variants. Default 6 / 4. */
    count?: number;
    className?: string;
}

/**
 * LoadingState — the app's only loading presentation.
 *
 * Replaces ten bare `Loading…` strings (and four differently-named `.loading` /
 * `.loadingText` SCSS blocks) with one component that (a) reserves the space the
 * content will occupy, so arrival does not shove the page, and (b) announces
 * itself: the wrapper is a `role="status"` region, which is what a screen reader
 * needs to say "loading" at all — a bare `<div>Loading…</div>` that is later
 * replaced is never announced.
 *
 * The `Shimmer` blocks themselves stay DECORATIVE (`aria-hidden` by default in
 * cyber-components): the region announces once, not once per bar.
 */
export default function LoadingState({
    variant,
    label = 'Loading',
    count,
    className,
}: LoadingStateProps) {
    const body = (() => {
        switch (variant) {
            case 'inline':
                // `DotLoader` hardcodes `role="status"` with no way to opt out,
                // so it is wrapped in an `aria-hidden` span: hiding an ancestor
                // removes the whole subtree from the accessibility tree,
                // including the nested live region. Without this the wrapper and
                // the dots would BOTH announce, and a screen reader would say
                // "Loading" twice for one wait.
                return (
                    <span aria-hidden="true">
                        <DotLoader />
                    </span>
                );

            case 'gallery': {
                const cards = count ?? 6;
                return (
                    <div className={styles.grid}>
                        {Array.from({ length: cards }).map((_, i) => (
                            <Shimmer key={i} height={120} radius="var(--radius-surface)" />
                        ))}
                    </div>
                );
            }

            case 'form': {
                const fields = count ?? 4;
                return (
                    <div className={styles.stack}>
                        {Array.from({ length: fields }).map((_, i) => (
                            <div key={i} className={styles.field}>
                                <Shimmer width="30%" height={14} radius="var(--radius-chip)" />
                                <Shimmer height={38} radius="var(--radius-control)" />
                            </div>
                        ))}
                    </div>
                );
            }

            case 'page':
            default:
                return (
                    <div className={styles.stack}>
                        <Shimmer width="40%" height={28} radius="var(--radius-chip)" />
                        <Shimmer width="70%" height={14} radius="var(--radius-chip)" />
                        <Shimmer height={180} radius="var(--radius-surface)" />
                    </div>
                );
        }
    })();

    return (
        <div
            role="status"
            aria-label={label}
            className={classNames(styles.root, styles[variant], className)}
        >
            {body}
        </div>
    );
}
