import classNames from 'classnames';
import { useId, type ReactNode } from 'react';

import styles from './DialogPanel.module.scss';

/** Named widths. Every modal in the app is one of these three. */
export type DialogPanelSize = 'sm' | 'md' | 'lg';

export interface DialogPanelProps {
    /**
     * The dialog's heading. Rendered as an `<h2>` whose generated id is wired
     * to `aria-labelledby` on the panel root, so assistive tech announces the
     * dialog by its title instead of "dialog".
     *
     * Omit ONLY for a panel whose content supplies its own labelled heading —
     * then the root carries no `aria-labelledby` and the caller owns the label.
     */
    title?: ReactNode;
    /** Panel body. */
    children: ReactNode;
    /**
     * Footer action row. Rendered after the body with a top rule; typically a
     * `<FormActionBar>`.
     */
    actions?: ReactNode;
    /** Width bucket: sm 400 / md 560 / lg 760 px. Default `md`. */
    size?: DialogPanelSize;
    className?: string;
}

const SIZE_CLASS: Record<DialogPanelSize, string> = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
};

/**
 * DialogPanel — the content surface of EVERY `<Modal>` in this app.
 *
 * It replaces the nine hand-rolled `.modalContent` blocks (each `@extend`ing a
 * five-line shared template and then overriding its padding anyway) and the
 * `min-width: 400px` they all carried. That floor is why every modal produced a
 * horizontally-scrolling page on a 360 px phone: a minimum width cannot yield.
 * The width here is `min(<size>, calc(100vw - 2rem))`, which is the same look on
 * a desktop and a shrink-to-fit on a phone.
 *
 * The panel owns the SURFACE (background, radius, elevation, padding) and the
 * dialog LABEL. It does not own the scrim, the centering or the open/close
 * transition — cyber `<Modal>` supplies those, and duplicating them here is
 * what produced double scrims elsewhere in the monorepo.
 *
 * @example
 * ```tsx
 * <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
 *     <DialogPanel
 *         title="Rename conlang"
 *         size="sm"
 *         actions={<FormActionBar onCancel={close} submitLabel="Save" />}
 *     >
 *         <LabelShiftTextInput … />
 *     </DialogPanel>
 * </Modal>
 * ```
 */
export default function DialogPanel({
    title,
    children,
    actions,
    size = 'md',
    className,
}: DialogPanelProps) {
    const uid = useId();
    const titleId = `${uid}-dialog-title`;

    return (
        <div
            className={classNames(styles.panel, SIZE_CLASS[size], className)}
            {...(title != null ? { 'aria-labelledby': titleId } : {})}
        >
            {title != null && (
                <h2 id={titleId} className={styles.title}>
                    {title}
                </h2>
            )}
            <div className={styles.body}>{children}</div>
            {actions != null && <div className={styles.actions}>{actions}</div>}
        </div>
    );
}
