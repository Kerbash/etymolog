import Modal from 'cyber-components/container/modal/modal.tsx';
import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import LabelShiftTextInput from 'smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput';
import TextInputValidatorFactory from 'smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory';

import { DialogPanel, FormActionBar } from '../../shared';
import styles from './ConlangNameModal.module.scss';

interface ConlangNameModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    initialName?: string;
    onSubmit: (name: string) => void;
    allowClose?: boolean;
}

const MAX_NAME_LENGTH = 100;

/**
 * ConlangNameModal — names a new conlang, and renames an existing one.
 *
 * This is the FIRST input a new user ever meets, and until now it was a raw
 * `<input>` with an inline style, a placeholder and no `<label>` — announced by
 * a screen reader as "edit text, blank". It is a SmartForm now, like every
 * other form in the monorepo: `LabelShiftTextInput` carries a real label,
 * validation is declared rather than hand-rolled (`isValid` used to be a
 * `trim().length > 0` in the component), and the submit button is gated on
 * `formState.isSubmittable`.
 *
 * The action bar lives INSIDE `<SmartForm>` rather than in `DialogPanel`'s
 * `actions` slot, because a submit button outside its form submits nothing.
 *
 * Remount semantics: HeadlessUI's Dialog unmounts its children when closed, so
 * `defaultValue` is re-read every time the modal opens — which is what makes
 * "rename" arrive pre-filled with the CURRENT name and "create" arrive empty,
 * without an effect that copies props into state.
 */
export default function ConlangNameModal({
    isOpen,
    setIsOpen,
    initialName = '',
    onSubmit,
    allowClose = true,
}: ConlangNameModalProps) {
    const { registerField, registerForm, unregisterField } = useSmartForm({ mode: 'onChange' });

    const formProps = registerForm('conlangName', {
        // Synchronous, in-memory settings write — there is nothing to lock the
        // form for, and locking would flash the processing modal over a
        // one-field dialog.
        lockFormOnSubmit: false,
        submitFunc: async (formData: Record<string, unknown>) => {
            const name = String(formData.conlangName ?? '').trim();
            if (!name) {
                return { success: false, message: 'A conlang name is required.' };
            }
            onSubmit(name);
            setIsOpen(false);
            return { success: true };
        },
    });

    const nameField = registerField('conlangName', {
        defaultValue: initialName,
        validation: TextInputValidatorFactory({
            required: { value: true, message: 'A conlang name is required.' },
            maxLength: {
                value: MAX_NAME_LENGTH,
                message: `Keep the name under ${MAX_NAME_LENGTH} characters.`,
            },
        }),
    });

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen} allowClose={allowClose}>
            <DialogPanel size="sm" title={initialName ? 'Rename conlang' : 'Name your conlang'}>
                <SmartForm
                    {...formProps}
                    registerField={registerField}
                    unregisterField={unregisterField}
                    className={styles.form}
                >
                    <LabelShiftTextInput
                        displayName="Conlang name"
                        {...nameField}
                        showCharCounter
                        inputProps={{ autoFocus: true }}
                    />

                    <FormActionBar
                        onCancel={allowClose ? () => setIsOpen(false) : undefined}
                        submitLabel={initialName ? 'Rename' : 'Create'}
                        disabled={!formProps.formState.isSubmittable}
                    />
                </SmartForm>
            </DialogPanel>
        </Modal>
    );
}
