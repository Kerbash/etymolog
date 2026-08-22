/**
 * @fileoverview `useGeneratorProfile` — the generator page's ONE source of truth.
 *
 * Everything the page shows is derived here, from two inputs: the persisted
 * `settings.wordGenerator` key and the reactive conlang data. Nothing is
 * mirrored into `useState`. That is not tidiness — it is the specific bug the
 * redesign spent a phase removing: a profile held in component state and also
 * in settings drifts the moment a write is rejected (settings validation is
 * strict) or the context re-renders for an unrelated reason, and the user is
 * then editing a profile the generator is not using.
 *
 * ```
 *   settings.wordGenerator ──┐
 *                            ├─► profile ──► inventory ──► (the page generates)
 *   data.graphemesComplete ──┘        └────► preset, coverage
 *   data.lexiconComplete ─────────────────► existingPronunciations
 * ```
 *
 * THE WRITE PATH has one rule, and it is the one the Phase 2 audit pinned: an
 * update must spread the WHOLE `wordGenerator` key. `api.settings.update` takes
 * nested objects wholesale, so `update({ wordGenerator: { profile } })` — which
 * looks like a partial update and type-checks as one — silently clears
 * `guidePresetId`, and the user's IPA chart goes blank the next time they look
 * at it.
 *
 * A `.ts` module (not `.tsx`) because of `react-refresh/only-export-components`:
 * a hook and a component may not share a file.
 *
 * @module tabs/lexicon/generator/useGeneratorProfile
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useEtymolog } from '../../../../db';
import { useApiAction } from '../../../shared';
import {
    applyPreset,
    cloneDefaultWordGeneratorSettings,
    deriveInventory,
    getPreset,
    normalizePronunciation,
    type ClassifiedInventory,
    type FlavourPreset,
    type WordGeneratorProfile,
    type WordGeneratorSettings,
} from '../../../../generator';

/**
 * How long a text edit waits before it is persisted.
 *
 * Every write validates and re-serialises the WHOLE settings object into
 * localStorage, so persisting per keystroke would do that ten times a second
 * while someone types a forbidden sequence. 250 ms is below the threshold at
 * which a save feels deferred and well above a fast typist's inter-key gap.
 * Blur flushes, so the last keystroke is never the one that is lost.
 */
export const PROFILE_WRITE_DEBOUNCE_MS = 250;

/** The query parameter the IPA chart's guide legend links with. */
export const PRESET_PARAM = 'preset';

/**
 * A change to the profile: either the fields to overwrite, or a function that
 * derives them from whatever the profile is AT THE MOMENT THE WRITE HAPPENS.
 *
 * The functional form exists because of the debounce. A patch built during
 * render closes over that render's profile; 250 ms later two other edits may
 * have landed, and `{ syllables: [...] }` computed from the stale array would
 * silently revert them — the classic lost-update, and unusually easy to hit
 * here because every template row writes the whole `syllables` array. Any
 * change that DERIVES from the current value should use the function form.
 */
export type ProfilePatch =
    | Partial<WordGeneratorProfile>
    | ((current: WordGeneratorProfile) => Partial<WordGeneratorProfile>);

export interface GeneratorProfileState {
    /** The whole persisted key — profile plus the chart's guide id. */
    settingsKey: WordGeneratorSettings;
    /** The profile the page edits. Always complete; never a local copy. */
    profile: WordGeneratorProfile;
    /** The flavour this profile came from, or `null` for a hand-built one. */
    preset: FlavourPreset | null;
    /** `true` when `profile.inventory` is empty — "use my script's sounds". */
    usesScriptSounds: boolean;
    /** The script's auto-spelling phonemes, deduplicated, in grapheme order. */
    conlangPhonemes: string[];
    /** Whatever the profile builds from, classified. */
    inventory: ClassifiedInventory;
    /** Normalised pronunciations already in the lexicon — the engine's dedupe set. */
    existingPronunciations: Set<string>;
    /** Persist a change immediately. For switches, selects and buttons. */
    updateProfile: (patch: ProfilePatch) => void;
    /** Persist a change after {@link PROFILE_WRITE_DEBOUNCE_MS}. For text inputs. */
    updateProfileDebounced: (patch: ProfilePatch) => void;
    /** Write any debounced change NOW. Call from `onBlur`. */
    flushProfile: () => void;
    /** Apply a flavour: the whole profile AND the chart's guide, in one write. */
    choosePreset: (id: string) => void;
}

