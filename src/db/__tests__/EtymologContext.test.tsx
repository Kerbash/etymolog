// @vitest-environment happy-dom
/**
 * EtymologContext — refresh matrix, failure surfacing, StrictMode init.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { EtymologProvider, useEtymolog, type EtymologContextValue } from '../context';
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
