/**
 * ChartPageLayout
 * ---------------
 * The ONE skeleton behind the four chart pages (IPA, syllabary, punctuation,
 * custom charts).
 *
 * ```
 *  ← Back to Graphemes
 *  IPA chart                                        [ actions ]
 *  Click a sound to create or edit its grapheme.
 *  ┌ SOUNDS ASSIGNED ─┬ ────────────────┐            ← QuickFactsRow
 *  │ 12               │ …               │
 *  └──────────────────┴─────────────────┘
 *  ┌──────────────────────────────────────┐
 *  │  the chart (scrolls inside itself)   │
 *  └──────────────────────────────────────┘
 *  › About this chart                                ← collapsed by default
 * ```
 *
 * The four pages were four copies of the same TSX skeleton over four
 * near-identical `.module.scss` files — `.nav`, `.pageTitle`, `.description`,
 * `.statsBar`, `.stat`, `.infoSection`, `.loading`, `.loadingText`, `.error`,
 * `.errorText`, once each, differing only in a colour here and a gap there.
 *
 * Two behavioural fixes come with the consolidation:
 *
 *  - the explainer is COLLAPSED. It used to sit permanently expanded between
 *    the stats and the chart, so the first thing a user saw on a chart page was
 *    a paragraph about how to read a chart they had to scroll to reach.
 *  - loading and error are the shared primitives — a chart-shaped skeleton and
 *    an `EmptyState` with a Retry, instead of the strings "Loading IPA
 *    Chart..." and "Failed to load chart: …" with no way to act on either.
 */

import type { ReactNode } from 'react';

import type { QuickFact } from 'cyber-components/display/quickFactsRow';
import EmptyState from 'cyber-components/display/emptyState';
import ExpandableContainer from 'cyber-components/container/expandableContainer/expandableContainer';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { LoadingState, PageHeader } from '../../../shared';

import styles from './chartPage.module.scss';

export interface ChartPageLayoutProps {
    title: ReactNode;
    description?: ReactNode;
    /** Where the back link goes. Defaults to the grapheme gallery. */
    back: { to: string; label: ReactNode };
    /** Right-aligned header actions (a "Create chart" button, …). */
    actions?: ReactNode;
    /** Stat strip under the header. */
    facts?: QuickFact[];
    /** `false` while the database is booting. */
    isReady?: boolean;
    /** A failure to load. Rendered as an `EmptyState` with the retry below. */
    error?: Error | null;
    /** Wired to the error state's Retry button. Omit to hide it. */
    onRetry?: () => void;
    /**
     * Rendered UNDER the chart box and outside it — a legend, a note, anything
     * that explains the chart and must not scroll, pan or zoom away with it.
     * Hidden along with the chart while loading or on error, because a key to
     * something that is not on screen explains nothing.
     */
    belowChart?: ReactNode;
    /** The "About this chart" body. Collapsed until the user asks for it. */
    about?: ReactNode;
    /** Label on the collapsed explainer. */
    aboutLabel?: string;
    /**
     * `id` on the explainer's wrapper, so a control elsewhere on the page can
     * point at it with `aria-controls`, scroll it into view and MOVE FOCUS to
     * it. Supplying one also makes the wrapper focusable (`tabIndex={-1}`) —
     * programmatically only, never in the tab order.
     */
    aboutId?: string;
    /**
     * Controlled open state for the explainer. Omit for the default
     * (uncontrolled, collapsed) behaviour — pass both of these when something
     * else on the page needs to OPEN it, as the guide legend's "Why it sounds
     * like this" does.
     */
    aboutOpen?: boolean;
    onAboutOpenChange?: (open: boolean) => void;
    /** The chart itself. */
    children: ReactNode;
}

export default function ChartPageLayout({
    title,
    description,
    back,
    actions,
    facts,
    isReady = true,
    error,
    onRetry,
    belowChart,
    about,
    aboutLabel = 'About this chart',
    aboutId,
    aboutOpen,
    onAboutOpenChange,
    children,
}: ChartPageLayoutProps) {
    return (
        <div className={styles.page}>
            <PageHeader
                title={title}
                as="h2"
                description={description}
                back={back}
                actions={actions}
                facts={facts}
            />

            {error ? (
                <EmptyState
                    icon="exclamation-triangle"
                    title="This chart could not be loaded"
                    description={error.message}
                    action={
                        onRetry ? (
                            <Button
                                type="button"
                                className={buttonStyles.primary}
                                onClick={onRetry}
                            >
                                Try again
                            </Button>
                        ) : undefined
                    }
                />
            ) : !isReady ? (
                <LoadingState variant="page" label="Loading the chart" />
            ) : (
                /* The chart scrolls INSIDE this box. A wide table must never be
                   what makes the whole page scroll sideways — on a phone that
                   moves the header and the nav off-screen with it. */
                <>
                    <div className={styles.chartArea}>{children}</div>
                    {belowChart}
                </>
            )}

            {about && (
                <div id={aboutId} tabIndex={aboutId ? -1 : undefined}>
                    <ExpandableContainer
                        main={<span className={styles.aboutToggle}>{aboutLabel}</span>}
                        defaultIsOpen={false}
                        isOpen={aboutOpen}
                        setIsOpen={onAboutOpenChange}
                        parts={{ content: { className: styles.aboutBody } }}
                    >
                        {about}
                    </ExpandableContainer>
                </div>
            )}
        </div>
    );
}
