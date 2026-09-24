// @vitest-environment happy-dom
/**
 * Blocks everywhere — the spelling display composes block-script blocks
 * (BLOCK_SCRIPT_PLAN Phase 4).
 *
 * Two layers:
 *   1. normalization, pure: segment + compose, the `.` boundary, passthrough,
 *      pins on the non-block path, distinct ids for identical blocks, the
 *      disabled / absent scheme;
 *   2. `GlyphSpellingDisplay` against a real database inside `EtymologProvider`
 *      with a SAVED scheme and graphemes that have a "head" variant: one block
 *      `<svg>` with one nested `<svg>` per slot, the slot's group variant drawn,
 *      `blockScheme={null}` forcing single glyphs, a pinned variant on the
 *      non-block path, and the grid card (`CompactLexiconDisplay`) composing a
 *      C1 V C2 word.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

import { normalizeGlyphInput } from '../utils/normalization';
import { GlyphSpellingDisplay } from '../index';
import CompactLexiconDisplay from '../../lexicon/compact/CompactLexiconDisplay';
import { EtymologProvider } from '../../../../db/context';
import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import { createGraphemeEntry } from '../../../../db/utils/spellingUtils';
import type { LexiconComplete, SpellingDisplayEntry } from '../../../../db/types';
import type { BlockScheme } from '../../../../blocks';
import { A, HEAD_GROUP, K, T, cvcScheme, gEntry, glyph, grapheme, ipa, mapOf } from './blockFixtures';

(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const MAP = mapOf(K, A, T);

// =============================================================================
// 1. NORMALIZATION
// =============================================================================

describe('normalization with an enabled block scheme', () => {
    it('composes C1 V C2 into ONE renderable (first template wins) and leaves the rest single', () => {
        // k a t a → cvc(k,a,t) + a (no template matches a lone vowel)
        const out = normalizeGlyphInput([gEntry(K, 0), gEntry(A, 1), gEntry(T, 2), gEntry(A, 3)], {
            graphemeMap: MAP,
            blockScheme: cvcScheme(),
        });
        expect(out).toHaveLength(2);
        const [block, single] = out;
        expect(block.block).toMatchObject({ templateId: 'cvc', entryIndices: [0, 1, 2], containsVirtual: false });
        expect(block.isVirtual).toBe(false);
        expect(block.sourceIndex).toBe(0);
        expect(block.name).toBe('CVC');
        expect(block.svg_data.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')).toBe(true);
        // The onset slot draws k's HEAD variant; the coda slot t's default (two glyphs combined).
        expect(block.svg_data).toContain('k-head');
        expect(block.svg_data).not.toContain('k-default');
        expect(block.svg_data).toContain('t-default');
        expect(block.svg_data).toContain('t-second');
        expect(block.block!.slots.map((s) => [s.roleId, s.variantId, s.missingGroup])).toEqual([
            ['C1', 150, false],
            ['V', 200, false],
            ['C2', 300, false],
        ]);
        expect(single.block).toBeUndefined();
        expect(single).toMatchObject({ id: 21, name: 'a-default', sourceIndex: 3 });
    });

    it('a "." boundary splits the word and renders nothing', () => {
        // k a . t a → cv(k,a) + cv(t,a); without the dot it would be cvc(k,a,t) + a.
        const out = normalizeGlyphInput([gEntry(K, 0), gEntry(A, 1), ipa('.', 2), gEntry(T, 3), gEntry(A, 4)], {
            graphemeMap: MAP,
            blockScheme: cvcScheme(),
        });
        expect(out.map((g) => g.block?.templateId)).toEqual(['cv', 'cv']);
        expect(out.map((g) => g.block?.entryIndices)).toEqual([[0, 1], [3, 4]]);
        expect(out.some((g) => g.ipaCharacter === '.')).toBe(false);
    });

    it('a lone "." renders nothing when the scheme is on, and today\'s text glyph when it is off', () => {
        expect(normalizeGlyphInput([ipa('.', 0)], { graphemeMap: MAP, blockScheme: cvcScheme() })).toEqual([]);
        // Scheme off: unchanged pre-block behaviour, a virtual "." text glyph.
        // (The word form, phase 6, may choose to hide it on its canvas.)
        const off = normalizeGlyphInput([ipa('.', 0)], { graphemeMap: MAP, blockScheme: cvcScheme(false) });
        expect(off).toHaveLength(1);
        expect(off[0]).toMatchObject({ isVirtual: true, ipaCharacter: '.' });
    });

    it('structural entries pass through and blocks never cross them', () => {
        // k | a  (a word separator between) — no CV block across the separator.
        const out = normalizeGlyphInput([gEntry(K, 0), ipa(' ', 1, 'word-separator'), gEntry(A, 2)], {
            graphemeMap: MAP,
            blockScheme: cvcScheme(),
        });
        expect(out.map((g) => g.block)).toEqual([undefined, undefined, undefined]);
        expect(out.map((g) => g.name)).toEqual(['k-default', ' ', 'a-default']);
        expect(out[1]).toMatchObject({ role: 'word-separator', isVirtual: true, sourceIndex: 1 });
    });

    it('a PINNED variant is drawn on the non-block path', () => {
        const pinned = normalizeGlyphInput([gEntry(K, 0, 150)], { graphemeMap: MAP, blockScheme: cvcScheme() });
        expect(pinned.map((g) => g.name)).toEqual(['k-head']);
        // A pin naming a variant the grapheme does not have falls back to the default.
        const stale = normalizeGlyphInput([gEntry(K, 0, 999)], { graphemeMap: MAP, blockScheme: cvcScheme() });
        expect(stale.map((g) => g.name)).toEqual(['k-default']);
    });

    it('a pin inside a block wins over the slot group', () => {
        const scheme = cvcScheme();
        const out = normalizeGlyphInput([gEntry(T, 0, 300), gEntry(A, 1)], { graphemeMap: MAP, blockScheme: scheme });
        expect(out).toHaveLength(1);
        expect(out[0].block!.slots[0]).toMatchObject({ roleId: 'C1', variantId: 300, missingGroup: false });
        expect(out[0].svg_data).not.toContain('t-head');
    });

    it('a slot group the grapheme has no variant in draws the default and says so', () => {
        const scheme: BlockScheme = cvcScheme();
        // a has no HEAD variant — put it in the onset slot by matching `any`.
        scheme.roles[0] = { id: 'C1', label: 'Any', matcher: { kind: 'any' } };
        const out = normalizeGlyphInput([gEntry(A, 0), gEntry(A, 1)], { graphemeMap: MAP, blockScheme: scheme });
        expect(out[0].block!.slots[0]).toMatchObject({ variantId: 200, missingGroup: true });
        expect(out[0].svg_data).toContain('a-default');
    });

    it('two IDENTICAL blocks in one word get different ids', () => {
        const out = normalizeGlyphInput([gEntry(K, 0), gEntry(A, 1), ipa('.', 2), gEntry(K, 3), gEntry(A, 4)], {
            graphemeMap: MAP,
            blockScheme: cvcScheme(),
        });
        expect(out).toHaveLength(2);
        expect(out[0].svg_data).toBe(out[1].svg_data);
        expect(out[0].id).not.toBe(out[1].id);
        expect(out[0].id).toBeLessThan(0);
        // And stable across renders.
        const again = normalizeGlyphInput([gEntry(K, 0), gEntry(A, 1), ipa('.', 2), gEntry(K, 3), gEntry(A, 4)], {
            graphemeMap: MAP,
            blockScheme: cvcScheme(),
        });
        expect(again.map((g) => g.id)).toEqual(out.map((g) => g.id));
    });

    it('an IPA entry inside a block is drawn as text and flagged', () => {
        const out = normalizeGlyphInput([gEntry(K, 0), ipa('a', 1)], { graphemeMap: MAP, blockScheme: cvcScheme() });
        expect(out).toHaveLength(1);
        expect(out[0].block).toMatchObject({ templateId: 'cv', containsVirtual: true });
        expect(out[0].isVirtual).toBe(false);
        expect(out[0].svg_data).toContain('>a</text>');
    });

    it('needs a grapheme map: an enabled scheme without one is the pre-block path', () => {
        const entries: SpellingDisplayEntry[] = [gEntry(K, 0), gEntry(A, 1)];
        expect(normalizeGlyphInput(entries, { blockScheme: cvcScheme() })).toEqual(normalizeGlyphInput(entries, {}));
    });
});

describe('normalization: a consonant with no vowel and the vowel-killer mark', () => {
    // A no-sound grapheme drawn as the mark.
    const MARK = grapheme({ id: 9, phoneme: null, glyphs: [glyph(91, 'mark')] });
    const WITH_MARK = mapOf(K, A, T, MARK);
    const marked = (placement: 'below' | 'after' = 'below'): BlockScheme => ({ ...cvcScheme(), leftovers: { markGraphemeId: MARK.id, placement } });

    it('leftovers set → a consonant alone becomes ONE block renderable with the mark', () => {
        // k a t . k → cvc(k,a,t), then k on its own.
        const entries = [gEntry(K, 0), gEntry(A, 1), gEntry(T, 2), ipa('.', 3), gEntry(K, 4)];
        const out = normalizeGlyphInput(entries, { graphemeMap: WITH_MARK, blockScheme: marked() });
        expect(out).toHaveLength(2);
        const lone = out[1];
        expect(lone.block).toMatchObject({ templateId: '@lone', entryIndices: [4], containsVirtual: false });
        expect(lone).toMatchObject({ name: K.name, sourceIndex: 4, isVirtual: false });
        // The consonant's DEFAULT form (no slot group applies), plus the mark.
        expect(lone.svg_data).toContain('k-default');
        expect(lone.svg_data).not.toContain('k-head');
        expect(lone.svg_data).toContain('mark');
    });

    it('an IPA consonant is named by its character; a vowel alone stays a single', () => {
        const out = normalizeGlyphInput([ipa('t', 0), ipa('.', 1), gEntry(A, 2)], { graphemeMap: WITH_MARK, blockScheme: marked() });
        expect(out.map((g) => [g.name, g.block?.templateId])).toEqual([['t', '@lone'], ['a-default', undefined]]);
    });

    it('the mark and its placement feed the block id', () => {
        const entries = [gEntry(K, 0)];
        const below = normalizeGlyphInput(entries, { graphemeMap: WITH_MARK, blockScheme: marked('below') });
        const after = normalizeGlyphInput(entries, { graphemeMap: WITH_MARK, blockScheme: marked('after') });
        expect(below[0].id).not.toBe(after[0].id);
    });

    it('leftovers unset, or its mark deleted → the consonant renders exactly as before', () => {
        const entries = [gEntry(K, 0), ipa('.', 1), gEntry(T, 2)];
        const plain = normalizeGlyphInput(entries, { graphemeMap: WITH_MARK, blockScheme: cvcScheme() });
        expect(plain.map((g) => g.block)).toEqual([undefined, undefined, undefined]);
        expect(plain.map((g) => g.name)).toEqual(['k-default', 't-default', 't-second']);
        // Mark grapheme missing from the map.
        expect(normalizeGlyphInput(entries, { graphemeMap: MAP, blockScheme: marked() })).toEqual(plain);
    });
});

// =============================================================================
// 2. GlyphSpellingDisplay + EtymologProvider (real database)
// =============================================================================

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle(times = 8) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

async function render(ui: ReactNode, withProvider = true) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(withProvider ? <EtymologProvider>{ui}</EtymologProvider> : ui);
    });
    await settle();
}

/** Glyph items: the top-level `<g>` children of every display's root `<svg>`. */
function glyphItems(scope: ParentNode = container!): Element[] {
    return [...scope.querySelectorAll('svg')]
        .filter((svg) => svg.parentElement?.tagName.toLowerCase() !== 'g')
        .flatMap((svg) => [...svg.children].filter((child) => child.tagName.toLowerCase() === 'g'));
}

