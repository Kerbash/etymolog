import classNames from 'classnames';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import QuickFactsRow, { type QuickFact } from 'cyber-components/display/quickFactsRow';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon';

import styles from './PageHeader.module.scss';

export interface Crumb {
    /** Route to navigate to. The LAST crumb's `to` is ignored (it is the page). */
    to: string;
    label: ReactNode;
}

export interface PageHeaderProps {
    /** The page title. */
    title: ReactNode;
    /**
     * Heading level. `h2` by default because the app shell owns the page `h1`
     * (the conlang name). Pass `h1` on standalone pages that have no shell.
     */
    as?: 'h1' | 'h2';
    /** One line of supporting copy under the title. */
    description?: ReactNode;
    /**
     * Right-aligned action slot (buttons, links). Wraps under the title block
     * on narrow viewports rather than overflowing.
     */
    actions?: ReactNode;
    /**
     * Breadcrumb trail. Rendered as `<nav aria-label="Breadcrumb"><ol>`; the
     * last entry is the CURRENT page and is rendered as plain text carrying
     * `aria-current="page"` — a link to where you already are is a dead control
     * that screen-reader users have to skip.
     */
    breadcrumb?: Crumb[];
    /**
     * A single "back to X" link, for pages reached from one place. Mutually
     * useful with `breadcrumb` but usually redundant — pick one.
     */
    back?: { to: string; label: ReactNode };
    /** Optional stat strip under the header, rendered with cyber QuickFactsRow. */
    facts?: QuickFact[];
    className?: string;
}

/**
 * PageHeader — the top block of every page: optional back/breadcrumb nav, the
 * title, a description, an action row, and an optional facts strip.
 *
 * It exists because the app had eight hand-rolled back-nav rows (each hard-
 * navigating to a fixed route, so "back" from a deep page landed on the wrong
 * tab) and four copies of a `.nav → .pageTitle → .description → .statsBar`
 * skeleton in four near-identical SCSS files.
 *
 * Not built on cyber's `breadcrumb` / `backButton`: both reach `next/link` and
 * `next/navigation` transitively, and this app has no `next` dependency — they
 * fail at RESOLVE time, not render time. The react-router `Link` equivalents
 * live here.
 *
 * @example
 * ```tsx
 * <PageHeader
 *     title="Lexicon"
 *     description="Every word in your language."
 *     facts={[{ label: 'Words', value: words.length, big: true }]}
 *     actions={<Button as={Link} to={ROUTES.lexiconCreate}>New word</Button>}
 * />
 * ```
 */
export default function PageHeader({
    title,
    as = 'h2',
    description,
    actions,
    breadcrumb,
    back,
    facts,
    className,
}: PageHeaderProps) {
    const Heading = as;

    return (
        <header className={classNames(styles.header, className)}>
            {breadcrumb && breadcrumb.length > 0 && (
                <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
                    <ol className={styles.crumbList}>
                        {breadcrumb.map((crumb, i) => {
                            const isLast = i === breadcrumb.length - 1;
                            return (
                                <li key={i} className={styles.crumb}>
                                    {isLast ? (
                                        <span aria-current="page" className={styles.crumbCurrent}>
                                            {crumb.label}
                                        </span>
                                    ) : (
                                        <Link to={crumb.to} className={styles.crumbLink}>
                                            {crumb.label}
                                        </Link>
                                    )}
                                    {!isLast && (
                                        <SvgIcon
                                            iconName="chevron-right"
                                            className={styles.crumbSeparator}
                                            aria-hidden="true"
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            )}

            {back && (
                <Link to={back.to} className={styles.back}>
                    <SvgIcon iconName="arrow-left" aria-hidden="true" />
                    <span>{back.label}</span>
                </Link>
            )}

            <div className={styles.titleRow}>
                <div className={styles.titleBlock}>
                    <Heading className={styles.title}>{title}</Heading>
                    {description != null && <p className={styles.description}>{description}</p>}
                </div>
                {actions != null && <div className={styles.actions}>{actions}</div>}
            </div>

            {facts && facts.length > 0 && <QuickFactsRow items={facts} className={styles.facts} />}
        </header>
    );
}
