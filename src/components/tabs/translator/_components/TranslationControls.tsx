/**
 * Translation Controls Component
 * -------------------------------
 * Controls for selecting layout strategy and other display options.
 */

import type { LayoutStrategyType } from '../../../display/spelling/types';
import styles from '../translator.module.scss';

interface TranslationControlsProps {
    selectedStrategy: LayoutStrategyType;
    onStrategyChange: (strategy: LayoutStrategyType) => void;
}

export default function TranslationControls({
    selectedStrategy,
    onStrategyChange
}: TranslationControlsProps) {
    const strategies: Array<{ value: LayoutStrategyType; label: string }> = [
        { value: 'ltr', label: 'Left to Right' },
        { value: 'rtl', label: 'Right to Left' },
        { value: 'ttb', label: 'Top to Bottom' },
        { value: 'btt', label: 'Bottom to Top' },
        { value: 'block', label: 'Block (Wrapping)' },
        { value: 'circular', label: 'Circular' },
        { value: 'spiral', label: 'Spiral' },
        { value: 'boustrophedon', label: 'Boustrophedon' },
    ];

    return (
        <div className={styles.controls}>
            <label htmlFor="strategy-select" className={styles.controlLabel}>
                Layout Strategy
            </label>
            <select
                id="strategy-select"
                value={selectedStrategy}
                onChange={(e) => onStrategyChange(e.target.value as LayoutStrategyType)}
                className={styles.select}
            >
                {strategies.map(strategy => (
                    <option key={strategy.value} value={strategy.value}>
                        {strategy.label}
                    </option>
                ))}
            </select>
            {selectedStrategy === 'block' && (
                <span className={styles.controlLabel} style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    Using writing system rules for text flow
                </span>
            )}
        </div>
    );
}
