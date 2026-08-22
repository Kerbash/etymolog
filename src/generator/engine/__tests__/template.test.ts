/**
 * Syllable-template grammar.
 *
 * The parser is the contract between the shape editor (which shows the user an
 * error), the settings validator (which refuses to persist a bad pattern) and
 * the generator (which expands a good one). Every error case is pinned with its
 * POSITION as well as its message, because the position is what the editor puts
 * a caret at and it is the part that silently rots when the scanner changes.
 *
 * Node environment: pure functions, no DOM.
 */

import { describe, expect, it, vi } from 'vitest';
import {
    expandTemplate,
    isValidTemplatePattern,
    parseTemplate,
    templateHasVowelSlot,
    TemplateSyntaxError,
    OPTIONAL_CHANCE,
} from '../template';
import type { TemplateItem } from '../template';

/** The failure a pattern produces, as `{ message, position }`. Fails the test if it parses. */
function failure(pattern: string): { message: string; position: number } {
    try {
        parseTemplate(pattern);
    } catch (error) {
        if (error instanceof TemplateSyntaxError) {
            return { message: error.message, position: error.position };
        }
        throw error;
    }
    throw new Error(`expected "${pattern}" to be rejected`);
}

describe('parseTemplate — class letters', () => {
    it('parses a bare CV', () => {
        expect(parseTemplate('CV')).toEqual([
            { kind: 'class', letter: 'C', optional: false },
            { kind: 'class', letter: 'V', optional: false },
        ]);
    });

    it('parses every reserved class letter', () => {
        const items = parseTemplate('CVPFSNLGRO');
        expect(items).toHaveLength(10);
        expect(items.map((item) => (item.kind === 'class' ? item.letter : '?')).join(''))
            .toBe('CVPFSNLGRO');
    });

    it('ignores whitespace between items', () => {
        expect(parseTemplate('  C V  C ')).toEqual(parseTemplate('CVC'));
    });

    it('rejects a lower-case letter at its own position', () => {
        expect(failure('cv')).toEqual({
            message: expect.stringContaining('"c"'),
            position: 0,
        });
    });

    it('rejects an unknown letter and names the class letters in the message', () => {
        const result = failure('CVX');
        expect(result.position).toBe(2);
        expect(result.message).toContain('"X"');
        expect(result.message).toContain('C V P F S N L G R O');
    });

    it('rejects a digit (there is no weighted-optional syntax in v1)', () => {
        expect(failure('(C)70').position).toBe(3);
    });
});

describe('parseTemplate — optional groups', () => {
    it('marks the wrapped item optional and leaves the rest alone', () => {
        expect(parseTemplate('(C)V(N)')).toEqual([
            { kind: 'class', letter: 'C', optional: true },
            { kind: 'class', letter: 'V', optional: false },
            { kind: 'class', letter: 'N', optional: true },
        ]);
    });

    it('wraps a literal group too', () => {
        expect(parseTemplate('CV([n ŋ])')).toEqual([
            { kind: 'class', letter: 'C', optional: false },
            { kind: 'class', letter: 'V', optional: false },
            { kind: 'literal', members: ['n', 'ŋ'], optional: true },
        ]);
    });

    it('rejects nesting at the inner parenthesis', () => {
        expect(failure('((C))')).toEqual({
            message: 'optional groups cannot be nested',
            position: 1,
        });
    });

    it('rejects an empty group at the opening parenthesis', () => {
        expect(failure('C()V')).toEqual({
            message: 'an optional group cannot be empty',
            position: 1,
        });
    });

    it('rejects more than one item in a group and says what to write instead', () => {
        const result = failure('(CC)V');
        expect(result.position).toBe(2);
        expect(result.message).toContain('(C)(C)');
    });

    it('rejects an unclosed group at the opening parenthesis', () => {
        expect(failure('CV(N')).toEqual({
            message: expect.stringContaining('unclosed optional group'),
            position: 2,
        });
    });

    it('rejects a closing parenthesis with nothing open', () => {
        expect(failure('CV)')).toEqual({
            message: expect.stringContaining('no optional group is open'),
            position: 2,
        });
    });
});

