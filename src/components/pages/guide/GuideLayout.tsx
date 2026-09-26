/**
 * GuideLayout — the shell shared by every `/guide` page: the top bar (Back to
 * editor + title), the right-hand category menu, and an `<Outlet/>` for the
 * index or a section page.
 *
 * It is mounted OUTSIDE the app shell (a sibling of `/new`), so it is reading
 * material with its own "Back to editor" button rather than a tab. The menu is
 * real navigation now — each category is its own page (`/guide/<slug>`) — a
 * plain list on a wide screen that collapses behind a hamburger on a narrow one.
 */

import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { ROUTES } from '../../../url_mapping';
import { AppBackground } from '../../shell';
import { GUIDE_SECTIONS, GUIDE_FALLBACK_ROUTE, guideSectionPath } from './guideContent';
import styles from './GuidePage.module.scss';

export default function GuideLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    // "Back to editor": go to the editor page the guide was opened from — NOT
    // `navigate(-1)`, which after moving between guide pages just steps back to
    // the previous guide page. The header records the origin in route state;
    // captured ONCE (this layout stays mounted while the section pages swap
    // through its Outlet, so moving between sections never loses it), and any
    // guide/unknown origin falls back to the lexicon.
    const [origin] = useState(() => {
        const from = (location.state as { from?: string } | null)?.from;
        return from && !from.startsWith(ROUTES.guide) ? from : GUIDE_FALLBACK_ROUTE;
    });
    const backToEditor = () => navigate(origin);

    const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
        classNames(styles.menuLink, { [styles.menuLinkActive]: isActive });

    return (
        <AppBackground className={styles.page}>
            <div className={styles.bar}>
                <Button className={buttonStyles.secondary} onClick={backToEditor} data-back-to-editor="">
                    ← Back to editor
                </Button>
                <h1 className={styles.title}>Guide</h1>
                <IconButton
                    iconName="list"
                    className={styles.menuToggle}
                    aria-label="Guide contents"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                />
            </div>

            <div className={styles.body}>
                <main className={styles.content}>
                    <Outlet />
                </main>

                <aside className={styles.menu}>
                    <nav
                        className={classNames(styles.menuList, { [styles.menuListOpen]: menuOpen })}
                        aria-label="Guide categories"
                        data-guide-menu=""
                        onClick={() => setMenuOpen(false)}
                    >
                        <p className={styles.menuHeading}>Guide</p>
                        <NavLink to={ROUTES.guide} end className={menuLinkClass}>
                            Overview
                        </NavLink>
                        {GUIDE_SECTIONS.map((section) => (
                            <NavLink key={section.slug} to={guideSectionPath(section.slug)} className={menuLinkClass}>
                                {section.title}
                            </NavLink>
                        ))}
                    </nav>
                </aside>
            </div>
        </AppBackground>
    );
}