export function useGeneratorProfile(): GeneratorProfileState {
    const { api, data, settings } = useEtymolog();
    const runApiAction = useApiAction();
    const [searchParams, setSearchParams] = useSearchParams();

    /**
     * The persisted key, with a defensive fallback.
     *
     * A settings object written by a build older than Phase 2 has no
     * `wordGenerator` at all, and the validator treats that as "absent" rather
     * than "invalid" — so the reactive copy can legitimately be undefined for
     * one render. Memoised because the fallback allocates: an unmemoised `??`
     * would hand a NEW object to every downstream `useMemo` on every render,
     * and the page's batch would be regenerated each time the context ticked.
     */
    const settingsKey = useMemo(
        () => settings.wordGenerator ?? cloneDefaultWordGeneratorSettings(),
        [settings.wordGenerator],
    );
    const profile = settingsKey.profile;

    const write = useCallback(
        (next: WordGeneratorSettings) => {
            void runApiAction(() => api.settings.update({ wordGenerator: next }), {
                // Silent on success, exactly like the chart's guide picker: the
                // page re-renders with the new words, and that IS the feedback.
                // A refused write still speaks — it is the case with no symptom.
                errorTitle: 'Could not save the generator settings',
            });
        },
        [api, runApiAction],
    );

    /**
     * The latest key and writer, for the debounce timer to read when it fires.
     *
     * A `setTimeout` closes over the render that scheduled it; 250 ms later
     * that render's `settingsKey` may be two writes stale, and spreading a
     * stale key would undo whatever landed in between. Synced in an effect
     * rather than during render — writing a ref while rendering is a side
     * effect, and React may render twice.
     */
    const latestRef = useRef({ settingsKey, write });
    useEffect(() => {
        latestRef.current = { settingsKey, write };
    }, [settingsKey, write]);

    /**
     * Debounced patches waiting to be written, in the order they were made.
     *
     * A QUEUE rather than one merged object: two patches that both rewrite
     * `syllables` must be applied in sequence (each onto the result of the
     * last), and merging by key would keep only the second — which is the
     * lost-update the functional patch form exists to prevent.
     */
    const pendingRef = useRef<ProfilePatch[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /** Apply patches in order over the CURRENT key, and write the whole key. */
    const commit = useCallback((patches: readonly ProfilePatch[]) => {
        if (patches.length === 0) return;
        const { settingsKey: current, write: send } = latestRef.current;
        let next = current.profile;
        for (const patch of patches) {
            next = { ...next, ...(typeof patch === 'function' ? patch(next) : patch) };
        }
        send({ ...current, profile: next });
    }, []);

    const flushProfile = useCallback(() => {
        clearTimer();
        const queued = pendingRef.current;
        pendingRef.current = [];
        commit(queued);
    }, [clearTimer, commit]);

    const updateProfile = useCallback(
        (patch: ProfilePatch) => {
            clearTimer();
            // A pending text edit is applied FIRST rather than dropped: a user
            // who types in the forbidden box and then flips a switch within
            // the debounce window means both, and two writes would race.
            const queued = [...pendingRef.current, patch];
            pendingRef.current = [];
            commit(queued);
        },
        [clearTimer, commit],
    );

    const updateProfileDebounced = useCallback(
        (patch: ProfilePatch) => {
            pendingRef.current = [...pendingRef.current, patch];
            clearTimer();
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                flushProfile();
            }, PROFILE_WRITE_DEBOUNCE_MS);
        },
        [clearTimer, flushProfile],
    );

    /**
     * Flush on the way out.
     *
     * Navigating away 100 ms after the last keystroke must not lose it. The
     * flusher is reached through a ref so the cleanup can be mount-only — a
     * cleanup that depended on `flushProfile` would run on every re-render that
     * changed it, flushing halfway through the debounce window and defeating it.
     */
    const flushRef = useRef(flushProfile);
    useEffect(() => {
        flushRef.current = flushProfile;
    }, [flushProfile]);
    useEffect(() => () => flushRef.current(), []);

    const choosePreset = useCallback(
        (id: string) => {
            const preset = getPreset(id);
            // Unknown ids are ignored rather than thrown: this is reachable
            // from a hand-typed `?preset=` and from settings written by a build
            // that had a flavour this one does not.
            if (!preset) return;
            clearTimer();
            // Everything queued is DISCARDED: a preset overwrites the whole
            // profile, so a half-typed template from the profile it replaces
            // has nothing to be applied to.
            pendingRef.current = [];
            const { settingsKey: current, write: send } = latestRef.current;
            send({
                ...current,
                profile: applyPreset(preset, current.profile),
                // One click lights the chart too — "the flavour" is one idea,
                // not two settings that can disagree.
                guidePresetId: preset.id,
            });
        },
        [clearTimer],
    );

    const preset = useMemo(() => getPreset(profile.presetId), [profile.presetId]);

    /** The script's sounds: every auto-spelling phoneme, deduplicated, in order. */
    const conlangPhonemes = useMemo(() => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const grapheme of data.graphemesComplete ?? []) {
            for (const phoneme of grapheme.phonemes ?? []) {
                if (!phoneme.use_in_auto_spelling) continue;
                const value = phoneme.phoneme?.trim();
                if (!value || seen.has(value)) continue;
                seen.add(value);
                out.push(value);
            }
        }
        return out;
    }, [data.graphemesComplete]);

    const usesScriptSounds = profile.inventory.length === 0;

    const source = useMemo(
        () => (usesScriptSounds ? conlangPhonemes : profile.inventory),
        [usesScriptSounds, conlangPhonemes, profile.inventory],
    );

    const inventory = useMemo(
        // `conlangPhonemes` is passed even in script mode: it is what sets
        // `inConlang`, and in script mode every member is in the script, which
        // is exactly what the chips should show.
        () => deriveInventory(source, profile, { conlangPhonemes }),
        [source, profile, conlangPhonemes],
    );

    /**
     * What the engine must not produce again.
     *
     * Normalised, because the lexicon stores what the user typed (`ˈka.ta`)
     * and the engine produces bare strings (`kata`) — comparing raw would offer
     * a word the user already has.
     */
    const existingPronunciations = useMemo(() => {
        const set = new Set<string>();
        for (const entry of data.lexiconComplete ?? []) {
            if (!entry.pronunciation) continue;
            const normalized = normalizePronunciation(entry.pronunciation);
            if (normalized) set.add(normalized);
        }
        return set;
    }, [data.lexiconComplete]);

    /**
     * `?preset=<id>` — applied ONCE, then stripped.
     *
     * Once, because the profile is editable: leaving the parameter in the URL
     * would re-apply the flavour (and throw away the user's edits) on every
     * re-render that re-ran the effect. Stripped, because a reload of the same
     * URL would otherwise do the same thing tomorrow.
     *
     * And NOT AT ALL when the profile is already on that flavour. The
     * parameter's only producer is the IPA chart's guide legend, which links
     * with the GUIDE's id — and choosing a flavour here sets the guide to the
     * same id. So the ordinary journey generator → chart → generator arrives
     * carrying the flavour the profile already has, and `applyPreset`
     * overwrites the whole profile: without this check, going to look at the
     * chart and coming back through that link silently discards every edit the
     * user made since they picked the flavour. Re-applying an identical id can
     * never be what they meant, because the id being identical is exactly what
     * says they have been editing THIS flavour.
     */
    const presetParam = searchParams.get(PRESET_PARAM);
    const currentPresetId = profile.presetId;
    const presetApplied = useRef(false);
    useEffect(() => {
        if (presetApplied.current || !presetParam) return;
        presetApplied.current = true;
        if (presetParam !== currentPresetId) choosePreset(presetParam);
        setSearchParams({}, { replace: true });
    }, [presetParam, currentPresetId, choosePreset, setSearchParams]);

    return {
        settingsKey,
        profile,
        preset,
        usesScriptSounds,
        conlangPhonemes,
        inventory,
        existingPronunciations,
        updateProfile,
        updateProfileDebounced,
        flushProfile,
        choosePreset,
    };
}
