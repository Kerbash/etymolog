/**
 * CustomChartsPage — `/script-maker/custom-charts`.
 *
 * User-defined chart layouts, for scripts that do not fit the IPA grid or a CV
 * syllabary. A thin wrapper over {@link ChartPageLayout}.
 *
 * Two fixes ride along with the consolidation:
 *
 *  - the **Create chart** button moved into the page header, where every other
 *    primary action in the app lives. It used to sit between the stats bar and
 *    the list — below the fold on a phone, and nowhere near the empty state
 *    that needed it;
 *  - the empty state is a real `EmptyState` WITH that call to action, instead
 *    of the sentence 'No custom charts yet. Click "Create Chart" to get
 *    started.' pointing at a button the reader had to go and find.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import EmptyState from 'cyber-components/display/emptyState';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { CustomChartCard, CreateChartModal } from '../../../display/customChart';
import { useEtymolog } from '../../../../db';
import type { CustomChartDefinition } from '../../../../db/api/types';
import type { GraphemeComplete } from '../../../../db/types';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import { useApiAction, useConfirm } from '../../../shared';
import ChartPageLayout from '../chartPage/ChartPageLayout';

import styles from './CustomChartsPage.module.scss';

export default function CustomChartsPage() {
    const navigate = useNavigate();
    const { api, isReady, error, settings } = useEtymolog();
    const confirm = useConfirm();
    const runApiAction = useApiAction();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingChart, setEditingChart] = useState<CustomChartDefinition | null>(null);
    const [attempt, setAttempt] = useState(0);

    const customCharts = useMemo(() => settings.customCharts ?? [], [settings.customCharts]);

    const phonemeMap = useMemo(() => {
        if (!isReady) return new Map<string, GraphemeComplete>();
        void attempt;
        const result = api.grapheme.getPhonemeMap();
        return result.success && result.data
            ? result.data
            : new Map<string, GraphemeComplete>();
    }, [api, isReady, attempt]);

    const handleCellClick = useCallback(
        (ipa: string, grapheme: GraphemeComplete | null) => {
            navigate(
                grapheme
                    ? resolveUrl(ROUTES.graphemeEdit, { id: grapheme.id })
                    : `${ROUTES.scriptMakerCreate}?phoneme=${encodeURIComponent(ipa)}`,
            );
        },
        [navigate],
    );

    const openCreate = useCallback(() => {
        setEditingChart(null);
        setIsModalOpen(true);
    }, []);

    const handleEdit = useCallback((chart: CustomChartDefinition) => {
        setEditingChart(chart);
        setIsModalOpen(true);
    }, []);

    const handleDelete = useCallback(
        async (chart: CustomChartDefinition) => {
            const confirmed = await confirm({
                title: `Delete chart "${chart.name}"?`,
                message:
                    'The chart layout is removed. The graphemes on it are NOT deleted — only this ' +
                    'way of arranging them. This cannot be undone.',
                confirmLabel: 'Delete chart',
                tone: 'danger',
            });
            if (!confirmed) return;

            // Settings updates are strict and whole-object: the surviving charts
            // are sent as the complete list, not as a diff.
            await runApiAction(
                () =>
                    api.settings.update({
                        customCharts: customCharts.filter((c) => c.id !== chart.id),
                    }),
                { errorTitle: 'Could not delete the chart', success: `Deleted "${chart.name}".` },
            );
        },
        [api, confirm, customCharts, runApiAction],
    );

    const handleSubmit = useCallback(
        (chart: CustomChartDefinition) => {
            const index = customCharts.findIndex((c) => c.id === chart.id);
            const updated =
                index >= 0
                    ? customCharts.map((c, i) => (i === index ? chart : c))
                    : [...customCharts, chart];

            void runApiAction(() => api.settings.update({ customCharts: updated }), {
                errorTitle: 'Could not save the chart',
                success: index >= 0 ? 'Chart saved.' : `Created "${chart.name}".`,
            });
        },
        [api, customCharts, runApiAction],
    );

    const createButton = (
        <IconButton
            iconName="plus-lg"
            type="button"
            className={buttonStyles.primary}
            onClick={openCreate}
        >
            Create chart
        </IconButton>
    );

    return (
        <ChartPageLayout
            title="Custom charts"
            description="Arrange your script in a grid of your own when neither the IPA chart nor a syllabary fits it."
            back={{ to: ROUTES.scriptMaker, label: 'Graphemes' }}
            actions={createButton}
            facts={[{ label: 'Charts', value: customCharts.length, big: true }]}
            isReady={isReady}
            error={error ?? null}
            onRetry={() => setAttempt((n) => n + 1)}
            about={
                <>
                    <h4>What a custom chart is for</h4>
                    <ul>
                        <li>
                            A chart is a set of rows and columns you name yourself; each cell holds
                            one phoneme.
                        </li>
                        <li>
                            Clicking a cell edits the grapheme for that phoneme, or starts one if it
                            has none — exactly like the IPA chart.
                        </li>
                        <li>Charts are stored with your language and travel with an export.</li>
                    </ul>
                </>
            }
        >
            {customCharts.length === 0 ? (
                <EmptyState
                    icon="grid-3x3"
                    title="No custom charts yet"
                    description="Build a grid that matches how your script is actually organised."
                    action={createButton}
                />
            ) : (
                <div className={styles.chartsList}>
                    {customCharts.map((chart) => (
                        <CustomChartCard
                            key={chart.id}
                            chart={chart}
                            phonemeMap={phonemeMap}
                            onCellClick={handleCellClick}
                            onEdit={handleEdit}
                            onDelete={(target) => void handleDelete(target)}
                        />
                    ))}
                </div>
            )}

            <CreateChartModal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                editingChart={editingChart}
                onSubmit={handleSubmit}
            />
        </ChartPageLayout>
    );
}