/** The composed block `<svg>`s: an svg whose direct children include ≥ 2 slot svgs. */
function blockSvgs(scope: ParentNode = container!): Element[] {
    return [...scope.querySelectorAll('svg')].filter(
        (svg) => [...svg.children].filter((c) => c.tagName.toLowerCase() === 'svg' && c.getAttribute('preserveAspectRatio') === 'xMidYMid meet').length >= 2,
    );
}

interface Seeded {
    scheme: BlockScheme;
    kHeadVariantId: number;
    word(pronunciation: string): LexiconComplete;
}

function svgOf(tag: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
}

/** k (default + head), a, t (default + head); an enabled C1V C2 / C1V scheme on the head group. */
function seed(): Seeded {
    const head = etymologApi.variantGroup.create({ name: 'head' }).data!;
    const glyph = (tag: string) => etymologApi.glyph.create({ name: tag, svg_data: svgOf(tag) }).data!.id;
    const make = (phoneme: string, headTag?: string) => etymologApi.grapheme.create({
        name: phoneme,
        glyphs: [{ glyph_id: glyph(`${phoneme}-default`), position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: true }],
        ...(headTag ? { variants: [{ name: 'Head', group_id: head.id, glyphs: [{ glyph_id: glyph(headTag), position: 0 }] }] } : {}),
    }).data!;
    const k = make('k', 'k-head');
    make('a');
    make('t', 't-head');

    const template = cvcScheme();
    const scheme: BlockScheme = {
        ...template,
        templates: template.templates.map((t) => ({
            ...t,
            slots: t.slots.map((s) => (s.groupId === HEAD_GROUP ? { ...s, groupId: head.id } : s)),
        })),
    };
    expect(etymologApi.blockScheme.save(scheme).data!.issues).toEqual([]);

    const kGrapheme = etymologApi.grapheme.getAllComplete().data!.graphemes.find((g) => g.id === k.id)!;
    const kHeadVariantId = kGrapheme.variants!.find((v) => !v.is_default)!.id;

    return {
        scheme,
        kHeadVariantId,
        word(pronunciation: string) {
            const created = etymologApi.lexicon.create({ pronunciation, meanings: [{ meaning: pronunciation }] }).data!;
            return etymologApi.lexicon.getByIdComplete(created.id).data!;
        },
    };
}

