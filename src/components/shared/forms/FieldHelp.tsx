import classNames from 'classnames';
import { useId } from 'react';

import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon';

import styles from './FieldHelp.module.scss';

export interface FieldHelpProps {
    /** The explanation. Plain text — it is also rendered visually-hidden. */
    text: string;
    /**
     * Accessible name of the trigger. Default `'Help'`; say WHAT it explains
     * ("What auto-spelling does") so a screen-reader user scanning by control
     * hears something distinguishable from four other "Help" buttons.
     */
    label?: string;
    className?: string;
}

/**
 * FieldHelp — a keyboard- and screen-reader-reachable "?" next to a field label.
 *
 * The pattern it replaces was a `<span>` with a `title` attribute: invisible to
 * keyboard users (a span is not focusable), unreliable for screen readers, and
 * impossible on touch.
 *
 * Two things carry the text, deliberately:
 *  1. `HoverToolTip` shows it on hover AND on focus, for sighted users;
 *  2. a visually-hidden copy is referenced by `aria-describedby`, so assistive
 *     tech reads the explanation as part of the control regardless of whether
 *     the tooltip's floating node is ever mounted (it is portalled and only
 *     exists while open).
 *
 * The trigger is a real `<button type="button">` — not a `div` — so it is in the
 * tab order and Enter/Space-activatable for free. `type="button"` matters: an
 * unqualified button inside a form submits it.
 */
export default function FieldHelp({ text, label = 'Help', className }: FieldHelpProps) {
    const uid = useId();
    const descriptionId = `${uid}-field-help`;

    return (
        <span className={classNames(styles.wrapper, className)}>
            <HoverToolTip content={text} contentPin="top">
                <button
                    type="button"
                    aria-label={label}
                    aria-describedby={descriptionId}
                    className={styles.trigger}
                >
                    <SvgIcon iconName="question-circle" aria-hidden="true" />
                </button>
            </HoverToolTip>
            {/* The durable copy of the text — see the component docblock. */}
            <span id={descriptionId} className={styles.srOnly}>
                {text}
            </span>
        </span>
    );
}
