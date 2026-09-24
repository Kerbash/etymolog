// @vitest-environment happy-dom
/**
 * Syllabary charts — the composed preview in EMPTY cells (BLOCK_SCRIPT_PLAN Phase 4)
 *
 * With the block scheme enabled, a syllabary cell with no grapheme of its own
 * (`ka`) whose consonant and vowel DO have signs shows a dimmed composed
 * preview titled "Composed from k + a — click to create a dedicated sign", and
 * clicking it still asks to create the `ka` sign. A cell missing either sound
 * stays empty; with the scheme disabled nothing changes at all.
 *
 * Both charts: the IPA syllabary and a custom syllabary chart.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

import IPASyllabaryChart from '../../ipaChart/IPASyllabaryChart';
import CustomSyllabaryChart from '../../customChart/CustomSyllabaryChart';
import { EtymologProvider } from '../../../../db/context';
import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import type { GraphemeComplete } from '../../../../db/types';
import type { BlockScheme } from '../../../../blocks';
import type { SyllabaryChartDefinition } from '../../../../db/api/types';

(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SCHEME: BlockScheme = {
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

const CHART: SyllabaryChartDefinition = {
    id: 'c1',
    name: 'Mine',
    createdAt: '2026-01-01T00:00:00Z',
    type: 'syllabary',
    xAxis: ['a', 'i'],
    yAxis: ['k', 't'],
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(ui: ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<EtymologProvider>{ui}</EtymologProvider>);
    });
    for (let i = 0; i < 8; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

/** k and a have signs; t and i do not. Returns the chart's phoneme map. */
function seed(schemeEnabled: boolean): Map<string, GraphemeComplete> {
    for (const phoneme of ['k', 'a']) {
        const glyph = etymologApi.glyph.create({
            name: `${phoneme}-mark`,
            svg_data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${phoneme}-mark"/></svg>`,
        }).data!;
        etymologApi.grapheme.create({
            name: phoneme,
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
            phonemes: [{ phoneme, use_in_auto_spelling: true }],
        });
    }
    etymologApi.blockScheme.save({ ...SCHEME, enabled: schemeEnabled });
    const map = new Map<string, GraphemeComplete>();
    for (const grapheme of etymologApi.grapheme.getAllComplete().data!.graphemes) {
        for (const phoneme of grapheme.phonemes) map.set(phoneme.phoneme, grapheme);
    }
    return map;
}

function cell(ipa: string): HTMLElement {
    const td = container!.querySelector<HTMLElement>(`td[data-ipa="${ipa}"]`);
    if (!td) throw new Error(`no cell ${ipa}`);
    return td;
}

function preview(ipa: string): HTMLElement | null {
    return cell(ipa).querySelector<HTMLElement>('[data-composed-preview]');
}

describe('syllabary composed previews', () => {
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

    it('IPA syllabary: an empty cell whose sounds have signs shows the dimmed composed block', async () => {
        const phonemeMap = seed(true);
        const onCellClick = vi.fn();
        await render(<IPASyllabaryChart phonemeMap={phonemeMap} onCellClick={onCellClick} />);

        const ka = preview('ka');
        expect(ka).not.toBeNull();
        expect(ka!.title).toBe('Composed from k + a — click to create a dedicated sign');
        // One composed block holding both signs.
        expect(ka!.innerHTML).toContain('k-mark');
        expect(ka!.innerHTML).toContain('a-mark');
        const blockSvg = [...ka!.querySelectorAll('svg')].find(
            (svg) => [...svg.children].filter((c) => c.tagName.toLowerCase() === 'svg').length === 2,
        );
        expect(blockSvg).toBeDefined();

        // The cell keeps its click-to-create behaviour.
        await act(async () => {
            ka!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onCellClick).toHaveBeenCalledWith('ka', null);
    });

    it('IPA syllabary: a cell missing a sound stays empty; an assigned cell is untouched', async () => {
        const phonemeMap = seed(true);
        await render(<IPASyllabaryChart phonemeMap={phonemeMap} />);
        expect(preview('ta')).toBeNull(); // no t
        expect(preview('ki')).toBeNull(); // no i
        expect(cell('ta').textContent).toBe('ta');
        // The standalone-vowel row has no consonant: an assigned `a` cell, no preview.
        const vowelCells = container!.querySelectorAll('td[data-ipa="a"]');
        expect(vowelCells.length).toBeGreaterThan(0);
        expect(vowelCells[0].querySelector('[data-composed-preview]')).toBeNull();
        // Only the one previewable cell in the whole chart.
        expect(container!.querySelectorAll('[data-composed-preview]')).toHaveLength(1);
    });

    it('IPA syllabary: with the scheme disabled no cell previews anything', async () => {
        const phonemeMap = seed(false);
        await render(<IPASyllabaryChart phonemeMap={phonemeMap} />);
        expect(container!.querySelectorAll('[data-composed-preview]')).toHaveLength(0);
        expect(cell('ka').textContent).toBe('ka');
    });

    it('custom syllabary chart: same rules', async () => {
        const phonemeMap = seed(true);
        const onCellClick = vi.fn();
        await render(<CustomSyllabaryChart chart={CHART} phonemeMap={phonemeMap} onCellClick={onCellClick} />);

        expect(preview('ka')!.title).toBe('Composed from k + a — click to create a dedicated sign');
        expect(preview('ki')).toBeNull();
        expect(preview('ta')).toBeNull();
        expect(preview('ti')).toBeNull();

        await act(async () => {
            preview('ka')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onCellClick).toHaveBeenCalledWith('ka', null);
    });

    it('custom syllabary chart: scheme disabled → no previews', async () => {
        const phonemeMap = seed(false);
        await render(<CustomSyllabaryChart chart={CHART} phonemeMap={phonemeMap} />);
        expect(container!.querySelectorAll('[data-composed-preview]')).toHaveLength(0);
    });

    it('a cell that HAS its own sign never previews, even when its sounds are spellable', async () => {
        const phonemeMap = seed(true);
        const glyph = etymologApi.glyph.create({ name: 'ka-mark', svg_data: '<svg viewBox="0 0 100 100"><path d="ka-own"/></svg>' }).data!;
        const ka = etymologApi.grapheme.create({
            name: 'ka',
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
            phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }],
        }).data!;
        phonemeMap.set('ka', etymologApi.grapheme.getAllComplete().data!.graphemes.find((g) => g.id === ka.id)!);
        await render(<CustomSyllabaryChart chart={CHART} phonemeMap={phonemeMap} />);
        expect(preview('ka')).toBeNull();
        expect(cell('ka').innerHTML).toContain('ka-own');
    });
});
