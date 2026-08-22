/**
 * Script Maker — the shell for everything to do with the script itself.
 *
 * ```
 *  [ Graphemes | Glyphs ]                      ← nested tablist (router-owned)
 *  ┌────────────────────────────────────────┐
 *  │ Graphemes                 [New] [Chart▾]│  ← PageHeader: title, facts,
 *  │ 12 GRAPHEMES · 30 GLYPHS      [Punct.]  │    actions
 *  │ …the gallery, or a nested route…        │
 *  └────────────────────────────────────────┘
 * ```
 *
 * The ROUTER owns the active tab (`urlSync={false}` + `controlledActiveSection`
 * + `onSectionChange`), so a deep link, the back button and a tab click can
 * never disagree, and a refused navigation (the unsaved-changes prompt answered
 * "stay") leaves the strip where it was.
 *
 * The two index screens carry a `PageHeader` each. Before this they had a bare
 * `<nav>` of buttons floating above the gallery with a hand-written
 * `marginBottom` inline style, no page title at all, and no way to tell which of
 * the two tabs you were looking at except by reading the cards.
 */

import { useMemo } from "react";
import { Link, Outlet, Route, Routes, useMatch, useNavigate } from "react-router-dom";

import TabContainer, { type section } from "cyber-components/container/tabContainer";
import DropDownSmall from "cyber-components/container/dropDownSmall/dropDownSmall.tsx";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button";
import { sizing } from "utils-styles";
import graphic_template from "@styles/graphic_template.module.scss";

import { useEtymolog } from "../../../db";
import { ROUTES } from "../../../url_mapping";
import { PageHeader } from "../../shared";
import { GlyphEditPage } from "./editGlyph";
import { GraphemeEditPage } from "./editGrapheme";
import GlyphGallery from "./galleryGlyphs/galleryGlyphs.tsx";
import GraphemeGallery from "./galleryGrapheme/graphemeGallery.tsx";
import IPAChartPage from "./ipaChart/IPAChartPage.tsx";
import { NewGlyphPage } from "./newGlyph";
import { NewGraphemePage } from "./newGrapheme";
import { PunctuationPage } from "./punctuation";
import SyllabaryChartPage from "./syllabaryChart/SyllabaryChartPage.tsx";
import { CustomChartsPage } from "./customCharts";

/**
 * GraphemesHome — the grapheme gallery with its page header.
 *
 * "View chart" is a dropdown rather than three more buttons: the three chart
 * pages are one destination in the user's head ("show me the script laid out"),
 * and spelling them out is what pushed the row past the width of a phone.
 */
function GraphemesHome() {
    const { data } = useEtymolog();
    const graphemeCount = data.graphemesComplete?.length ?? 0;
    const glyphCount = data.glyphsWithUsage?.length ?? 0;

    return (
        <>
            <PageHeader
                title="Graphemes"
                description="A grapheme is one or more glyphs standing for a sound. Graphemes are what words are spelled with."
                facts={[
                    { label: 'Graphemes', value: graphemeCount, big: true },
                    { label: 'Glyphs', value: glyphCount, big: true },
                ]}
                actions={
                    <>
                        <IconButton
                            as={Link}
                            to={ROUTES.scriptMakerCreate}
                            iconName="plus-lg"
                            className={buttonStyles.primary}
                        >
                            New grapheme
                        </IconButton>
                        <DropDownSmall
                            toggleBtn={
                                <IconButton iconName="grid-3x3" as="span">
                                    View chart
                                </IconButton>
                            }
                            contentPin="bottom-start"
                            ariaLabel="Select a chart to view"
                            showCaret={false}
                        >
                            <Link to={ROUTES.scriptMakerChart} className={graphic_template.menuItem}>
                                IPA chart
                            </Link>
                            <Link
                                to={ROUTES.scriptMakerSyllabary}
                                className={graphic_template.menuItem}
                            >
                                Syllabary
                            </Link>
                            <Link
                                to={ROUTES.scriptMakerCustomCharts}
                                className={graphic_template.menuItem}
                            >
                                Custom charts
                            </Link>
                        </DropDownSmall>
                        <IconButton as={Link} to={ROUTES.scriptMakerPunctuation} iconName="type">
                            Punctuation
                        </IconButton>
                    </>
                }
            />
            <GraphemeGallery />
        </>
    );
}

