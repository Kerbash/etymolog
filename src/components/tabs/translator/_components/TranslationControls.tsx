/**
 * TranslationControls
 * -------------------
 * The layout-strategy picker. Wired in Phase 3 — before that `strategy="block"`
 * was hardcoded in `TranslatorHome` and this component was exported but never
 * rendered, which made six of the eight spelling strategies unreachable from the
 * UI entirely.
 */

import { useId } from 'react';

import type { LayoutStrategyType } from '../../../display/spelling/types';
import styles from '../translator.module.scss';

interface TranslationControlsProps {
    selectedStrategy: LayoutStrategyType;
    onStrategyChange: (strategy: LayoutStrategyType) => void;
}

const STRATEGIES: ReadonlyArray<{ value: LayoutStrategyType; label: string }> = [
    { value: 'ltr', label: 'Left to right' },
    { value: 'rtl', label: 'Right to left' },
    { value: 'ttb', label: 'Top to bottom' },
    { value: 'btt', label: 'Bottom to top' },
    { value: 'block', label: 'Block (wrapping)' },
    { value: 'circular', label: 'Circular' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'boustrophedon', label: 'Boustrophedon' },
];

export default function TranslationControls({
    selectedStrategy,
    onStrategyChange,
}: TranslationControlsProps) {
    // `useId`, not a literal: a literal `id` is only unique while exactly one
    // instance is mounted, and a duplicate id silently points every label at the
    // first control.
    const selectId = useId();

    return (
        <div className={styles.controls}>
            <label htmlFor={selectId} className={styles.controlLabel}>
                Layout strategy
            </label>
            <select
                id={selectId}
                value={selectedStrategy}
                onChange={(e) => onStrategyChange(e.target.value as LayoutStrategyType)}
                className={styles.select}
            >
                {STRATEGIES.map((strategy) => (
                    <option key={strategy.value} value={strategy.value}>
                        {strategy.label}
                    </option>
                ))}
            </select>
            {selectedStrategy === 'block' && (
                <span className={styles.controlHint}>
                    Using the writing-system rules for text flow
                </span>
            )}
        </div>
    );
}
