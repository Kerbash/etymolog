import type { TypographyRule } from '../../../../rules';
import styles from './WritingSystemRow.module.scss';
import classNames from 'classnames';

interface WritingSystemRowProps {
    rule: TypographyRule;
    value: string;
    onChange: (key: string, value: string) => void;
}

export default function WritingSystemRow({ rule, value, onChange }: WritingSystemRowProps) {
    const isModified = value !== rule.defaultValue;

    return (
        <tr className={styles.row}>
            <td className={styles.labelColumn}>
                <div className={styles.labelContent}>
                    <span className={styles.label}>{rule.label}</span>
                    <span className={styles.description}>{rule.description}</span>
                </div>
            </td>
            <td className={styles.valueColumn}>
                <select
                    className={classNames(styles.select, isModified && styles.modified)}
                    value={value}
                    onChange={(e) => onChange(rule.key, e.target.value)}
                >
                    {rule.options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    );
}
