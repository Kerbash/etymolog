// @vitest-environment happy-dom
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BlockScheme } from '../../../../blocks/types';
import { blockGuideOptions, describeBoxSize, guideKey, roleColours, setBlockGuideKey } from '../blockGuide';
import BlockGuideOverlay from '../BlockGuideOverlay';
import BlockGuidePicker from '../BlockGuidePicker';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const scheme: BlockScheme = {
    version: 1,
    enabled: true,
    roles: [
        { id: 'c', label: 'C', colour: 'var(--red)', matcher: { kind: 'class', value: 'C' } as never },
        { id: 'v', label: 'V', matcher: { kind: 'class', value: 'V' } as never },
    ],
    templates: [
        {
            id: 'cv',
            name: 'CV',
            pattern: ['c', 'v'],
            slots: [
                { roleId: 'v', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1, fill: 'fill' },
                { roleId: 'c', groupId: null, x: 0, y: 0, w: 0.5, h: 1 },
            ],
        },
    ],
};

describe('blockGuideOptions', () => {
    it('lists every box in pattern order with its role label', () => {
        const options = blockGuideOptions(scheme);
        expect(options.map((o) => [o.key, o.roleLabel, o.slot.x])).toEqual([
            [guideKey('cv', 'c'), 'C', 0],
            [guideKey('cv', 'v'), 'V', 0.5],
        ]);
    });

    it('is empty without a scheme', () => {
        expect(blockGuideOptions(null)).toEqual([]);
    });

    it('describes a box as a share of the block', () => {
        expect(describeBoxSize({ roleId: 'c', groupId: null, x: 0, y: 0, w: 0.5, h: 0.375 })).toBe('50% wide × 38% tall');
    });

    it('remembers the chosen box per device', () => {
        setBlockGuideKey(guideKey('cv', 'v'));
        expect(window.localStorage.getItem('etymolog:glyphBlockGuide')).toBe(guideKey('cv', 'v'));
        setBlockGuideKey(null);
        expect(window.localStorage.getItem('etymolog:glyphBlockGuide')).toBeNull();
    });
});

describe('BlockGuidePicker + overlay', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('renders nothing when the script has no templates', () => {
        act(() => root.render(<BlockGuidePicker options={[]} chosen={null} onChange={() => {}} />));
        expect(container.innerHTML).toBe('');
    });

    it('groups boxes by template and explains the chosen one, Fill included', () => {
        const options = blockGuideOptions(scheme);
        let picked: string | null = 'unset';
        act(() => root.render(<BlockGuidePicker options={options} chosen={options[1]} onChange={(k) => { picked = k; }} />));
        const select = container.querySelector('select')!;
        expect(container.querySelector('optgroup')?.getAttribute('label')).toBe('CV');
        expect([...select.options].map((o) => o.text)).toEqual(['None', 'CV › C box', 'CV › V box']);
        const hint = container.querySelector('[data-block-guide-hint]')!.textContent!;
        expect(hint).toContain('the V box of CV, 50% wide × 100% tall');
        expect(hint).toContain('set to Fill');

        act(() => {
            select.value = '';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(picked).toBeNull();
    });

    it('paints the template in the canvas guide square with the chosen box highlighted', () => {
        const [cBox] = blockGuideOptions(scheme);
        act(() => root.render(<svg><BlockGuideOverlay guide={cBox} colours={roleColours(scheme)} /></svg>));
        const chosen = container.querySelector('[data-guide-box="chosen"]')!;
        // Guide square = 75..225 on the 300 canvas (GLYPH_GUIDE_INSET 0.25).
        expect([chosen.getAttribute('x'), chosen.getAttribute('width'), chosen.getAttribute('height')]).toEqual(['75', '75', '150']);
        expect((chosen as SVGElement).style.getPropertyValue('--role-colour')).toBe('var(--red)');
        expect(container.querySelectorAll('rect')).toHaveLength(2);
    });
});
