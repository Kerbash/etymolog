import { useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import classNames from 'classnames';

import TabContainer, {
    tabContainerBorderStyle,
    type section,
} from 'cyber-components/container/tabContainer';
import BasicBody from 'cyber-components/layout/basic/body/body';

import { TAB_ROUTES, activeTabId } from '../../url_mapping';
import { useUnsavedChanges } from './unsavedChanges';
import styles from './AppNav.module.scss';

/**
 * AppNav — the primary navigation and the page's `<main>`.
 *
 * The tabs used to be `RouterTabContainer`, whose toggles were `<div onClick>`
 * with no role, no `tabIndex` and no key handling: the app's ONLY top-level
 * navigation could not be reached, let alone operated, from a keyboard.
 * `TabContainer` owns the tablist semantics (roles, roving tabindex, Arrow /
 * Home / End), the overflow-arrow and phone-dropdown modes, and the parts API.
 *
 * The router — not the component — owns the active tab:
 *   - `urlSync={false}` stops the component writing `?primary-nav=` into a URL
 *     react-router is already driving (and stops it reading a stale param back
 *     on mount, which would fight the GitHub-Pages 404 redirect in `main.tsx`);
 *   - `controlledActiveSection` is derived from the pathname, so a deep link,
 *     the back button and a tab click all agree;
 *   - `onSectionChange` fires for USER selections only, so navigating inside it
 *     cannot re-enter itself.
 *
 * Every section renders the same `<Outlet/>`: the layout route below decides
 * WHICH page that is, and TabContainer renders only the active section, so the
 * outlet is mounted exactly once.
 */
export default function AppNav() {
    const { pathname } = useLocation();
    const { guardedNavigate } = useUnsavedChanges();

    const activeId = activeTabId(pathname);

    const sections = useMemo<section[]>(
        () =>
            TAB_ROUTES.map((tab) => ({
                id: tab.id,
                toggle: tab.label,
                content: (
                    <BasicBody className={styles.body}>
                        <Outlet />
                    </BasicBody>
                ),
            })),
        [],
    );

    return (
        <TabContainer
            id="primary-nav"
            sections={sections}
            urlSync={false}
            controlledActiveSection={activeId}
            onSectionChange={(id) => {
                const tab = TAB_ROUTES.find((t) => t.id === id);
                // A tab click is a navigation that never passes through an
                // anchor, so cyber `NavigationGuard` cannot see it — the
                // registry is what stops it discarding an open edit.
                if (tab) void guardedNavigate(tab.path);
            }}
            dropdownBelowWidth={480}
            parts={{
                // A tablist alone is not a landmark; wrapping it in a named
                // navigation region is what puts "Primary" in a screen reader's
                // landmark list.
                root: { role: 'navigation', 'aria-label': 'Primary', className: styles.nav },
                panel: { className: classNames(tabContainerBorderStyle, styles.panel) },
            }}
        />
    );
}
