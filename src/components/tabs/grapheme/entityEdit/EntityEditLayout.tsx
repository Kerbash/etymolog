/**
 * EntityEditLayout
 * ----------------
 * The ONE create/edit page skeleton for the Script Maker's two entities.
 *
 * ```
 *  ← Back to X
 *  Edit glyph "ka"                     ← PageHeader (h2, the shell owns the h1)
 *  ┌───────────────────────────────┐
 *  │  …the form's fields…          │
 *  └───────────────────────────────┘
 *  [ Delete ]              [ Cancel ] [ Save ]   ← FormActionBar
 *  └ danger slot, a row apart from Save
 * ```
 *
 * Four pages rendered four different skeletons before this — two of them with
 * their own near-identical `.module.scss`, all four with a hand-rolled "Back to
 * Gallery" nav row above an `<h2>`, and a `[Save][Cancel][Delete]` triplet that
 * put the irreversible control one button-width from the one pressed on every
 * save. The danger separation is the whole reason `FormActionBar` has a left
 * slot; this component's job is to make sure every Script Maker form gets it.
 *
 * It owns the CHROME only. The form element, its SmartForm registration and the
 * unsaved-changes wiring stay with the page, because `FormActionBar`'s submit
 * button must live INSIDE the `<SmartForm>` for `type="submit"` to reach it —
 * hence `children` is a render prop receiving the action bar to place.
 */

import type { ReactNode } from 'react';

import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { FormActionBar, LoadingState, PageHeader } from '../../../shared';

import styles from './entityEditPage.module.scss';

export interface EntityEditLayoutProps {
    /** Page title — `New glyph`, `Edit grapheme "ka"`. */
    title: ReactNode;
    /** One line under the title. */
    description?: ReactNode;
    /** Where "back" and Cancel go. */
    back: { to: string; label: ReactNode };
    /** Cancel handler. Defaults to navigating to `back.to` via `onCancel`. */
    onCancel: () => void;
    /** Submit button label. */
    submitLabel: ReactNode;
    /** Wire to `!formState.isSubmittable`. */
    submitDisabled?: boolean;
    /**
     * The destructive action for this record, rendered a row apart from Save.
     * Omit in create mode — there is nothing to delete yet.
     */
    danger?: { label: ReactNode; onClick: () => void; disabled?: boolean };
    /**
     * `false` while the database is booting: renders a form-shaped skeleton
     * under the header rather than the word "Loading".
     */
    isReady?: boolean;
    /**
     * A fatal condition that replaces the whole form — the database failed to
     * open, or the id in the URL matches nothing. `EmptyState` + a way back,
     * never a bare red sentence with no exit.
     */
    fatal?: { icon?: string; title: string; description?: string } | null;
    /**
     * The form. Receives the action bar to render at its end, INSIDE the
     * `<SmartForm>` element.
     */
    children: (actionBar: ReactNode) => ReactNode;
    /** Rendered above the form — the NavigationGuard, a picker modal, … */
    overlays?: ReactNode;
}

export default function EntityEditLayout({
    title,
    description,
    back,
    onCancel,
    submitLabel,
    submitDisabled = false,
    danger,
    isReady = true,
    fatal,
    children,
    overlays,
}: EntityEditLayoutProps) {
    const header = (
        <PageHeader title={title} as="h2" description={description} back={back} />
    );

    if (fatal) {
        return (
            <div className={styles.page}>
                {header}
                <EmptyState
                    icon={fatal.icon ?? 'exclamation-triangle'}
                    title={fatal.title}
                    description={fatal.description}
                    action={
                        <Button
                            type="button"
                            className={buttonStyles.secondary}
                            onClick={onCancel}
                        >
                            {back.label}
                        </Button>
                    }
                />
            </div>
        );
    }

    if (!isReady) {
        return (
            <div className={styles.page}>
                {header}
                <LoadingState variant="form" label="Loading the form" count={4} />
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {overlays}
            {header}
            {children(
                <FormActionBar
                    onCancel={onCancel}
                    submitLabel={submitLabel}
                    disabled={submitDisabled}
                    danger={danger}
                />,
            )}
        </div>
    );
}
