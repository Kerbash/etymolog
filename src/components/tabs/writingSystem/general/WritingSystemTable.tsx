import type { WritingSystemSettings } from '../../../../db/api/types';
import { getRulesByCategory, getRuleCategories } from '../../../../rules';
import WritingSystemRow from './WritingSystemRow';
import styles from './WritingSystemTable.module.scss';
import classNames from 'classnames';

interface WritingSystemTableProps {
    settings: WritingSystemSettings;
    onChange: (key: string, value: string) => void;
    className?: string;
}

export default function WritingSystemTable({ settings, onChange, className }: WritingSystemTableProps) {
    const categories = getRuleCategories();

    return (
        <div className={classNames(styles.container, className)}>
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th className={styles.headerLabel}>Rule</th>
                        <th className={styles.headerValue}>Value</th>
                    </tr>
                </thead>
                {categories.map(category => {
                    const rules = getRulesByCategory(category);
                    if (rules.length === 0) return null;

                    return (
                        <tbody key={category} className={styles.categoryGroup}>
                            <tr className={styles.categoryHeader}>
                                <td colSpan={2}>
                                    <span className={styles.categoryLabel}>{category}</span>
                                </td>
                            </tr>
                            {rules.map(rule => (
                                <WritingSystemRow
                                    key={rule.key}
                                    rule={rule}
                                    value={(settings as any)[rule.key] ?? rule.defaultValue}
                                    onChange={onChange}
                                />
                            ))}
                        </tbody>
                    );
                })}
            </table>
        </div>
    );
}
