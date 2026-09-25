/**
 * PageContents — the "On this page" jump links shown under the Blocks page
 * header (BLOCK_PLACEMENT_PLAN.md §5).
 *
 * A wrapped row of chip links, one per section, in the page's own render
 * order. Each link is a REAL `<a href="#id">` (so it reads and copies as an
 * anchor, and works without JS), but its click is intercepted: instead of
 * letting the browser add `#id` to the URL — which the SPA router would treat
 * as navigation — it smooth-scrolls the target into view and moves keyboard
 * focus there, so the next Tab lands inside the section the user jumped to.
 *
 * Focus needs the target to be focusable: a `<section>` is not by default, so
 * `tabIndex = -1` is set on it just before `focus()` (programmatic focus only,
 * never a Tab stop). `preventScroll` stops `focus()` from fighting the smooth
 * scroll. `scrollIntoView` is optional-chained: happy-dom (tests) has no such
 * method, and a missing target id is simply ignored.
 *
 * NOT sticky — the page header is not sticky either; this is a plain row that
 * scrolls away with the rest of the page (§5).
 */

import type { MouseEvent } from 'react';

import styles from './blocksPage.module.scss';

/** One entry in the contents row: the target section id and its link text. */
export interface PageContentsLink {
    /** The `id` of the section this link jumps to (without the leading `#`). */
    id: string;
    /** The visible link text. */
    label: string;
}

export interface PageContentsProps {
    links: readonly PageContentsLink[];
}

export default function PageContents({ links }: PageContentsProps) {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
        // Keep the router out of it: never let the hash reach the URL.
        event.preventDefault();
        const target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        // A <section> is not focusable until it has a tabIndex; -1 makes it
        // programmatically focusable without becoming a Tab stop.
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
    };

    return (
        <nav aria-label="On this page" data-page-contents="" className={styles.contents}>
            {links.map((link) => (
                <a
                    key={link.id}
                    href={`#${link.id}`}
                    className={styles.contentsLink}
                    onClick={(event) => handleClick(event, link.id)}
                >
                    {link.label}
                </a>
            ))}
        </nav>
    );
}
