import AppBackground from './AppBackground';
import AppHeader from './AppHeader';
import AppNav from './AppNav';
import AppFooter from './AppFooter';
import { ShellStatusBanner } from './PersistenceStatus';
import { UnsavedChangesRegistry } from './unsavedChanges';
import { PwaUpdateGate } from '../../pwa';
import styles from './AppShell.module.scss';

/**
 * AppShell — the layout every conlang page renders inside.
 *
 * ```
 * ┌────────────────────────────────────────────┐
 * │ [skip link]  (visible only when focused)   │
 * ├────────────────────────────────────────────┤
 * │ <header>  Kavi ✎   Export Import New ☾     │  sticky
 * ├────────────────────────────────────────────┤
 * │ <nav aria-label="Primary">  [tablist]      │
 * │ ┌────────────────────────────────────────┐ │
 * │ │ <main id="main-content"> <Outlet/>     │ │  grows
 * │ └────────────────────────────────────────┘ │
 * ├────────────────────────────────────────────┤
 * │ <footer>  build · Saved · By Kerbash       │
 * └────────────────────────────────────────────┘
 * ```
 *
 * Four landmarks where there were none: the whole shell used to be nested
 * `<div>`s, so a screen-reader user had no way to jump to the navigation or
 * skip past it, and the first Tab press landed inside the header with no escape
 * from the (unreachable) tab strip.
 *
 * The scroll model is deliberately boring: nothing here sets a height, so the
 * DOCUMENT scrolls and the header sticks. The previous shell put
 * `height: 100dvh` on an inner box, which made every page responsible for its
 * own overflow.
 */
export default function AppShell() {
    return (
        <AppBackground>
            {/* First focusable thing on the page. Visually hidden until it is
                focused — the standard skip-link pattern, and the only way past
                a four-tab strip for a keyboard user who wants the content. */}
            <a className={styles.skipLink} href="#main-content">
                Skip to content
            </a>

            <UnsavedChangesRegistry>
                {/* Renders nothing. Inside the registry because it hands the
                    update controller the "is anything dirty?" probe, and
                    ABOVE the pages because the route-change hook it owns must
                    see every navigation. See `src/pwa/PwaUpdateGate.tsx`. */}
                <PwaUpdateGate />

                <AppHeader />

                {/* Mounted ONCE, above the pages: a storage failure must stay on
                    screen across navigation, and mounting it per page would
                    re-raise (and re-animate) it on every route change. */}
                <ShellStatusBanner />

                <AppNav />

                <AppFooter />
            </UnsavedChangesRegistry>
        </AppBackground>
    );
}
