/**
 * generatorText — the page's vocabulary and the small pure functions in it.
 *
 * Node environment (the file default): none of this touches the DOM.
 *
 * Several of these are RATCHETS rather than examples. The interesting failure
 * mode for a table of labels is not "it says the wrong thing" — a reviewer
 * catches that — it is that the thing being labelled grows and the table does
 * not, so a new constraint rule shows up in a shortfall banner as
 * `noIllegalGeminates`. The tests that walk the engine's own exports are there
 * to fail on that day.
 */

import { describe, it, expect } from 'vitest';

import {
    BATCH_SIZES,
    DEFAULT_BATCH_SIZE,
    PRIMARY_CLASS_ORDER,
    QUICK_TEMPLATES,
    REJECTION_LABELS,
    SHAPE_LADDER,
    SYLLABLE_SEPARATOR,
    TILT_CYCLE,
    TILT_GLYPHS,
    TILT_LABELS,
    classGroupLabel,
    describeShortfall,
    nextShape,
    nextTilt,
    rejectionLabel,
    topRejection,
} from '../generatorText';
import {
    CLASS_LABELS,
    CLASS_LETTERS,
    CONSTRAINT_RULES,
    LIMITS,
    isValidTemplatePattern,
} from '../../../../../generator';
import type { Shortfall } from '../../../../../generator';

describe('the tilt cycle', () => {
    it('walks normal → common → rare → off and back', () => {
        expect(nextTilt('normal')).toBe('common');
        expect(nextTilt('common')).toBe('rare');
        expect(nextTilt('rare')).toBe('off');
        // A cycle that could strand a sound at `off` would be a trap: `off` is
        // the state a user reaches by accident.
        expect(nextTilt('off')).toBe('normal');
    });

    it('returns to the start after a full lap', () => {
        let tilt = TILT_CYCLE[0];
        for (let step = 0; step < TILT_CYCLE.length; step++) tilt = nextTilt(tilt);
        expect(tilt).toBe(TILT_CYCLE[0]);
    });

    it('has a word and a glyph for every tilt in the cycle', () => {
        for (const tilt of TILT_CYCLE) {
            expect(TILT_LABELS[tilt]).toBeTruthy();
            expect(TILT_GLYPHS[tilt]).toBeTruthy();
        }
    });

    it('uses a distinct glyph for each', () => {
        const glyphs = TILT_CYCLE.map((tilt) => TILT_GLYPHS[tilt]);
        expect(new Set(glyphs).size).toBe(glyphs.length);
    });
});

describe('the chip grouping order', () => {
    it('covers every class letter', () => {
        // A sound whose only class is missing from the order would fall through
        // to the fallback and be filed under the wrong heading.
        expect([...PRIMARY_CLASS_ORDER].sort()).toEqual([...CLASS_LETTERS].sort());
    });

    it('files sibilants before the general fricatives', () => {
        // `s` is both; filed as a fricative it would disappear into a heading
        // that says nothing about why it clusters the way it does.
        expect(PRIMARY_CLASS_ORDER.indexOf('S')).toBeLessThan(PRIMARY_CLASS_ORDER.indexOf('F'));
    });

    it('sentence-cases the shared class label', () => {
        expect(classGroupLabel('V')).toBe('Vowels');
        expect(classGroupLabel('N')).toBe('Nasals');
        // The words themselves come from the engine, not from a second list.
        expect(classGroupLabel('P').toLowerCase()).toBe(CLASS_LABELS.P);
    });
});

describe('the shape ladder', () => {
    it('starts with the quick-add shapes', () => {
        expect(SHAPE_LADDER.slice(0, QUICK_TEMPLATES.length)).toEqual([...QUICK_TEMPLATES]);
    });

    it('is long enough to reach the template limit', () => {
        // "Add shape" must have something distinct to add right up to the
        // limit that disables it.
        expect(SHAPE_LADDER.length).toBeGreaterThanOrEqual(LIMITS.MAX_TEMPLATES);
    });

    it('holds no duplicates', () => {
        expect(new Set(SHAPE_LADDER).size).toBe(SHAPE_LADDER.length);
    });

    it('is made entirely of patterns the parser accepts', () => {
        for (const pattern of SHAPE_LADDER) {
            expect(isValidTemplatePattern(pattern)).toEqual({ ok: true });
        }
    });

    it('gives every ladder shape a vowel slot', () => {
        // A template set with no vowel source is discarded whole by the
        // validator, so a vowel-less ladder entry could empty the profile.
        for (const pattern of SHAPE_LADDER) {
            expect(pattern).toContain('V');
        }
    });

    it('skips the shapes a profile already has', () => {
        expect(nextShape([])).toBe(SHAPE_LADDER[0]);
        expect(nextShape(['CV'])).toBe(SHAPE_LADDER[1]);
        expect(nextShape(['CV', 'CVC', 'V'])).toBe('CCV');
    });

    it('runs out rather than repeating', () => {
        expect(nextShape([...SHAPE_LADDER])).toBeNull();
    });
});

