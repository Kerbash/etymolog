/**
 * validateWritingSystem — the direction contradictions plus the block-scheme
 * rule: a scheme switched ON with zero templates groups nothing.
 */

import { describe, expect, it } from 'vitest';

import type { WritingSystemSettings } from '../../db/api/types';
import { cloneEmptyBlockScheme } from '../../blocks';
import { BLOCKS_WITHOUT_TEMPLATES_MESSAGE, validateBlockSchemeUsage, validateWritingSystem } from '../index';

const OK: WritingSystemSettings = {
    glyphDirection: 'ltr',
    wordOrder: 'ltr',
    lineProgression: 'ttb',
    wordWrap: 'word',
    baselineAlignment: 'center',
} as WritingSystemSettings;

describe('validateWritingSystem', () => {
    it('reports nothing for a consistent system without a scheme', () => {
        expect(validateWritingSystem(OK)).toEqual([]);
        expect(validateWritingSystem(OK, null)).toEqual([]);
    });

    it('every warning carries a title', () => {
        const warnings = validateWritingSystem({ ...OK, lineProgression: 'rtl' } as WritingSystemSettings);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].title).toBe('These rules contradict each other');
    });

    it('warns when blocks are enabled with zero templates — and only then', () => {
        const off = cloneEmptyBlockScheme();
        const on = { ...off, enabled: true };
        expect(validateWritingSystem(OK, off)).toEqual([]);
        expect(validateWritingSystem(OK, on)).toEqual([
            { keys: ['blockScheme'], title: 'Blocks have no templates', message: BLOCKS_WITHOUT_TEMPLATES_MESSAGE },
        ]);
        const withTemplate = {
            ...on,
            roles: [{ id: 'r', label: 'R', matcher: { kind: 'any' as const } }],
            templates: [{ id: 't', name: 'T', pattern: ['r'], slots: [{ roleId: 'r', groupId: null, x: 0, y: 0, w: 1, h: 1 }] }],
        };
        expect(validateBlockSchemeUsage(withTemplate)).toEqual([]);
    });
});
