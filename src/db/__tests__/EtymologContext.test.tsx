// @vitest-environment happy-dom
/**
 * EtymologContext — refresh matrix, failure surfacing, StrictMode init.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { EtymologProvider, useEtymolog, useOptionalBlockScheme, useOptionalGraphemeMap, type EtymologContextValue } from '../context';
import type { BlockScheme } from '../../blocks';
import { etymologApi } from '../api';
import { clearDatabase, initDatabase } from '../database';

(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let latest: EtymologContextValue | null = null;

/**
 * Reports the context value to the test through a callback fired in an EFFECT.
 *
 * Assigning to the module-level `latest` during RENDER is a side effect in the
 * render phase (`react-hooks/globals`): React may render a component more than
 * once, or throw the result away, so what the test observes would depend on
 * when a re-render happened to occur. An effect runs after the commit, once per
 * committed render, and `act()` flushes it before the assertion.
 */
function Probe({ onValue }: { onValue: (value: EtymologContextValue) => void }) {
    const value = useEtymolog();
    useEffect(() => {
        onValue(value);
    });
    return null;
}

async function mount(): Promise<Root> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(
            <StrictMode>
                <EtymologProvider>
                    <Probe onValue={(value) => { latest = value; }} />
                </EtymologProvider>
            </StrictMode>,
        );
    });
    // Let the async init settle.
    for (let i = 0; i < 20 && !latest?.isReady; i++) {
        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });
    }
    return root;
}

describe('EtymologProvider', () => {
    let root: Root | null = null;

    beforeEach(async () => {
        await initDatabase();
        clearDatabase();
        latest = null;
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        vi.restoreAllMocks();
    });

    it('initialises once under StrictMode and exposes persistence + health', async () => {
        root = await mount();
        expect(latest?.isReady).toBe(true);
        expect(latest?.error).toBeNull();
        expect(latest?.persistence.adapter).not.toBeNull();
        expect(latest?.health).toMatchObject({ fkViolations: 0 });
    });

    it('refreshes only the lexicon after a lexicon mutation', async () => {
        root = await mount();
        const glyphSpy = vi.spyOn(etymologApi.glyph, 'getAll');
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.api.lexicon.create({ lemma: 'word' });
        });

        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(glyphSpy).not.toHaveBeenCalled();
        expect(graphemeSpy).not.toHaveBeenCalled();
        expect(latest?.data.lexiconCount).toBe(1);
    });

    it('refreshes glyphs and graphemes, not the lexicon, after a glyph update', async () => {
        root = await mount();
        let glyphId = 0;
        await act(async () => {
            glyphId = latest!.api.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!.id;
        });
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        await act(async () => {
            latest!.api.glyph.update(glyphId, { name: 'renamed' });
        });
        expect(graphemeSpy).toHaveBeenCalledTimes(1);
        expect(lexiconSpy).not.toHaveBeenCalled();
        expect(latest?.data.glyphs[0].name).toBe('renamed');
    });

    it('refreshes graphemes AND the lexicon, not glyphs, after a phoneme write', async () => {
        root = await mount();
        let graphemeId = 0;
        await act(async () => {
            const glyph = latest!.api.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!;
            graphemeId = latest!.api.grapheme.create({
                name: 'K',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
            }).data!.id;
        });
        const glyphSpy = vi.spyOn(etymologApi.glyph, 'getAll');
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        await act(async () => {
            latest!.api.phoneme.replaceAll({
                grapheme_id: graphemeId,
                phonemes: [{ phoneme: 'k', use_in_auto_spelling: true }],
            });
        });
        // A phoneme write can respell words, so the lexicon slice is re-read.
        expect(graphemeSpy).toHaveBeenCalledTimes(1);
        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(glyphSpy).not.toHaveBeenCalled();
    });

    it('records a failed refresh instead of swallowing it', async () => {
        root = await mount();
        vi.spyOn(etymologApi.lexicon, 'getAllComplete').mockReturnValue({
            success: false,
            error: { code: 'OPERATION_FAILED', message: 'boom' },
        });
        await act(async () => {
            latest!.refreshLexicon();
        });
        expect(latest?.data.lastRefreshError).toMatchObject({ slice: 'lexicon', message: 'boom' });

        vi.restoreAllMocks();
        await act(async () => {
            latest!.refreshLexicon();
        });
        expect(latest?.data.lastRefreshError).toBeNull();
    });

    it('does not refresh when a mutation fails', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        await act(async () => {
            const res = latest!.api.lexicon.delete(9999);
            expect(res.success).toBe(false);
        });
        expect(lexiconSpy).not.toHaveBeenCalled();
    });

    it('refreshes the folder slices too (not just glyphs/graphemes/lexicon) after database.clear', async () => {
        root = await mount();
        // A folder in each of the three domains — the tree that a clear must wipe.
        await act(async () => {
            latest!.api.folder.create({ name: 'Words folder', parent_id: null });
            latest!.api.glyphFolder.create({ name: 'Glyph folder', parent_id: null });
            latest!.api.graphemeFolder.create({ name: 'Grapheme folder', parent_id: null });
        });
        expect(latest?.data.folders.length).toBe(1);
        expect(latest?.data.glyphFolders.length).toBe(1);
        expect(latest?.data.graphemeFolders.length).toBe(1);

        const folderSpy = vi.spyOn(etymologApi.folder, 'list');
        const glyphFolderSpy = vi.spyOn(etymologApi.glyphFolder, 'list');
        const graphemeFolderSpy = vi.spyOn(etymologApi.graphemeFolder, 'list');

        await act(async () => {
            latest!.api.database.clear();
        });

        // The gap this closes: afterAll used to refresh only the three entity
        // slices, leaving a stale folder tree on screen after a clear/reset.
        expect(folderSpy).toHaveBeenCalledTimes(1);
        expect(glyphFolderSpy).toHaveBeenCalledTimes(1);
        expect(graphemeFolderSpy).toHaveBeenCalledTimes(1);
        expect(latest?.data.folders).toEqual([]);
        expect(latest?.data.glyphFolders).toEqual([]);
        expect(latest?.data.graphemeFolders).toEqual([]);
    });
});

