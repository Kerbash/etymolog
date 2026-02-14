/**
 * Phrase Input Component
 * ----------------------
 * Text area input for entering English phrases to translate.
 */

import styles from '../translator.module.scss';

interface PhraseInputProps {
    value: string;
    onChange: (value: string) => void;
}

export default function PhraseInput({ value, onChange }: PhraseInputProps) {
    return (
        <div className={styles.inputContainer}>
            <label htmlFor="phrase-input" className={styles.label}>
                English Phrase
            </label>
            <textarea
                id="phrase-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Enter an English phrase to translate..."
                rows={3}
                className={styles.textarea}
            />
            <div className={styles.charCount}>
                {value.length} characters
            </div>
        </div>
    );
}
