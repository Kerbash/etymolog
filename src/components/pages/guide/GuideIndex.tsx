/**
 * GuideIndex — the `/guide` landing page: a short intro and one card per
 * writing-system family, each linking to its own walk-through page.
 */

import { Link } from 'react-router-dom';

import { GUIDE_SECTIONS, guideSectionPath } from './guideContent';
import styles from './GuidePage.module.scss';

export default function GuideIndex() {
    return (
        <>
            <p className={styles.lead}>
                Etymolog can build the three main kinds of writing system. Pick the one you want and
                follow the steps.
            </p>
            <div className={styles.cardGrid}>
                {GUIDE_SECTIONS.map((section) => (
                    <Link key={section.slug} to={guideSectionPath(section.slug)} className={styles.card}>
                        <span className={styles.cardTitle}>{section.title}</span>
                        <span className={styles.cardTagline}>{section.tagline}</span>
                    </Link>
                ))}
            </div>
        </>
    );
}
