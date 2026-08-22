/**
 * GuidePicker — the one control that turns the flavour guide on.
 *
 * ```
 *  Flavour guide [ No guide ▾ ]
 * ```
 *
 * It has NO local state. The chosen preset lives in
 * `settings.wordGenerator.guidePresetId`, which means the choice survives a
 * navigation, a reload and an export/import round trip, and means the chart, the
 * legend and (in Phase 5) the generator page cannot disagree about which flavour
 * is on. A `useState` mirror here would be a second source of truth for a value
 * that is already persisted — the exact bug class the redesign removed.
 *
 * @module display/ipaChart/GuidePicker
 */

import { useCallback, useId } from 'react';
import classNames from 'classnames';

import { useEtymolog } from '../../../db';
import { cloneDefaultWordGeneratorSettings, getPreset, PRESETS } from '../../../generator';
import { useApiAction } from '../../shared';
import { GUIDE_PICKER_LABEL, NO_GUIDE_LABEL, NO_GUIDE_VALUE } from './guideTiers';

import styles from './guidePicker.module.scss';

export interface GuidePickerProps {
    /** Optional class name for the wrapper. */
    className?: string;
}

export default function GuidePicker({ className }: GuidePickerProps) {
    const { api, settings } = useEtymolog();
    const runApiAction = useApiAction();
    const selectId = useId();

    // Defensive `??`: a settings object stored by a build older than Phase 2
    // has no `wordGenerator` key at all, and the validator treats that as
    // "absent" rather than "invalid" — so the reactive copy can legitimately be
    // undefined for one render before the first write lands.
    const wordGenerator = settings.wordGenerator ?? cloneDefaultWordGeneratorSettings();
    const current = wordGenerator.guidePresetId ?? null;
    /**
     * What the select SHOWS. `guidePresetId` is validated as "any non-empty
     * string" (checking it against the registry would make the profile
     * validator depend on the preset registry, which imports the profile), so a
     * hand-edited localStorage or a preset that a later build dropped can leave
     * an id nothing matches. A `<select>` whose value matches no `<option>`
     * renders EMPTY — which reads as a broken control rather than as the "no
     * guide is painted" that is actually true.
     */
    const selected = getPreset(current) ? (current as string) : NO_GUIDE_VALUE;

    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const next = event.target.value === NO_GUIDE_VALUE ? null : event.target.value;
            // A `change` that changes nothing must not write: every write
            // validates and re-serialises the WHOLE settings object.
            if (next === current) return;

            void runApiAction(
                () =>
                    api.settings.update({
                        // The WHOLE key is spread. `api.settings.update` is
                        // strict and takes nested objects wholesale — sending
                        // `{ guidePresetId }` alone would drop the user's
                        // generator profile on the floor.
                        wordGenerator: { ...wordGenerator, guidePresetId: next },
                    }),
                // Silent on success on purpose. This control is changed while
                // looking at the chart it repaints; the repaint IS the feedback,
                // and a toast per change would be noise. A REFUSED write still
                // speaks, because that is the case with no visible symptom.
                { errorTitle: 'Could not save the flavour guide' },
            );
        },
        [api, current, runApiAction, wordGenerator],
    );

    return (
        <div className={classNames(styles.picker, className)}>
            <label className={styles.label} htmlFor={selectId}>
                {GUIDE_PICKER_LABEL}
            </label>
            <select
                id={selectId}
                className={styles.select}
                aria-label={GUIDE_PICKER_LABEL}
                value={selected}
                onChange={handleChange}
            >
                <option value={NO_GUIDE_VALUE}>{NO_GUIDE_LABEL}</option>
                {PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                        {preset.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