describe('GlyphSpellingDisplay composes blocks from the provider\'s scheme', () => {
    beforeEach(async () => {
        await initDatabase();
        clearDatabase();
    });

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount());
            root = null;
        }
        container?.remove();
        container = null;
    });

    it('a CV word renders ONE block <svg> holding two nested slot svgs, the onset in its head form', async () => {
        const seeded = seed();
        const ka = seeded.word('ka');
        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} />);

        expect(glyphItems()).toHaveLength(1);
        const blocks = blockSvgs();
        expect(blocks).toHaveLength(1);
        const slots = [...blocks[0].children].filter((c) => c.tagName.toLowerCase() === 'svg');
        expect(slots).toHaveLength(2);
        expect(slots[0].innerHTML).toContain('k-head');
        expect(slots[1].innerHTML).toContain('a-default');
        expect(container!.innerHTML).not.toContain('k-default');
    });

    /** The caller-supplied map every pre-block caller passes (spelling rows carry no glyphs). */
    function allGraphemes() {
        return new Map(etymologApi.grapheme.getAllComplete().data!.graphemes.map((g) => [g.id, g]));
    }

    it('blockScheme={null} forces single glyphs', async () => {
        const seeded = seed();
        const ka = seeded.word('ka');
        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} graphemeMap={allGraphemes()} blockScheme={null} />);

        expect(glyphItems()).toHaveLength(2);
        expect(blockSvgs()).toHaveLength(0);
        expect(container!.innerHTML).toContain('k-default');
        expect(container!.innerHTML).not.toContain('k-head');
    });

    it('a pinned variant is drawn on the non-block path', async () => {
        const seeded = seed();
        const k = etymologApi.grapheme.getAllComplete().data!.graphemes.find((g) => g.name === 'k')!;
        const created = etymologApi.lexicon.create({
            lemma: 'k-alone',
            auto_spell: false,
            glyph_order: [createGraphemeEntry(k.id, seeded.kHeadVariantId)],
        }).data!;
        const word = etymologApi.lexicon.getByIdComplete(created.id).data!;
        expect(word.spellingDisplay[0].variantId).toBe(seeded.kHeadVariantId);

        await render(<GlyphSpellingDisplay glyphs={word.spellingDisplay} />);
        expect(blockSvgs()).toHaveLength(0);
        expect(glyphItems()).toHaveLength(1);
        expect(container!.innerHTML).toContain('k-head');
    });

    it('a "." in the pronunciation splits blocks: ka.ta → two blocks, no dot drawn', async () => {
        const seeded = seed();
        const word = seeded.word('ka.ta');
        await render(<GlyphSpellingDisplay glyphs={word.spellingDisplay} />);
        expect(blockSvgs()).toHaveLength(2);
        expect(glyphItems()).toHaveLength(2);
        expect(container!.innerHTML).not.toContain('>.</text>');
    });

    it('a disabled scheme renders exactly as without one', async () => {
        const seeded = seed();
        etymologApi.blockScheme.save({ ...seeded.scheme, enabled: false });
        const ka = seeded.word('ka');
        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} graphemeMap={allGraphemes()} />);
        expect(blockSvgs()).toHaveLength(0);
        expect(glyphItems()).toHaveLength(2);
    });

    it('with blocks OFF the provider\'s map is NOT borrowed — a map-less spelling renders as it always did', async () => {
        const seeded = seed();
        etymologApi.blockScheme.save({ ...seeded.scheme, enabled: false });
        const ka = seeded.word('ka');
        // Spelling rows carry only the grapheme ROW (no glyphs), so without a
        // map the pre-block path draws nothing — unchanged, byte for byte.
        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} />);
        expect(glyphItems()).toHaveLength(0);
    });

    it('outside a provider nothing composes — unless a scheme is passed as a prop', async () => {
        const seeded = seed();
        const ka = seeded.word('ka');
        const graphemeMap = new Map(etymologApi.grapheme.getAllComplete().data!.graphemes.map((g) => [g.id, g]));

        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} graphemeMap={graphemeMap} />, false);
        expect(blockSvgs()).toHaveLength(0);
        expect(glyphItems()).toHaveLength(2);
        await act(async () => root!.unmount());
        root = null;

        await render(<GlyphSpellingDisplay glyphs={ka.spellingDisplay} graphemeMap={graphemeMap} blockScheme={seeded.scheme} />, false);
        expect(blockSvgs()).toHaveLength(1);
    });

    it('Glyph[] / GraphemeComplete[] input never composes, even with the scheme on', async () => {
        seed();
        const graphemes = etymologApi.grapheme.getAllComplete().data!.graphemes;
        await render(<GlyphSpellingDisplay glyphs={graphemes} />);
        expect(blockSvgs()).toHaveLength(0);
        expect(glyphItems()).toHaveLength(3);
    });

    it('CompactLexiconDisplay renders a block for a C1 V C2 word', async () => {
        const seeded = seed();
        const kat = seeded.word('kat');
        expect(kat.spellingDisplay).toHaveLength(3);

        await render(<CompactLexiconDisplay lexiconData={kat} />);
        const band = container!.querySelector('[data-testid="glyph-band"]')!;
        const blocks = blockSvgs(band);
        expect(blocks).toHaveLength(1);
        const slots = [...blocks[0].children].filter((c) => c.tagName.toLowerCase() === 'svg');
        expect(slots).toHaveLength(3);
        expect(glyphItems(band)).toHaveLength(1);
        expect(band.innerHTML).toContain('k-head');
        expect(band.innerHTML).toContain('t-default');
    });

    it('CompactLexiconDisplay with the caller\'s own grapheme map composes too', async () => {
        const seeded = seed();
        const kat = seeded.word('kat');
        const graphemeMap = new Map(etymologApi.grapheme.getAllComplete().data!.graphemes.map((g) => [g.id, g]));
        await render(<CompactLexiconDisplay lexiconData={kat} graphemeMap={graphemeMap} />);
        expect(blockSvgs(container!)).toHaveLength(1);
    });
});