/**
 * `batchMutations` — the N+1 refresh, closed at the context.
 *
 * Every mutation on `api` refreshes the slices it can have changed, which is
 * right for one call and quadratic for a loop: the word generator's "Add 100
 * selected" ran `lexicon.getAllComplete()` a hundred times, once per create.
 * The assertions below count that read directly, because "one refresh" is the
 * whole contract and a spy on the refresh CALLBACK would not notice a second
 * path into the same query.
 */
describe('EtymologProvider — batchMutations', () => {
    let root: Root | null = null;

    beforeEach(async () => {
        await initDatabase();
        clearDatabase();
        latest = null;
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        vi.restoreAllMocks();
    });

    it('re-reads the lexicon ONCE for five creates in one batch', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.batchMutations(() => {
                for (let i = 0; i < 5; i++) latest!.api.lexicon.create({ lemma: `w${i}` });
            });
        });

        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(latest?.data.lexiconCount).toBe(5);
    });

    it('reads once per SLICE, not once per batch, and only the slices touched', async () => {
        root = await mount();
        const glyphSpy = vi.spyOn(etymologApi.glyph, 'getAll');
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.batchMutations(() => {
                latest!.api.glyph.create({ name: 'a', svg_data: '<svg/>' });
                latest!.api.glyph.create({ name: 'b', svg_data: '<svg/>' });
                latest!.api.lexicon.create({ lemma: 'word' });
            });
        });

        expect(glyphSpy).toHaveBeenCalledTimes(1);
        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        // `glyph.create` is filed under `glyphs` alone — a batch must not
        // widen the refresh matrix.
        expect(graphemeSpy).not.toHaveBeenCalled();
        expect(latest?.data.glyphCount).toBe(2);
        expect(latest?.data.lexiconCount).toBe(1);
    });

    it('flushes once for NESTED batches, at the outermost close', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.batchMutations(() => {
                latest!.api.lexicon.create({ lemma: 'outer' });
                latest!.batchMutations(() => {
                    latest!.api.lexicon.create({ lemma: 'inner-1' });
                    latest!.batchMutations(() => {
                        latest!.api.lexicon.create({ lemma: 'inner-2' });
                    });
                });
                // The inner batches closing must NOT have flushed — a helper
                // that batches internally has to be safe inside a loop that
                // also batches.
                expect(lexiconSpy).not.toHaveBeenCalled();
            });
        });

        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(latest?.data.lexiconCount).toBe(3);
    });

    it('still refreshes the successful part when fn throws, and rethrows', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        const boom = new Error('boom');

        await act(async () => {
            expect(() =>
                latest!.batchMutations(() => {
                    latest!.api.lexicon.create({ lemma: 'landed' });
                    throw boom;
                }),
            ).toThrow(boom);
        });

        // The half-finished loop's work is on screen rather than invisible
        // until something else happens to refresh.
        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(latest?.data.lexiconCount).toBe(1);
    });

    it('refreshes nothing when every mutation in the batch failed', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.batchMutations(() => {
                expect(latest!.api.lexicon.delete(9998).success).toBe(false);
                expect(latest!.api.lexicon.delete(9999).success).toBe(false);
            });
        });

        expect(lexiconSpy).not.toHaveBeenCalled();
    });

    it('refreshes only the slice whose call SUCCEEDED in a mixed batch', async () => {
        root = await mount();
        const glyphSpy = vi.spyOn(etymologApi.glyph, 'getAll');
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.batchMutations(() => {
                latest!.api.lexicon.create({ lemma: 'ok' });
                expect(latest!.api.glyph.delete(4242).success).toBe(false);
            });
        });

        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(glyphSpy).not.toHaveBeenCalled();
    });

    it('passes the callback\'s return value straight through', async () => {
        root = await mount();
        let id = 0;
        await act(async () => {
            id = latest!.batchMutations(
                () => latest!.api.lexicon.create({ lemma: 'ret' }).data!.id,
            );
        });
        expect(id).toBeGreaterThan(0);
    });

    it('leaves behaviour outside a batch exactly as it was', async () => {
        root = await mount();
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');

        await act(async () => {
            latest!.api.lexicon.create({ lemma: 'one' });
            latest!.api.lexicon.create({ lemma: 'two' });
        });

        expect(lexiconSpy).toHaveBeenCalledTimes(2);
    });

    it('does not leak a pending slice from a thrown batch into the next one', async () => {
        root = await mount();

        await act(async () => {
            expect(() =>
                latest!.batchMutations(() => {
                    latest!.api.lexicon.create({ lemma: 'first' });
                    throw new Error('boom');
                }),
            ).toThrow();
        });

        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        await act(async () => {
            latest!.batchMutations(() => {
                expect(latest!.api.lexicon.delete(9999).success).toBe(false);
            });
        });

        // The first batch's pending set was drained on the way out; a leak
        // would show up as a refresh nothing in THIS batch asked for.
        expect(lexiconSpy).not.toHaveBeenCalled();
    });
});

