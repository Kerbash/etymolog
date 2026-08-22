/**
 * CreateChartModal Component
 *
 * Modal for creating and editing custom charts.
 * In create mode: Step 1 picks chart type, Step 2 shows type-specific form.
 * In edit mode: Skips type selection, pre-fills form.
 *
 * @module display/customChart/CreateChartModal
 */

import { useState } from 'react';
import classNames from 'classnames';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';
import { graphic, flex } from 'utils-styles';
import type { CreateChartModalProps } from './types';
import type { CustomChartDefinition } from '../../../db/api/types';
import { DialogPanel } from '../../shared';
import styles from './CreateChartModal.module.scss';

type ChartType = 'basic' | 'syllabary';

/**
 * The modal shell. The FORM is a separate component mounted only while the
 * modal is open and keyed by what it is editing, so its state initialises from
 * `editingChart` on mount instead of being reset by an effect.
 *
 * The effect it replaces fired six `setState` calls on open — a cascade of
 * re-renders React's `set-state-in-effect` rule exists to flag — and left a
 * real bug behind it: the state was only reset while `isOpen` was true, so
 * opening "Create" straight after "Edit" showed the previous chart's values for
 * one frame.
 */
export default function CreateChartModal({
    isOpen,
    setIsOpen,
    editingChart,
    onSubmit,
}: CreateChartModalProps) {
    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <DialogPanel size="md">
                {isOpen && (
                    <ChartForm
                        key={editingChart?.id ?? 'new'}
                        editingChart={editingChart}
                        onSubmit={onSubmit}
                        onClose={() => setIsOpen(false)}
                    />
                )}
            </DialogPanel>
        </Modal>
    );
}

interface ChartFormProps {
    editingChart: CustomChartDefinition | null;
    onSubmit: (chart: CustomChartDefinition) => void;
    onClose: () => void;
}

function ChartForm({ editingChart, onSubmit, onClose }: ChartFormProps) {
    const isEditing = editingChart !== null;

    // Editing skips the type step — the type of an existing chart is not a
    // choice, it is a fact about it.
    const [step, setStep] = useState<1 | 2>(isEditing ? 2 : 1);
    const [chartType, setChartType] = useState<ChartType>(editingChart?.type ?? 'basic');
    const [name, setName] = useState(editingChart?.name ?? '');
    const [ipaInput, setIpaInput] = useState(
        editingChart?.type === 'basic' ? editingChart.ipaCharacters.join(' ') : '',
    );
    const [xAxisInput, setXAxisInput] = useState(
        editingChart?.type === 'syllabary' ? editingChart.xAxis.join(' ') : '',
    );
    const [yAxisInput, setYAxisInput] = useState(
        editingChart?.type === 'syllabary' ? editingChart.yAxis.join(' ') : '',
    );

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
        onClose();
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

    return (
        <>
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
                                className={styles.textInput}
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
                                    className={styles.textInput}
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
                                        className={styles.textInput}
                                    />
                                </label>
                                <label className={styles.fieldLabel}>
                                    Y-Axis / Rows (space-separated)
                                    <input
                                        type="text"
                                        value={yAxisInput}
                                        onChange={(e) => setYAxisInput(e.target.value)}
                                        placeholder="e.g. p t k s m n"
                                        className={styles.textInput}
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
                                onClick={onClose}
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
        </>
    );
}