describe('parseTemplate — literal groups', () => {
    it('splits an unspaced group into phonemes', () => {
        expect(parseTemplate('[nŋ]')).toEqual([
            { kind: 'literal', members: ['n', 'ŋ'], optional: false },
        ]);
    });

    it('keeps a tie-barred affricate whole without spaces', () => {
        expect(parseTemplate('[t͡ʃk]')).toEqual([
            { kind: 'literal', members: ['t͡ʃ', 'k'], optional: false },
        ]);
    });

    it('splits a tie-BARLESS affricate — which is why the spaced form exists', () => {
        expect(parseTemplate('[tʃk]')).toEqual([
            { kind: 'literal', members: ['t', 'ʃ', 'k'], optional: false },
        ]);
        expect(parseTemplate('[tʃ k]')).toEqual([
            { kind: 'literal', members: ['tʃ', 'k'], optional: false },
        ]);
    });

    it('splits on whitespace as soon as the group contains any', () => {
        expect(parseTemplate('[t͡ʃ k]')).toEqual([
            { kind: 'literal', members: ['t͡ʃ', 'k'], optional: false },
        ]);
        expect(parseTemplate('[  n   ŋ  ]')).toEqual([
            { kind: 'literal', members: ['n', 'ŋ'], optional: false },
        ]);
    });

    it('keeps modifiers on their base in the unspaced form', () => {
        expect(parseTemplate('[pʰtʰ]')).toEqual([
            { kind: 'literal', members: ['pʰ', 'tʰ'], optional: false },
        ]);
    });

    it('drops a duplicate member rather than weighting it twice', () => {
        expect(parseTemplate('[n n ŋ]')).toEqual([
            { kind: 'literal', members: ['n', 'ŋ'], optional: false },
        ]);
    });

    it('parses a literal group in the middle of a template', () => {
        expect(parseTemplate('CV[nŋ]')).toEqual([
            { kind: 'class', letter: 'C', optional: false },
            { kind: 'class', letter: 'V', optional: false },
            { kind: 'literal', members: ['n', 'ŋ'], optional: false },
        ]);
    });

    it('rejects an empty group at the opening bracket', () => {
        expect(failure('CV[]')).toEqual({
            message: 'a literal group cannot be empty',
            position: 2,
        });
        expect(failure('[   ]').position).toBe(0);
    });

    it('rejects an unclosed group at the opening bracket', () => {
        expect(failure('CV[nŋ')).toEqual({
            message: expect.stringContaining('unclosed literal group'),
            position: 2,
        });
    });

    it('rejects a closing bracket with nothing open', () => {
        expect(failure('CV]')).toEqual({
            message: expect.stringContaining('no literal group is open'),
            position: 2,
        });
    });

    it('rejects a second opening bracket inside a group (a missing "]")', () => {
        expect(failure('[a[b]')).toEqual({
            message: 'unexpected "[" inside a literal group',
            position: 2,
        });
    });

    it('reports positions in code UNITS, past a multi-code-point member', () => {
        // '[' 0, 't' 1, U+0361 2, 'ʃ' 3, ']' 4, 'X' 5
        expect(failure('[t͡ʃ]X').position).toBe(5);
    });
});

