/**
 * Grapheme tab area (Script Maker) - main entry
 *
 * Contains the UI for the script-maker section (graphemes and glyphs).
 * This file configures the nested tabbed UI using the shared
 * `RouterTabContainer` and exposes the `GraphemeMain` component which
 * should be mounted at the `/script-maker` route (or a parent route that
 * includes that path).
 */

// External imports
import { Link, Routes, Route } from "react-router-dom";
import classNames from "classnames";

// Package components
import RouterTabContainer from "cyber-components/container/tabContainer/routerTabContainer.tsx";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button.tsx";

// Local components & utilities
import NewGraphemeForm from "./newGrapheme/newGrapheme.tsx";
import GraphemeGallery from "./galleryGrapheme/graphemeGallery.tsx";
import GlyphGallery from "./galleryGlyphs/galleryGlyphs.tsx";
import { GlyphEditPage } from "./editGlyph";

import { flex, sizing } from "utils-styles";
import GraphemeEditPage from "./editGrapheme/GraphemeEditPage.tsx";
import NewGlyphPage from "./newGlyph/NewGlyphPage.tsx";

/**
 * Small navigation used inside the grapheme/glyph screens.
 * Shows the main gallery link and a button to create a new glyph.
 */
function GraphemeNav() {
    return (
        <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
            <IconButton
                as={Link}
                to="/script-maker/create"
                iconName="plus-lg"
                className={buttonStyles.primary}
            >
                New Grapheme
            </IconButton>
        </nav>
    );
}

/**
 * GraphemeHome
 *
 * The default grapheme (composed character) gallery view. This component
 * composes the `GraphemeNav` and the `GraphemeView` (which contains the
 * searchable/expandable grapheme gallery UI).
 */
function GraphemeHome() {
    return (
        <>
            <GraphemeNav />
            <GraphemeGallery />
        </>
    );
}

/**
 * CreateGraphemePage
 *
 * Page shown when creating a new grapheme. Accessible at /script-maker/create
 * as a subpath of the Graphemes tab.
 */
function CreateGraphemePage() {
    return (
        <>
            <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
                <IconButton
                    as={Link}
                    to="/script-maker"
                    iconName="arrow-left"
                >
                    Back to Gallery
                </IconButton>
            </nav>
            <NewGraphemeForm />
        </>
    );
}

// Keep a lightweight CreateGlyphPage that renders the full-page form
function CreateGlyphPage() {
    return <NewGlyphPage />;
}

/**
 * GraphemesTab
 *
 * Container for the Graphemes tab that handles nested routing.
 * - /script-maker/ -> GraphemeHome (gallery view)
 * - /script-maker/create -> CreateGraphemePage (create form)
 * - /script-maker/grapheme/db/:id -> GraphemeEditPage (edit form)
 */
function GraphemesTab() {
    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <Routes>
                <Route index element={<GraphemeHome />} />
                <Route path="create" element={<CreateGraphemePage />} />
                <Route path="grapheme/db/:id" element={<GraphemeEditPage />} />
            </Routes>
        </div>
    );
}

/**
 * GlyphsTab
 *
 * Glyph-focused gallery with nested routing.
 * - /script-maker/glyphs -> Gallery view
 * - /script-maker/glyphs/db/:id -> GlyphEditPage (edit form)
 */
function GlyphsTab() {
    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <Routes>
                <Route index element={
                    <>
                        <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
                            <IconButton
                                as={Link}
                                to="/script-maker/glyphs/create"
                                iconName="plus-lg"
                                className={buttonStyles.primary}
                            >
                                New Glyph
                            </IconButton>
                        </nav>
                        <div style={{ padding: '1rem' }}>
                            <GlyphGallery />
                        </div>
                    </>
                } />
                <Route path="db/:id" element={<GlyphEditPage />} />
                <Route path="create" element={<CreateGlyphPage />} />
            </Routes>
        </div>
    );
}

/**
 * ====================================================================================================================
 * GraphemeMain
 *
 * Top-level component exported from this module. It defines the nested
 * tab sections for the Script Maker area using the shared
 * `RouterTabContainer`.
 *
 * Sections configured here:
 * - graphemes (index) -> `GraphemesTab` (includes /create as a subpath)
 * - glyphs            -> `GlyphsTab`
 *
 * The RouterTabContainer expects a `basePath` which is used to match
 * and navigate to the section routes (we use `/script-maker`).
 */
export default function GraphemeMain() {
    const sections = [
        {
            // Use empty path as the default so `/script-maker` maps to graphemes
            // The GraphemesTab handles nested routes including /script-maker/create
            path: '',
            toggle: 'Graphemes',
            content: <GraphemesTab />
        },
        {
            path: 'glyphs',
            toggle: 'Glyphs',
            content: <GlyphsTab />
        }
    ];


    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <RouterTabContainer
                basePath="/script-maker"
                sections={sections}
                contentContainerProps={{
                    className: classNames(classNames(sizing.paddingL))
                }}
            />
        </div>
    );
}
