/**
 * CreateChartModal Component
 *
 * Modal for creating and editing custom charts.
 * In create mode: Step 1 picks chart type, Step 2 shows type-specific form.
 * In edit mode: Skips type selection, pre-fills form.
 *
 * @module display/customChart/CreateChartModal
 */

import { useState, useEffect } from 'react';
import classNames from 'classnames';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { graphic, flex } from 'utils-styles';
import type { CreateChartModalProps } from './types';
import type { CustomChartDefinition } from '../../../db/api/types';
import styles from './CreateChartModal.module.scss';

type ChartType = 'basic' | 'syllabary';

export default function CreateChartModal({
    isOpen,
    setIsOpen,
    editingChart,
    onSubmit,
}: CreateChartModalProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [chartType, setChartType] = useState<ChartType>('basic');
    const [name, setName] = useState('');
    const [ipaInput, setIpaInput] = useState('');
    const [xAxisInput, setXAxisInput] = useState('');
    const [yAxisInput, setYAxisInput] = useState('');

    const isEditing = editingChart !== null;

    useEffect(() => {
        if (!isOpen) return;

        if (editingChart) {
            setStep(2);
            setChartType(editingChart.type);
            setName(editingChart.name);
            if (editingChart.type === 'basic') {
                setIpaInput(editingChart.ipaCharacters.join(' '));
            } else {
                setXAxisInput(editingChart.xAxis.join(' '));
                setYAxisInput(editingChart.yAxis.join(' '));
            }
        } else {
            setStep(1);
            setChartType('basic');
            setName('');
            setIpaInput('');
            setXAxisInput('');
            setYAxisInput('');
        }
    }, [isOpen, editingChart]);

    const handleTypeSelect = (type: ChartType) => {
        setChartType(type);
        setStep(2);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) return;

        let chart: CustomChartDefinition;

        if (chartType === 'basic') {
            const chars = [...new Set(ipaInput.trim().split(/\s+/).filter(Boolean))];
            if (chars.length === 0) return;

            chart = {
                id: editingChart?.id ?? crypto.randomUUID(),
                name: trimmedName,
                createdAt: editingChart?.createdAt ?? new Date().toISOString(),
                type: 'basic',
                ipaCharacters: chars,
            };
        } else {
            const xAxis = [...new Set(xAxisInput.trim().split(/\s+/).filter(Boolean))];
            const yAxis = [...new Set(yAxisInput.trim().split(/\s+/).filter(Boolean))];
            if (xAxis.length === 0 || yAxis.length === 0) return;

            chart = {
                id: editingChart?.id ?? crypto.randomUUID(),
                name: trimmedName,
                createdAt: editingChart?.createdAt ?? new Date().toISOString(),
                type: 'syllabary',
                xAxis,
                yAxis,
            };
        }

        onSubmit(chart);
        setIsOpen(false);
    };

    const isValid = (() => {
        if (!name.trim()) return false;
        if (chartType === 'basic') {
            return ipaInput.trim().split(/\s+/).filter(Boolean).length > 0;
        }
        return (
            xAxisInput.trim().split(/\s+/).filter(Boolean).length > 0 &&
            yAxisInput.trim().split(/\s+/).filter(Boolean).length > 0
        );
    })();

    const inputStyle: React.CSSProperties = {
        padding: '0.5em',
        fontSize: '1rem',
        background: 'var(--surface-raised)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '4px',
        outline: 'none',
    };

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <div className={styles.modalContent}>
                {step === 1 && !isEditing ? (
                    <div className={classNames(flex.flexColumn, flex.flexGapM)}>
                        <h2 className={graphic.underlineHighlightColorPrimary}>
                            Create Custom Chart
                        </h2>
                        <p className={styles.stepDescription}>
                            Choose a chart type:
                        </p>
                        <div className={classNames(flex.flexRow, flex.flexGapM)}>
                            <button
                                type="button"
                                className={styles.typeButton}
                                onClick={() => handleTypeSelect('basic')}
                            >
                                <strong>Basic Chart</strong>
                                <span>A flat list of IPA characters with pronunciation and grapheme rows</span>
                            </button>
                            <button
                                type="button"
                                className={styles.typeButton}
                                onClick={() => handleTypeSelect('syllabary')}
                            >
                                <strong>Syllabary Chart</strong>
                                <span>A 2D grid with custom X/Y axes</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className={classNames(flex.flexColumn, flex.flexGapM)}
                    >
                        <h2 className={graphic.underlineHighlightColorPrimary}>
                            {isEditing ? 'Edit Chart' : `New ${chartType === 'basic' ? 'Basic' : 'Syllabary'} Chart`}
                        </h2>

                        <label className={styles.fieldLabel}>
                            Chart Name
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter chart name..."
                                autoFocus
                                style={inputStyle}
                            />
                        </label>

                        {chartType === 'basic' ? (
                            <label className={styles.fieldLabel}>
                                IPA Characters (space-separated)
                                <input
                                    type="text"
                                    value={ipaInput}
                                    onChange={(e) => setIpaInput(e.target.value)}
                                    placeholder="e.g. p t k m n ŋ"
                                    style={inputStyle}
                                />
                            </label>
                        ) : (
                            <>
                                <label className={styles.fieldLabel}>
                                    X-Axis / Columns (space-separated)
                                    <input
                                        type="text"
                                        value={xAxisInput}
                                        onChange={(e) => setXAxisInput(e.target.value)}
                                        placeholder="e.g. a e i o u"
                                        style={inputStyle}
                                    />
                                </label>
                                <label className={styles.fieldLabel}>
                                    Y-Axis / Rows (space-separated)
                                    <input
                                        type="text"
                                        value={yAxisInput}
                                        onChange={(e) => setYAxisInput(e.target.value)}
                                        placeholder="e.g. p t k s m n"
                                        style={inputStyle}
                                    />
                                </label>
                            </>
                        )}

                        <div className={classNames(flex.flexRow, flex.justifyContentEnd, flex.flexGapS)}>
                            {!isEditing && (
                                <Button
                                    type="button"
                                    className={buttonStyles.secondary}
                                    onClick={() => setStep(1)}
                                >
                                    Back
                                </Button>
                            )}
                            <Button
                                type="button"
                                className={buttonStyles.secondary}
                                onClick={() => setIsOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className={buttonStyles.primary}
                                disabled={!isValid}
                            >
                                {isEditing ? 'Save' : 'Create'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </Modal>
    );
}
