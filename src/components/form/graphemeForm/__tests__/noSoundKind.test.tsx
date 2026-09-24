// @vitest-environment happy-dom
/**
 * The two KINDS of no-sound grapheme — a word symbol (logogram) and a mark
 * (vowel-killer, accent) — and the grapheme form's "No sound" option that
 * chooses between them.
 *
 *  - `isMarkGrapheme` / `isLogogramGrapheme`: a mark is category `'mark'`; a
 *    logogram is category `'logogram'` or sound-less, but never a mark;
 *  - `initialNoSoundKind` / `categoryForNoSoundKind`: the kind a stored
 *    grapheme starts on, and the category rule (stamp only over an empty
 *    category or the OTHER kind's constant);
 *  - the form: the kind radios appear only with "No sound" ticked, each kind
 *    stamps its category under that rule, the note follows the kind, and on
 *    edit a stored mark starts on "A mark".
 *
 * The form runs on the REAL provider stack (`testHarness`) inside a real
 * SmartForm; only the text input is swapped for a plain `<input>` (honouring
 * the field's `defaultValue`, as the real one does) so the category can be
 * typed and read directly.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';

vi.mock('smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx', () => ({
    default: (props: {
        displayName?: string;
        registerSmartFieldProps: {
            ref?: React.Ref<HTMLInputElement>;
            name?: string;
            defaultValue?: string;
            onChange?: (e: unknown) => void;
        };
    }) => (
        <input
            type="text"
            aria-label={props.displayName}
            data-fieldname={props.registerSmartFieldProps.name}
            ref={props.registerSmartFieldProps.ref}
            name={props.registerSmartFieldProps.name}
            defaultValue={props.registerSmartFieldProps.defaultValue}
            onChange={props.registerSmartFieldProps.onChange}
        />
    ),
}));

import { clearDatabase, initDatabase } from '../../../../db/database';
import type { GraphemeComplete } from '../../../../db/types';
import { MARK_CATEGORY, WORD_SYMBOL_CATEGORY } from '../../../../db/wordSymbolService';
import { mountHarness, settle, type Harness } from '../../../tabs/grapheme/__tests__/testHarness';
import {
    categoryForNoSoundKind,
    initialNoSoundKind,
    isLogogramGrapheme,
    isMarkGrapheme,
} from '../logogramOption';

const { default: GraphemeFormFields } = await import('../GraphemeFormFields');
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');

const PHONEME = { id: 1, grapheme_id: 1, phoneme: 'a', use_in_auto_spelling: true, context: null };

function grapheme(category: string | null, phonemes: GraphemeComplete['phonemes'] = []): GraphemeComplete {
    return { id: 1, name: 'x', category, notes: null, folder_id: null, created_at: '', updated_at: '', glyphs: [], phonemes };
}

describe('isMarkGrapheme / isLogogramGrapheme', () => {
    it('a mark is category "mark" (trimmed), with or without sound', () => {
        expect(MARK_CATEGORY).toBe('mark');
        expect(isMarkGrapheme(grapheme('mark'))).toBe(true);
        expect(isMarkGrapheme(grapheme('  mark '))).toBe(true);
        expect(isMarkGrapheme(grapheme('mark', [PHONEME]))).toBe(true);
        expect(isMarkGrapheme(grapheme('Marks'))).toBe(false);
        expect(isMarkGrapheme(grapheme(null))).toBe(false);
        expect(isMarkGrapheme(grapheme(WORD_SYMBOL_CATEGORY))).toBe(false);
    });

    it('a logogram is category "logogram" or sound-less — but never a mark', () => {
        expect(isLogogramGrapheme(grapheme(WORD_SYMBOL_CATEGORY))).toBe(true);
        expect(isLogogramGrapheme(grapheme(WORD_SYMBOL_CATEGORY, [PHONEME]))).toBe(true);
        expect(isLogogramGrapheme(grapheme(null))).toBe(true);
        expect(isLogogramGrapheme(grapheme('Numbers'))).toBe(true);
        expect(isLogogramGrapheme(grapheme(null, [PHONEME]))).toBe(false);
        expect(isLogogramGrapheme(grapheme(MARK_CATEGORY))).toBe(false);
        expect(isLogogramGrapheme(grapheme(' mark '))).toBe(false);
    });
});

describe('initialNoSoundKind / categoryForNoSoundKind', () => {
    it('starts on "mark" only for a stored mark; a new grapheme is a word symbol', () => {
        expect(initialNoSoundKind('create', null)).toBe('wordSymbol');
        expect(initialNoSoundKind('create', grapheme(MARK_CATEGORY))).toBe('wordSymbol');
        expect(initialNoSoundKind('edit', grapheme(MARK_CATEGORY))).toBe('mark');
        expect(initialNoSoundKind('edit', grapheme(WORD_SYMBOL_CATEGORY))).toBe('wordSymbol');
        expect(initialNoSoundKind('edit', grapheme(null))).toBe('wordSymbol');
    });

    it('stamps only over an empty category or the other kind', () => {
        expect(categoryForNoSoundKind('', 'wordSymbol')).toBe(WORD_SYMBOL_CATEGORY);
        expect(categoryForNoSoundKind('   ', 'mark')).toBe(MARK_CATEGORY);
        expect(categoryForNoSoundKind(WORD_SYMBOL_CATEGORY, 'mark')).toBe(MARK_CATEGORY);
        expect(categoryForNoSoundKind(MARK_CATEGORY, 'wordSymbol')).toBe(WORD_SYMBOL_CATEGORY);
        // Already right, or the user's own: left alone.
        expect(categoryForNoSoundKind(MARK_CATEGORY, 'mark')).toBeNull();
        expect(categoryForNoSoundKind('Accents', 'mark')).toBeNull();
        expect(categoryForNoSoundKind('Accents', 'wordSymbol')).toBeNull();
    });
});

function Host({ mode, initialData }: { mode: 'create' | 'edit'; initialData?: GraphemeComplete }) {
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('noSoundKindTestForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
    return (
        <SmartForm {...formProps} registerField={registerField} unregisterField={unregisterField}>
            <GraphemeFormFields registerField={registerField} mode={mode} initialData={initialData} />
        </SmartForm>
    );
}

let harness: Harness | null = null;

const q = () => harness!.container;
const noSoundBox = () =>
    [...q().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
        (el) => el.parentElement?.textContent?.trim() === 'No sound',
    )!;
const kindRadio = (value: 'wordSymbol' | 'mark') =>
    q().querySelector<HTMLInputElement>(`[data-no-sound-kind] input[type="radio"][value="${value}"]`);
const categoryInput = () => q().querySelector<HTMLInputElement>('input[data-fieldname="category"]')!;

async function click(el: HTMLElement) {
    await act(async () => {
        el.click();
    });
    await settle(2);
}

async function typeCategory(value: string) {
    const el = categoryInput();
    await act(async () => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(1);
}

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
});
afterEach(() => {
    harness?.unmount();
    harness = null;
});

describe('GraphemeFormFields — "No sound" and its kind', () => {
    it('the kind radios appear only while "No sound" is ticked; word symbol is the default', async () => {
        harness = await mountHarness(<Host mode="create" />);
        expect(noSoundBox().checked).toBe(false);
        expect(q().querySelector('[data-no-sound-kind]')).toBeNull();
        expect(harness.text()).not.toContain('this grapheme is a logogram');

        await click(noSoundBox());
        const fieldset = q().querySelector('[data-no-sound-kind]')!;
        expect(fieldset.querySelector('legend')?.textContent).toBe('What kind of sign is it?');
        expect(fieldset.textContent).toContain('A word symbol (logogram)');
        expect(fieldset.textContent).toContain('Stands for a whole word or idea.');
        expect(fieldset.textContent).toContain('A mark');
        expect(fieldset.textContent).toContain(
            'Added to other signs, like a vowel-killer or an accent. It is never used on its own in auto-spelling.',
        );
        expect(kindRadio('wordSymbol')!.checked).toBe(true);
        expect(kindRadio('mark')!.checked).toBe(false);
        expect(harness.text()).toContain('word form’s Logogram tab');

        await click(noSoundBox());
        expect(q().querySelector('[data-no-sound-kind]')).toBeNull();
    });

    it('an empty category gets the kind’s one, and switching kinds swaps it', async () => {
        harness = await mountHarness(<Host mode="create" />);
        await click(noSoundBox());
        expect(categoryInput().value).toBe(WORD_SYMBOL_CATEGORY);

        await click(kindRadio('mark')!);
        expect(kindRadio('mark')!.checked).toBe(true);
        expect(categoryInput().value).toBe(MARK_CATEGORY);
        expect(harness.text()).toContain(
            'Choose it as the vowel-killer mark on Writing System → Blocks, or place it in a word by hand.',
        );
        expect(harness.text()).not.toContain('Logogram tab');

        await click(kindRadio('wordSymbol')!);
        expect(categoryInput().value).toBe(WORD_SYMBOL_CATEGORY);
    });

    it('a category the user typed is never overwritten', async () => {
        harness = await mountHarness(<Host mode="create" />);
        await typeCategory('Accents');
        await click(noSoundBox());
        expect(categoryInput().value).toBe('Accents');
        await click(kindRadio('mark')!);
        expect(categoryInput().value).toBe('Accents');
        await click(kindRadio('wordSymbol')!);
        expect(categoryInput().value).toBe('Accents');
    });

    it('edit: a stored mark starts on "A mark" and keeps its category', async () => {
        // A STABLE initialData, as the edit page passes: the form's one-shot
        // edit seeding is keyed on it.
        const stored = { ...grapheme(MARK_CATEGORY), name: 'Halant' };
        harness = await mountHarness(<Host mode="edit" initialData={stored} />);
        await settle(3);
        expect(noSoundBox().checked).toBe(true);
        expect(kindRadio('mark')!.checked).toBe(true);
        expect(categoryInput().value).toBe(MARK_CATEGORY);
    });

    it('edit: a stored logogram starts on "A word symbol"', async () => {
        const stored = { ...grapheme(WORD_SYMBOL_CATEGORY), name: 'moon' };
        harness = await mountHarness(<Host mode="edit" initialData={stored} />);
        await settle(3);
        expect(kindRadio('wordSymbol')!.checked).toBe(true);
    });
});