describe('EtymologProvider — variant slices (schema v9)', () => {
    let root: Root | null = null;

    beforeEach(async () => {
        await initDatabase();
        clearDatabase();
        latest = null;
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        vi.restoreAllMocks();
    });

    it('loads variantGroups on init and refreshes only that slice after a group create/update', async () => {
        root = await mount();
        expect(latest?.data.variantGroups).toEqual([]);
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        const groupSpy = vi.spyOn(etymologApi.variantGroup, 'getAll');

        let groupId = 0;
        await act(async () => {
            groupId = latest!.api.variantGroup.create({ name: 'head' }).data!.id;
        });
        await act(async () => {
            latest!.api.variantGroup.update(groupId, { name: 'Head' });
        });

        expect(groupSpy).toHaveBeenCalledTimes(2);
        expect(graphemeSpy).not.toHaveBeenCalled();
        expect(latest?.data.variantGroups.map(g => g.name)).toEqual(['Head']);
    });

    it('a group delete also re-reads graphemes (its variants are ungrouped there)', async () => {
        root = await mount();
        let groupId = 0;
        await act(async () => {
            groupId = latest!.api.variantGroup.create({ name: 'head' }).data!.id;
            const glyph = latest!.api.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!;
            latest!.api.grapheme.create({
                name: 'K',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                variants: [{ name: 'Head', group_id: groupId, glyphs: [{ glyph_id: glyph.id, position: 0 }] }],
            });
        });
        expect(latest?.data.graphemesComplete[0].variants![1].group_id).toBe(groupId);

        await act(async () => {
            latest!.api.variantGroup.delete(groupId);
        });
        expect(latest?.data.variantGroups).toEqual([]);
        expect(latest?.data.graphemesComplete[0].variants![1].group_id).toBeNull();
    });

    it('variant writes refresh graphemes; a variant delete refreshes the lexicon too', async () => {
        root = await mount();
        let graphemeId = 0;
        let altId = 0;
        await act(async () => {
            const glyph = latest!.api.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!;
            graphemeId = latest!.api.grapheme.create({ name: 'K', glyphs: [{ glyph_id: glyph.id, position: 0 }] }).data!.id;
            altId = latest!.api.variant.create(graphemeId, { name: 'Alt', glyphs: [{ glyph_id: glyph.id, position: 0 }] }).data!.id;
        });
        expect(latest?.data.graphemesComplete[0].variants).toHaveLength(2);

        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        await act(async () => {
            latest!.api.variant.setDefault(graphemeId, altId);
        });
        expect(lexiconSpy).not.toHaveBeenCalled();
        expect(latest?.data.graphemesComplete[0].variants![0].id).toBe(altId);

        const oldDefault = latest!.data.graphemesComplete[0].variants![1].id;
        await act(async () => {
            latest!.api.variant.delete(oldDefault);
        });
        expect(lexiconSpy).toHaveBeenCalledTimes(1);
        expect(latest?.data.graphemesComplete[0].variants).toHaveLength(1);
    });

    it('database.clear refreshes the variantGroups slice too', async () => {
        root = await mount();
        await act(async () => {
            latest!.api.variantGroup.create({ name: 'head' });
        });
        expect(latest?.data.variantGroups).toHaveLength(1);
        await act(async () => {
            latest!.api.database.clear();
        });
        expect(latest?.data.variantGroups).toEqual([]);
    });
});

