/**
 * GuideIndex — the `/guide` landing page: a short intro, the three "start here"
 * walk-throughs as prominent cards, then the comprehensive reference grouped by
 * topic. Every card links to its own page.
 */

import { Link } from 'react-router-dom';

import { GUIDE_GROUPS, guideSectionsInGroup, guideSectionPath } from './guideContent';
import styles from './GuidePage.module.scss';

export default function GuideIndex() {
    return (
        <>
            <p className={styles.lead}>
                New here? Start with one of the three walk-throughs. Once you know your way around,
                the reference below covers every part of Etymolog in detail.
            </p>
            {GUIDE_GROUPS.map((group) => {
                const sections = guideSectionsInGroup(group.id);
                if (sections.length === 0) return null;
                return (
                    <section key={group.id} className={styles.indexGroup} aria-label={group.label}>
                        <h2 className={styles.indexGroupTitle}>{group.label}</h2>
                        <div className={styles.cardGrid}>
                            {sections.map((section) => (
                                <Link key={section.slug} to={guideSectionPath(section.slug)} className={styles.card}>
                                    <span className={styles.cardTitle}>{section.title}</span>
                                    <span className={styles.cardTagline}>{section.tagline}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                );
            })}
        </>
    );
}
