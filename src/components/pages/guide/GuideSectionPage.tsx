/**
 * GuideSectionPage — one guide page at `/guide/<slug>`. The heading and tagline
 * come from `GUIDE_SECTIONS`; the body is picked by the section's group (each
 * group has one body component that switches on the slug). An unknown slug (a
 * stale link) bounces to the overview, and a "Next" link threads through the
 * whole ordered list.
 */

import type { FC } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { ROUTES } from '../../../url_mapping';
import { GUIDE_SECTIONS, guideSectionPath } from './guideContent';
import GuideSectionBody from './GuideSectionBody';
import SignsBody from './sections/SignsBody';
import ChartsBody from './sections/ChartsBody';
import WritingBody from './sections/WritingBody';
import BlocksBody from './sections/BlocksBody';
import WordsBody from './sections/WordsBody';
import ToolsBody from './sections/ToolsBody';
import styles from './GuidePage.module.scss';

/** Each group's body component. Not exported, so this stays a component module. */
const GROUP_BODY: Record<string, FC<{ slug: string }>> = {
    start: GuideSectionBody,
    signs: SignsBody,
    charts: ChartsBody,
    writing: WritingBody,
    blocks: BlocksBody,
    words: WordsBody,
    tools: ToolsBody,
};

export default function GuideSectionPage() {
    const { slug } = useParams<{ slug: string }>();
    const index = GUIDE_SECTIONS.findIndex((section) => section.slug === slug);
    if (index === -1) return <Navigate to={ROUTES.guide} replace />;

    const section = GUIDE_SECTIONS[index];
    const next = GUIDE_SECTIONS[index + 1];
    const Body = GROUP_BODY[section.group] ?? GuideSectionBody;

    return (
        <article className={styles.section} aria-labelledby="guide-section-title">
            <h2 id="guide-section-title" className={styles.sectionTitle}>{section.title}</h2>
            <p className={styles.sectionTagline}>{section.tagline}</p>
            <div className={styles.sectionBody}>
                <Body slug={section.slug} />
            </div>
            {next && (
                <p className={styles.nextLink}>
                    Next: <Link to={guideSectionPath(next.slug)}>{next.title}</Link>
                </p>
            )}
        </article>
    );
}
