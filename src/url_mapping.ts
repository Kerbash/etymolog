/**
 * URL Mapping — Centralized Route Definitions
 *
 * All navigable routes for the Etymolog app. Route `path` props in React Router
 * <Route> definitions stay as relative segments — only navigate(), <Link to=...>,
 * and <Navigate to=...> use these constants.
 *
 * `TAB_ROUTES` is the SINGLE source of the primary navigation: the shell's tab
 * strip, the active-tab derivation and the route tree all read it, so adding a
 * top-level area is one entry here rather than three edits that can disagree.
 */

export const ROUTES = {
    new: '/new',

    // Lexicon
    lexicon: '/lexicon',
    lexiconCreate: '/lexicon/create',
    /**
     * The word generator. Takes an optional `?preset=<id>` (a flavour preset
     * id) so a link from the IPA chart's guide legend can open the generator
     * already set to the flavour the chart is painting.
     */
    lexiconGenerate: '/lexicon/generate',
    lexiconView: '/lexicon/db/:id',
    lexiconEdit: '/lexicon/db/:id/edit',

    // Script Maker
    scriptMaker: '/script-maker',
    scriptMakerCreate: '/script-maker/create',
    scriptMakerChart: '/script-maker/chart',
    scriptMakerSyllabary: '/script-maker/syllabary',
    scriptMakerCustomCharts: '/script-maker/custom-charts',
    scriptMakerPunctuation: '/script-maker/punctuation',

    // Glyphs
    glyphs: '/script-maker/glyphs',
    glyphCreate: '/script-maker/glyphs/create',
    glyphEdit: '/script-maker/glyphs/db/:id',

    // Graphemes
    graphemeEdit: '/script-maker/grapheme/db/:id',

    // Writing System
    writingSystem: '/writing-system',

    // Translator
    translator: '/translator',
} as const;

/**
 * One entry per primary-navigation tab, in display order.
 *
 * - `id`    — the TabContainer section id AND the first path segment of the
 *             route, so the active tab can be derived from the pathname without
 *             a second lookup table.
 * - `path`  — the absolute route to navigate to (always a `ROUTES` member).
 * - `label` — the visible tab text.
 */
export const TAB_ROUTES: readonly { id: string; path: string; label: string }[] = [
    { id: 'lexicon', path: ROUTES.lexicon, label: 'Lexicon' },
    { id: 'script-maker', path: ROUTES.scriptMaker, label: 'Script Maker' },
    { id: 'writing-system', path: ROUTES.writingSystem, label: 'Writing System' },
    { id: 'translator', path: ROUTES.translator, label: 'Translator' },
] as const;

/**
 * Resolve a parameterized route by replacing :param placeholders.
 *
 * `params` is optional so a caller can pipe ANY route constant through
 * `resolveUrl` — including the parameterless ones — without a conditional at
 * every call site.
 *
 * @example
 * resolveUrl(ROUTES.lexiconView, { id: 42 })  // → "/lexicon/db/42"
 * resolveUrl(ROUTES.glyphEdit, { id: 7 })      // → "/script-maker/glyphs/db/7"
 * resolveUrl(ROUTES.lexicon)                   // → "/lexicon"
 */
export function resolveUrl(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (!params) return template;
    let result = template;
    for (const [key, value] of Object.entries(params)) {
        result = result.replace(`:${key}`, String(value));
    }
    return result;
}

/**
 * The primary-nav tab id for a pathname, falling back to the first tab.
 *
 * The pathname is the single source of truth for which tab is active, and
 * `TAB_ROUTES[i].id` IS the first path segment (asserted in
 * `__tests__/url_mapping.test.ts`), so no lookup table is needed — which is why
 * a deep link, the back button and a tab click can never disagree.
 */
export function activeTabId(pathname: string): string {
    const segment = pathname.split('/').filter(Boolean)[0] ?? '';
    return TAB_ROUTES.some((tab) => tab.id === segment) ? segment : TAB_ROUTES[0].id;
}
