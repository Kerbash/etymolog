import classNames from 'classnames';
import type { ReactNode } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import styles from './FormActionBar.module.scss';

export interface FormActionBarProps {
    /** Cancel handler. Omit to hide the Cancel button (rare — a form should be escapable). */
    onCancel?: () => void;
    /** Cancel label. Default `'Cancel'`. */
    cancelLabel?: ReactNode;
    /** Submit label. Default `'Save'`. */
    submitLabel?: ReactNode;
    /**
     * Submit click handler. Omit when the button is a plain `type="submit"`
     * inside a form that handles submission itself (the SmartForm case).
     */
    onSubmit?: () => void;
    /**
     * Disable the submit button. Wire this to SmartForm's
     * `!formState.isSubmittable`.
     */
    disabled?: boolean;
    /** `type` of the submit button. Default `'submit'`. */
    submitType?: 'submit' | 'button';
    /**
     * Destructive action for this record (usually Delete), rendered on the FAR
     * LEFT with the row's `space-between` putting real distance between it and
     * the Save button.
     *
     * That distance is the point. The three edit pages used to render
     * `[Save][Cancel][Delete]` as one tight row, so the irreversible control sat
     * one button-width from the one the user presses every time.
     */
    danger?: { label: ReactNode; onClick: () => void; disabled?: boolean };
    className?: string;
}

/**
 * FormActionBar — the action row of every create/edit form and dialog.
 *
 *   [ Delete ]                                     [ Cancel ] [ Save ]
 *   └ danger slot (optional)                       └ right-aligned pair
 *
 * Cancel is `buttonStyles.secondary` and Save is `.primary`, so the primary
 * action is unambiguous; the danger slot is `.danger`, which is a real class
 * (unlike the undefined `--danger` token seven delete buttons used to paint
 * themselves with, rendering invisible).
 */
export default function FormActionBar({
    onCancel,
    cancelLabel = 'Cancel',
    submitLabel = 'Save',
    onSubmit,
    disabled = false,
    submitType = 'submit',
    danger,
    className,
}: FormActionBarProps) {
    return (
        <div className={classNames(styles.bar, className)}>
            <div className={styles.dangerSlot}>
                {danger && (
                    <Button
                        type="button"
                        className={buttonStyles.danger}
                        onClick={danger.onClick}
                        disabled={danger.disabled}
                    >
                        {danger.label}
                    </Button>
                )}
            </div>

            <div className={styles.mainSlot}>
                {onCancel && (
                    <Button type="button" className={buttonStyles.secondary} onClick={onCancel}>
                        {cancelLabel}
                    </Button>
                )}
                <Button
                    type={submitType}
                    className={buttonStyles.primary}
                    onClick={onSubmit}
                    disabled={disabled}
                >
                    {submitLabel}
                </Button>
            </div>
        </div>
    );
}