/** GlyphsHome — the glyph gallery with the same header treatment. */
function GlyphsHome() {
    const { data } = useEtymolog();
    const glyphs = data.glyphsWithUsage ?? [];
    const unused = glyphs.filter((glyph) => (glyph.usageCount ?? 0) === 0).length;

    return (
        <>
            <PageHeader
                title="Glyphs"
                description="A glyph is one drawn mark. Graphemes are built from them."
                facts={[
                    { label: 'Glyphs', value: glyphs.length, big: true },
                    { label: 'Unused', value: unused, big: true },
                ]}
                actions={
                    <IconButton
                        as={Link}
                        to={ROUTES.glyphCreate}
                        iconName="plus-lg"
                        className={buttonStyles.primary}
                    >
                        New glyph
                    </IconButton>
                }
            />
            <GlyphGallery />
        </>
    );
}

/**
 * The Graphemes tab's routes. Paths are relative to `/script-maker`, so the
 * segment the outlet matched stays out of them.
 */
function GraphemesTab() {
    return (
        <Routes>
            <Route index element={<GraphemesHome />} />
            <Route path="create" element={<NewGraphemePage />} />
            <Route path="grapheme/db/:id" element={<GraphemeEditPage />} />
            <Route path="chart" element={<IPAChartPage />} />
            <Route path="syllabary" element={<SyllabaryChartPage />} />
            <Route path="punctuation" element={<PunctuationPage />} />
            <Route path="custom-charts" element={<CustomChartsPage />} />
        </Routes>
    );
}

/** The Glyphs tab's routes, relative to `/script-maker/glyphs`. */
function GlyphsTab() {
    return (
        <Routes>
            <Route index element={<GlyphsHome />} />
            <Route path="create" element={<NewGlyphPage />} />
            <Route path="db/:id" element={<GlyphEditPage />} />
        </Routes>
    );
}

/**
 * ScriptMakerNav — the nested Graphemes / Glyphs strip.
 *
 * Same contract as the primary nav in the shell: the ROUTER owns the active
 * tab, the component owns the tablist a11y and the responsive arrow/dropdown
 * modes, and `onSectionChange` fires only for a user selection so navigating
 * inside it cannot loop.
 *
 * It is a LAYOUT route, so both sections render the same `<Outlet/>` — the two
 * tab bodies keep their own nested `<Routes>` and their paths stay relative to
 * the segment the outlet matched.
 */
function ScriptMakerNav() {
    const navigate = useNavigate();
    // `${ROUTES.glyphs}/*`, not the bare path: the Glyphs tab must stay active
    // on `/script-maker/glyphs/db/7` too.
    const onGlyphs = useMatch(`${ROUTES.glyphs}/*`) !== null;

    const sections = useMemo<section[]>(
        () => [
            { id: 'graphemes', toggle: 'Graphemes', content: <Outlet /> },
            { id: 'glyphs', toggle: 'Glyphs', content: <Outlet /> },
        ],
        [],
    );

    return (
        <TabContainer
            id="script-maker-nav"
            sections={sections}
            urlSync={false}
            controlledActiveSection={onGlyphs ? 'glyphs' : 'graphemes'}
            onSectionChange={(id) => navigate(id === 'glyphs' ? ROUTES.glyphs : ROUTES.scriptMaker)}
            dropdownBelowWidth={480}
            parts={{
                root: { role: 'navigation', 'aria-label': 'Script Maker' },
                panel: { className: sizing.paddingL },
            }}
        />
    );
}

/**
 * The Script Maker area, mounted by `App.tsx` at `/script-maker/*`.
 *
 * - `glyphs/*` → `GlyphsTab`
 * - everything else → `GraphemesTab`
 */
export default function GraphemeMain() {
    return (
        <Routes>
            <Route element={<ScriptMakerNav />}>
                <Route path="glyphs/*" element={<GlyphsTab />} />
                <Route path="*" element={<GraphemesTab />} />
            </Route>
        </Routes>
    );
}
