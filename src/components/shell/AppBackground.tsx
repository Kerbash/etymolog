import type { ReactNode } from 'react';
import classNames from 'classnames';
import { flex } from 'utils-styles';

import BackgroundComponent from 'cyber-components/layout/backgroundComponent/backgroundComponent';

import styles from './AppBackground.module.scss';

interface AppBackgroundProps {
    children?: ReactNode;
    className?: string;
}

/**
 * AppBackground — the gradient + dot-grid page canvas, shared by the shell and
 * by `/new` (which renders outside the shell).
 *
 * This is what `components/background/background.tsx` used to be. Two things
 * changed:
 *
 *  1. `as="div"`. The cyber component renders a `<main>` by default, and the
 *     shell already contains one (`BasicBody`). Nested `<main>` elements are
 *     invalid and leave a screen reader with two "main content" landmarks.
 *  2. `min-height: 100dvh` instead of `height: 100dvh`. The old fixed height
 *     made the viewport the ONLY scroll container, so every page had to solve
 *     its own overflow — which is why three tab mains carried a
 *     `marginBottom: 1rem` to stop their last row being cut off. A minimum
 *     height keeps a short page's footer at the bottom while letting a long one
 *     scroll the document normally.
 */
export default function AppBackground({ children, className }: AppBackgroundProps) {
    return (
        <BackgroundComponent
            as="div"
            className={classNames(styles.background, flex.flexColumn, className)}
        >
            {children}
        </BackgroundComponent>
    );
}
