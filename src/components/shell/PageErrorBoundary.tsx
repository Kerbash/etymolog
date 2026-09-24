/**
 * PageErrorBoundary — catches a render error in the routed page so the rest of
 * the app survives it.
 *
 * Without it, one exception anywhere under the root (a malformed glyph, a bug
 * in a new page) unmounted the WHOLE tree: the user was left on a blank
 * screen with no tabs, no header and no hint of what happened. It sits around
 * the shell's `<Outlet/>` only, so the header, tabs and persistence banner
 * stay usable, and it clears itself when the route changes — picking another
 * tab is always a way out.
 *
 * The fallback says what happened and what is safe: the language itself is
 * saved as it is edited (the footer's "Saved" state), so only an unsaved
 * form's contents can be lost by reloading.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import styles from './PageErrorBoundary.module.scss';

export interface PageErrorBoundaryProps {
    children: ReactNode;
    /** When this changes (the pathname), a caught error is cleared. */
    resetKey: string;
}

interface PageErrorBoundaryState {
    error: Error | null;
    /** The `resetKey` the error was caught under. */
    errorKey: string | null;
}

export default class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
    state: PageErrorBoundaryState = { error: null, errorKey: null };

    static getDerivedStateFromError(error: unknown): Partial<PageErrorBoundaryState> {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    static getDerivedStateFromProps(
        props: PageErrorBoundaryProps,
        state: PageErrorBoundaryState,
    ): Partial<PageErrorBoundaryState> | null {
        // Record where the error happened; navigating anywhere else clears it.
        if (state.error && state.errorKey === null) return { errorKey: props.resetKey };
        if (state.error && state.errorKey !== props.resetKey) return { error: null, errorKey: null };
        return null;
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[etymolog] page crashed:', error, info.componentStack);
    }

    private handleRetry = () => {
        this.setState({ error: null, errorKey: null });
    };

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <section className={styles.fallback} role="alert" aria-labelledby="page-error-title">
                <h2 id="page-error-title" className={styles.title}>
                    <i className="bi-exclamation-triangle" aria-hidden="true" /> This page stopped working
                </h2>
                <p className={styles.text}>
                    Something went wrong while drawing it. Your language is saved as you edit it, so it is safe;
                    only changes typed into a form and not yet saved could be lost by reloading.
                </p>
                <p className={styles.text}>
                    Try again, pick another tab, or reload the app.
                </p>
                <div className={styles.actions}>
                    <Button type="button" className={buttonStyles.primary} onClick={this.handleRetry}>
                        Try again
                    </Button>
                    <Button type="button" className={buttonStyles.secondary} onClick={this.handleReload}>
                        Reload the app
                    </Button>
                </div>
                <details className={styles.details}>
                    <summary>Technical details</summary>
                    <pre className={styles.message}>{error.message || error.name}</pre>
                </details>
            </section>
        );
    }
}
