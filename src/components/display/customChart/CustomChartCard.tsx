/**
 * CustomChartCard Component
 *
 * Wraps a chart with a header bar containing the chart name,
 * edit button, and delete button. Delegates rendering to
 * CustomBasicChart or CustomSyllabaryChart based on chart type.
 *
 * @module display/customChart/CustomChartCard
 */

import classNames from 'classnames';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import CustomBasicChart from './CustomBasicChart';
import CustomSyllabaryChart from './CustomSyllabaryChart';
import type { CustomChartCardProps } from './types';
import styles from './CustomChartCard.module.scss';

export default function CustomChartCard({
    chart,
    phonemeMap,
    onCellClick,
    onEdit,
    onDelete,
}: CustomChartCardProps) {
    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <h3 className={styles.chartName}>{chart.name}</h3>
                <div className={styles.actions}>
                    <IconButton
                        iconName="pencil"
                        onClick={() => onEdit(chart)}
                        aria-label={`Edit ${chart.name}`}
                    />
                    <IconButton
                        iconName="trash"
                        onClick={() => onDelete(chart)}
                        aria-label={`Delete ${chart.name}`}
                    />
                </div>
            </div>
            <div className={styles.chartContent}>
                {chart.type === 'basic' ? (
                    <CustomBasicChart
                        chart={chart}
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                    />
                ) : (
                    <CustomSyllabaryChart
                        chart={chart}
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                    />
                )}
            </div>
        </div>
    );
}
