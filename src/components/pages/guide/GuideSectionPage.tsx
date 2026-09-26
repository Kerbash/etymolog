/**
 * GuideSectionPage — one writing-system walk-through at `/guide/<slug>`. The
 * heading and tagline come from `GUIDE_SECTIONS`; the steps from
 * `GuideSectionBody`. An unknown slug (a stale link) bounces to the overview.
 */

import { Link, Navigate, useParams } from 'react-router-dom';

import { ROUTES } from '../../../url_mapping';
import { GUIDE_SECTIONS, guideSectionPath } from './guideContent';
import GuideSectionBody from './GuideSectionBody';
import styles from './GuidePage.module.scss';

export default function GuideSectionPage() {
    const { slug } = useParams<{ slug: string }>();
    const index = GUIDE_SECTIONS.findIndex((section) => section.slug === slug);
    if (index === -1) return <Navigate to={ROUTES.guide} replace />;

    const section = GUIDE_SECTIONS[index];
    const next = GUIDE_SECTIONS[index + 1];

    return (
        <article className={styles.section} aria-labelledby="guide-section-title">
            <h2 id="guide-section-title" className={styles.sectionTitle}>{section.title}</h2>
            <p className={styles.sectionTagline}>{section.tagline}</p>
            <div className={styles.sectionBody}>
                <GuideSectionBody slug={section.slug} />
            </div>
            {next && (
                <p className={styles.nextLink}>
                    Next: <Link to={guideSectionPath(next.slug)}>{next.title}</Link>
                </p>
            )}
        </article>
    );
}