describe('parseTemplate — whole-pattern failures', () => {
    it('rejects an empty pattern', () => {
        expect(failure('')).toEqual({ message: 'a template cannot be empty', position: 0 });
    });

    it('rejects a whitespace-only pattern', () => {
        expect(failure('   ')).toEqual({ message: 'a template cannot be empty', position: 0 });
    });

    it('rejects a non-string', () => {
        expect(failure(null as unknown as string)).toEqual({
            message: 'a template must be text',
            position: 0,
        });
    });

    it('throws a real TemplateSyntaxError', () => {
        let caught: unknown;
        try {
            parseTemplate('CVX');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(TemplateSyntaxError);
        expect(caught).toBeInstanceOf(Error);
        expect((caught as TemplateSyntaxError).name).toBe('TemplateSyntaxError');
    });
});

describe('isValidTemplatePattern', () => {
    it('accepts every shape the presets use', () => {
        for (const pattern of ['CV', 'CVC', 'CCVC', 'CVCC', 'CCV', 'V', 'CVR', 'CLV', 'CVN', 'CV[nŋ]', 'CV[n s r l]']) {
            expect(isValidTemplatePattern(pattern)).toEqual({ ok: true });
        }
    });

    it('reports the parser\'s own message and position', () => {
        expect(isValidTemplatePattern('CVX')).toEqual({
            ok: false,
            message: expect.stringContaining('"X"'),
            position: 2,
        });
    });

    it('does not swallow a non-syntax error', () => {
        // A frozen/odd input still goes through the same path; the guarantee is
        // that only TemplateSyntaxError becomes `{ ok: false }`.
        expect(isValidTemplatePattern('(C)')).toEqual({ ok: true });
    });
});

describe('templateHasVowelSlot', () => {
    it('is true for a V slot', () => {
        expect(templateHasVowelSlot(parseTemplate('CVC'))).toBe(true);
    });

    it('is true for an OPTIONAL V slot — the question is what it can produce', () => {
        expect(templateHasVowelSlot(parseTemplate('C(V)'))).toBe(true);
    });

    it('is false for a template of consonant classes only', () => {
        expect(templateHasVowelSlot(parseTemplate('CNL'))).toBe(false);
    });

    it('is true for a literal group of vowels only', () => {
        expect(templateHasVowelSlot(parseTemplate('C[a e i]'))).toBe(true);
    });

    it('is false for a mixed literal group — it can come out a consonant', () => {
        expect(templateHasVowelSlot(parseTemplate('C[a n]'))).toBe(false);
    });

    it('is false for a literal group of unrecognised symbols', () => {
        expect(templateHasVowelSlot(parseTemplate('C[¤ §]'))).toBe(false);
    });
});

describe('expandTemplate', () => {
    const items = parseTemplate('(C)V(N)');

    it('keeps every optional item when the rng is below the threshold', () => {
        const expanded = expandTemplate(items, () => 0);
        expect(expanded).toEqual([
            { kind: 'class', letter: 'C', optional: false },
            { kind: 'class', letter: 'V', optional: false },
            { kind: 'class', letter: 'N', optional: false },
        ]);
    });

    it('drops every optional item when the rng is at or above the threshold', () => {
        expect(expandTemplate(items, () => OPTIONAL_CHANCE)).toEqual([
            { kind: 'class', letter: 'V', optional: false },
        ]);
        expect(expandTemplate(items, () => 0.99)).toEqual([
            { kind: 'class', letter: 'V', optional: false },
        ]);
    });

    it('resolves each optional item independently, in order', () => {
        const rng = vi.fn<() => number>()
            .mockReturnValueOnce(0.9)   // drop the C
            .mockReturnValueOnce(0.1);  // keep the N
        expect(expandTemplate(items, rng)).toEqual([
            { kind: 'class', letter: 'V', optional: false },
            { kind: 'class', letter: 'N', optional: false },
        ]);
    });

    it('draws exactly one random number per OPTIONAL item and none for the rest', () => {
        const rng = vi.fn<() => number>().mockReturnValue(0);
        expandTemplate(parseTemplate('CCV(N)'), rng);
        expect(rng).toHaveBeenCalledTimes(1);
    });

    it('does not draw at all for a template with no optionals', () => {
        const rng = vi.fn<() => number>().mockReturnValue(0);
        expect(expandTemplate(parseTemplate('CVC'), rng)).toHaveLength(3);
        expect(rng).not.toHaveBeenCalled();
    });

    it('carries a literal group through with its members', () => {
        const expanded = expandTemplate(parseTemplate('CV([n ŋ])'), () => 0);
        expect(expanded[2]).toEqual({ kind: 'literal', members: ['n', 'ŋ'], optional: false });
    });

    it('does not mutate the parsed items it was given', () => {
        const source: TemplateItem[] = parseTemplate('(C)V');
        expandTemplate(source, () => 0);
        expect(source[0].optional).toBe(true);
    });
});