const CV_SCHEME: BlockScheme = {
    version: 1,
    enabled: true,
    roles: [
        { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
        { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
    ],
    templates: [{
        id: 'cv',
        name: 'CV',
        pattern: ['C1', 'V'],
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
            { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
        ],
    }],
};

interface BlockSnapshot {
    scheme: BlockScheme | null;
    map: ReturnType<typeof useOptionalGraphemeMap>;
}

const blockSnapshots: BlockSnapshot[] = [];

/** Records every value the narrow block-rendering context delivers. */
function BlockProbe() {
    const scheme = useOptionalBlockScheme();
    const map = useOptionalGraphemeMap();
    useEffect(() => {
        blockSnapshots.push({ scheme, map });
    }, [scheme, map]);
    return null;
}

describe('EtymologProvider — block scheme slice + graphemeMap (schema v9)', () => {
    let root: Root | null = null;

    beforeEach(async () => {
        await initDatabase();
        clearDatabase();
        latest = null;
        blockSnapshots.length = 0;
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        vi.restoreAllMocks();
    });

    it('loads the (empty, disabled) scheme and an empty graphemeMap on init', async () => {
        root = await mount();
        expect(latest?.data.blockScheme).toEqual({ version: 1, enabled: false, roles: [], templates: [] });
        expect(latest?.data.graphemeMap.size).toBe(0);
    });

    it('blockScheme.save refreshes ONLY the blockScheme slice', async () => {
        root = await mount();
        const graphemeSpy = vi.spyOn(etymologApi.grapheme, 'getAllComplete');
        const lexiconSpy = vi.spyOn(etymologApi.lexicon, 'getAllComplete');
        const schemeSpy = vi.spyOn(etymologApi.blockScheme, 'get');

        await act(async () => {
            expect(latest!.api.blockScheme.save(CV_SCHEME).success).toBe(true);
        });

        expect(schemeSpy).toHaveBeenCalledTimes(1);
        expect(graphemeSpy).not.toHaveBeenCalled();
        expect(lexiconSpy).not.toHaveBeenCalled();
        expect(latest?.data.blockScheme).toEqual(CV_SCHEME);
    });

    it('blockScheme.validate writes nothing and refreshes nothing', async () => {
        root = await mount();
        const schemeSpy = vi.spyOn(etymologApi.blockScheme, 'get');
        await act(async () => {
            latest!.api.blockScheme.validate(CV_SCHEME);
        });
        expect(schemeSpy).not.toHaveBeenCalled();
        expect(latest?.data.blockScheme.enabled).toBe(false);
    });

    it('graphemeMap indexes graphemesComplete by id, rebuilt in the same update', async () => {
        root = await mount();
        let graphemeId = 0;
        await act(async () => {
            const glyph = latest!.api.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!;
            graphemeId = latest!.api.grapheme.create({ name: 'K', glyphs: [{ glyph_id: glyph.id, position: 0 }] }).data!.id;
        });
        const data = latest!.data;
        expect(data.graphemeMap.size).toBe(1);
        expect(data.graphemeMap.get(graphemeId)).toBe(data.graphemesComplete[0]);
        expect(data.graphemeMap.get(graphemeId)?.variants).toHaveLength(1);
    });

    it('database.clear and database.reset refresh the scheme back to the default', async () => {
        root = await mount();
        await act(async () => {
            latest!.api.blockScheme.save(CV_SCHEME);
        });
        expect(latest?.data.blockScheme.enabled).toBe(true);
        await act(async () => {
            latest!.api.database.clear();
        });
        expect(latest?.data.blockScheme.enabled).toBe(false);

        await act(async () => {
            latest!.api.blockScheme.save(CV_SCHEME);
        });
        await act(async () => {
            latest!.api.database.reset();
        });
        expect(latest?.data.blockScheme.enabled).toBe(false);
    });

    it('refresh() (what import and repair call) re-reads the scheme', async () => {
        root = await mount();
        await act(async () => {
            etymologApi.blockScheme.save(CV_SCHEME); // unwrapped: no automatic refresh
        });
        expect(latest?.data.blockScheme.enabled).toBe(false);
        await act(async () => {
            latest!.refresh();
        });
        expect(latest?.data.blockScheme).toEqual(CV_SCHEME);
    });

    it('useOptionalBlockScheme / useOptionalGraphemeMap: null outside a provider, never a throw', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(<BlockProbe />);
        });
        expect(blockSnapshots.at(-1)).toEqual({ scheme: null, map: null });
    });

    it('inside a provider the narrow value tracks the scheme, and a lexicon refresh does not change it', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(
                <EtymologProvider>
                    <Probe onValue={(value) => { latest = value; }} />
                    <BlockProbe />
                </EtymologProvider>,
            );
        });
        for (let i = 0; i < 20 && !latest?.isReady; i++) {
            await act(async () => {
                await new Promise(r => setTimeout(r, 10));
            });
        }
        await act(async () => {
            latest!.api.blockScheme.save(CV_SCHEME);
        });
        expect(blockSnapshots.at(-1)?.scheme).toEqual(CV_SCHEME);

        const before = blockSnapshots.length;
        await act(async () => {
            latest!.api.lexicon.create({ pronunciation: 'ka', meanings: [{ meaning: 'x' }] });
        });
        expect(latest?.data.lexiconCount).toBe(1);
        // Same scheme + same map identity → the effect did not fire again.
        expect(blockSnapshots.length).toBe(before);
    });
});
