// @vitest-environment happy-dom
/**
 * PronunciationTableInput — the sound hint under a row
 * (DIPHTHONG_BLOCKS_PLAN.md §4.3).
 *
 * The table runs inside a real SmartForm with its real IPA text input. The
 * row text lives in the inner form's uncontrolled field; the table observes it
 * from the bubbling `input` event, so typing is simulated the way the IPA
 * keyboard itself edits the field (native value setter + `input` event).
 *
 * Asserted:
 *  - typing `ng` into row 1 shows the note with the ŋ sentence, and changing
 *    it to a single sound removes the note (the text itself is never changed);
 *  - a row that STARTS with `ng` (edit mode) shows the note on mount;
 *  - a vowel sequence or a syllable shows nothing.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import { PronunciationTableInput, type PronunciationRowValue } from '..';

const NG_HINT = 'ng reads as two sounds (n, g). If it is one sound, spell it ŋ.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Host({ rows }: { rows: PronunciationRowValue[] }) {
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('soundHintTestForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
    return (
        <SmartForm {...formProps} registerField={registerField} unregisterField={unregisterField}>
            <PronunciationTableInput {...registerField('pronunciations', {})} defaultValue={rows} />
        </SmartForm>
    );
}

async function mount(rows: PronunciationRowValue[]) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<Host rows={rows} />);
    });
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

const rowInputs = () => [...container!.querySelectorAll<HTMLInputElement>('tbody td:first-child input')];
const hints = () => [...container!.querySelectorAll('[data-sound-hint]')];

async function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

describe('PronunciationTableInput — sound hint', () => {
    it('typing ng into row 1 shows the note; a single sound removes it', async () => {
        await mount([]);
        expect(hints()).toHaveLength(0);

        const [first] = rowInputs();
        await type(first, 'ng');
        const [hint] = hints();
        expect(hint?.textContent).toBe(NG_HINT);
        expect(hint.getAttribute('role')).toBe('note');
        expect(hint.closest('td')).toBe(first.closest('td'));
        // A hint, never a change: the text is what was typed.
        expect(first.value).toBe('ng');

        await type(first, 'ŋ');
        expect(hints()).toHaveLength(0);
    });

    it('a row that starts with ng (edit mode) shows the note on mount, under that row only', async () => {
        await mount([
            { pronunciation: 'a', useInAutoSpelling: true },
            { pronunciation: 'ng', useInAutoSpelling: false },
        ]);
        const found = hints();
        expect(found).toHaveLength(1);
        expect(found[0].textContent).toBe(NG_HINT);
        expect(found[0].closest('td')).toBe(rowInputs()[1].closest('td'));
    });

    it.each(['ai', 'ka', 't'])('%s shows no note', async (text) => {
        await mount([]);
        await type(rowInputs()[0], text);
        expect(hints()).toHaveLength(0);
    });
});
