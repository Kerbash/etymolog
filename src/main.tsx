import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {resolveStoredTheme} from 'cyber-components/interactable/settings/darkmodeSwitch/themeInitSource'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './index.css'
import {installScrollDebug} from './debug/scrollDebug.ts'
import App from './App.tsx'

// Opt-in wheel-scroll diagnostics (`?scrollDebug=1`). Must run BEFORE React
// mounts so it can record wheel/touch listeners as components register them.
// A no-op unless the flag is set.
installScrollDebug()

// Get the same base path from import.meta.env
const basename = import.meta.env.BASE_URL

// Handle GitHub Pages SPA redirect from 404.html
const redirectPath = sessionStorage.getItem('redirectPath');
if (redirectPath) {
    sessionStorage.removeItem('redirectPath');
    // Use history.replaceState to update the URL without triggering a page reload
    history.replaceState(null, '', redirectPath);
}

// Theme bootstrap — BEFORE the first render, so the app never paints in the
// wrong theme and flips after hydration. This mirrors what `DarkmodeSwitch`
// itself resolves on mount (cookie override → legacy sessionStorage, migrated
// on read → OS preference), which is why it uses the SAME helper rather than a
// second copy of the logic that could drift.
//
// Vite injects this module as a normal <script type="module">, i.e. deferred,
// so there is a brief default paint before it runs. The zero-FOUC alternative
// is the package's blocking inline `themeInitSource` in <head>; this app is a
// single-page bundle with no server render, so the deferred version is enough
// and keeps index.html free of an inline script.
//
// Note the cookie is HOST-only (`theme-preference`, path=/): on localhost it is
// shared with the other apps in this monorepo regardless of port. That is
// documented behaviour of the shared switch, not a bug.
const storedTheme = resolveStoredTheme();
document.documentElement.dataset.theme =
    storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter basename={basename}>
            <App/>
        </BrowserRouter>
    </StrictMode>,
)