describe('batch sizes', () => {
    it('includes the default', () => {
        expect(BATCH_SIZES).toContain(DEFAULT_BATCH_SIZE);
    });

    it('never offers more than the engine limit', () => {
        expect(Math.max(...BATCH_SIZES)).toBeLessThanOrEqual(LIMITS.MAX_BATCH);
    });

    it('is in ascending order', () => {
        expect([...BATCH_SIZES].sort((a, b) => a - b)).toEqual([...BATCH_SIZES]);
    });
});

describe('rejection labels', () => {
    it('names every constraint rule the engine can reject with', () => {
        // The rejection map is keyed by the rule FUNCTION's name; a new rule
        // with no entry would surface to the user as `noIllegalGeminates`.
        for (const rule of CONSTRAINT_RULES) {
            expect(REJECTION_LABELS[rule.name]).toBeTruthy();
        }
    });

    it('names the two keys that are not rules', () => {
        expect(REJECTION_LABELS.emptySlot).toBeTruthy();
        expect(REJECTION_LABELS.duplicate).toBeTruthy();
    });

    it('falls back to the raw key rather than to nothing', () => {
        expect(rejectionLabel('somethingNew')).toBe('somethingNew');
    });
});

describe('topRejection', () => {
    it('picks the biggest count', () => {
        expect(topRejection({ a: 3, b: 12, c: 7 })).toEqual({ key: 'b', count: 12 });
    });

    it('ignores zeroes', () => {
        expect(topRejection({ a: 0, b: 0 })).toBeNull();
    });

    it('is null for an empty record', () => {
        expect(topRejection({})).toBeNull();
    });

    it('keeps the first of a tie', () => {
        expect(topRejection({ a: 5, b: 5 })?.key).toBe('a');
    });
});

describe('describeShortfall', () => {
    const exhausted = (rejected: Record<string, number>, attempts = 340): Shortfall => ({
        reason: 'exhausted',
        attempts,
        rejected,
    });

    it('leads with how far it got', () => {
        expect(describeShortfall(exhausted({ noForbiddenSequences: 300 }), 18, 20)).toContain(
            '18 of 20',
        );
    });

    it('names the rule that ate the most candidates', () => {
        const message = describeShortfall(exhausted({ noForbiddenSequences: 300, duplicate: 4 }), 18, 20);
        expect(message).toContain('340 candidates were built and rejected');
        expect(message).toContain('your forbidden sequences');
    });

    it('says nothing about a rule when nothing was rejected', () => {
        const message = describeShortfall(exhausted({}), 3, 20);
        expect(message).toContain('built and rejected');
        expect(message).not.toContain('mostly by');
    });

    it('uses the singular for one attempt', () => {
        expect(describeShortfall(exhausted({}, 1), 0, 5)).toContain('1 candidate was');
    });

    it('explains an empty inventory in its own words', () => {
        const message = describeShortfall(
            { reason: 'empty-inventory', attempts: 0, rejected: {} },
            0,
            20,
        );
        expect(message).toContain('no sounds to build from');
        expect(message).not.toContain('candidates');
    });

    it('explains a missing vowel and a missing consonant', () => {
        expect(
            describeShortfall({ reason: 'no-vowels', attempts: 0, rejected: {} }, 0, 20),
        ).toContain('no vowels');
        expect(
            describeShortfall({ reason: 'no-consonants', attempts: 0, rejected: {} }, 0, 20),
        ).toContain('no consonants');
    });

    it('handles an exhausted run that built nothing', () => {
        // The engine pins this: every shape pruned while consonants exist comes
        // back as `exhausted` with zero attempts.
        const message = describeShortfall(exhausted({}, 0), 0, 20);
        expect(message).toContain('ran out of attempts');
        expect(message).not.toContain('0 candidates');
    });

    it('ends in a full stop, whichever branch it took', () => {
        const messages = [
            describeShortfall(exhausted({ duplicate: 2 }), 1, 5),
            describeShortfall(exhausted({}), 1, 5),
            describeShortfall(exhausted({}, 0), 0, 5),
            describeShortfall({ reason: 'no-vowels', attempts: 0, rejected: {} }, 0, 5),
        ];
        for (const message of messages) expect(message.endsWith('.')).toBe(true);
    });
});

describe('the syllable separator', () => {
    it('is the interpunct, not a full stop', () => {
        // A full stop is a legal IPA syllable break and would be ambiguous with
        // one the user typed.
        expect(SYLLABLE_SEPARATOR).toBe('·');
    });
});
