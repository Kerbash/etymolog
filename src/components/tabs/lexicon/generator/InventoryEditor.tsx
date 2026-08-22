/**
 * InventoryEditor — section 02, "Sounds".
 *
 * ```
 *  [ ●   ] Use my script's sounds
 *  STOPS       p· t· k★ b· d·
 *  SIBILANTS   s✓· ʃ·
 *  VOWELS      a★✓ e· i· o· u✕
 *  [ Add a sound  ipa ] [Add]
 *  Not recognised: qq ✕
 * ```
 *
 * Two things this section owns, and they are deliberately separate:
 *
 *  - **WHERE the sounds come from.** An empty `profile.inventory` means "use my
 *    script's sounds" — the phonemes flagged for auto-spelling on the user's
 *    graphemes — and anything else is an explicit list. The switch flips
 *    between the two by materialising the current list, so turning it off never
 *    empties the generator.
 *  - **HOW OFTEN each one turns up.** A chip cycles `normal → common → rare →
 *    off → normal`; `off` keeps the sound in the list, muted, because deleting
 *    is not what a user means when they silence one sound.
 *
 * Chips are filed under exactly ONE class. `classOf` is deliberately
 * overlapping (a `p` is a C, a P and an O — a template slot asks "can this fill
 * me?"), but a list that showed `p` three times would leave the user unable to
 * tell which copy their click changed. See `PRIMARY_CLASS_ORDER`.
 *
 * @module tabs/lexicon/generator/InventoryEditor
 */

import { useCallback, useId, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import CyberSwitch from 'cyber-components/interactable/switch/switch/switch.tsx';
import EmptyState from 'cyber-components/display/emptyState';

import {
    LIMITS,
    type ClassLetter,
    type ClassifiedInventory,
    type FrequencyTilt,
    type InventoryMember,
    type WordGeneratorProfile,
} from '../../../../generator';
import { ROUTES } from '../../../../url_mapping';
import type { ProfilePatch } from './useGeneratorProfile';
import {
    PRIMARY_CLASS_ORDER,
    TILT_GLYPHS,
    TILT_LABELS,
    classGroupLabel,
    nextTilt,
} from './generatorText';

import styles from './generator.module.scss';

export interface InventoryEditorProps {
    profile: WordGeneratorProfile;
    /** The classified sounds the profile currently builds from. */
    inventory: ClassifiedInventory;
    /** `true` when the inventory is empty — "use my script's sounds". */
    usesScriptSounds: boolean;
    onUpdate: (patch: ProfilePatch) => void;
    /** Send the user to the flavour cards — the other way out of an empty inventory. */
    onPickFlavour: () => void;
}

/** Tilt to the class that mutes or highlights a chip. A lookup, so an unknown tilt paints nothing. */
const TILT_CLASS: Partial<Record<FrequencyTilt, string>> = {
    common: styles.chipCommon,
    rare: styles.chipRare,
    off: styles.chipOff,
};

interface ChipGroup {
    letter: ClassLetter;
    members: InventoryMember[];
}

/** File every member under the first class in {@link PRIMARY_CLASS_ORDER} it belongs to. */
function groupMembers(members: readonly InventoryMember[]): ChipGroup[] {
    const groups = new Map<ClassLetter, InventoryMember[]>();
    for (const member of members) {
        const letter =
            PRIMARY_CLASS_ORDER.find((candidate) => member.classes.includes(candidate))
            // Unreachable in practice — every classified sound is at least `C`
            // or `V` — but a sound with no class must still be shown rather than
            // silently dropped from a list the user is editing.
            ?? member.classes[0]
            ?? 'C';
        const bucket = groups.get(letter);
        if (bucket) bucket.push(member);
        else groups.set(letter, [member]);
    }
    return PRIMARY_CLASS_ORDER.filter((letter) => groups.has(letter)).map((letter) => ({
        letter,
        members: groups.get(letter) ?? [],
    }));
}

export default function InventoryEditor({
    profile,
    inventory,
    usesScriptSounds,
    onUpdate,
    onPickFlavour,
}: InventoryEditorProps) {
    const addFieldId = useId();
    const [draft, setDraft] = useState('');

    /** The list an edit starts from: the explicit one, or the script's, materialised. */
    const currentList = useMemo(
        () => (usesScriptSounds ? inventory.members.map((member) => member.phoneme) : profile.inventory),
        [usesScriptSounds, inventory.members, profile.inventory],
    );

    const groups = useMemo(() => groupMembers(inventory.members), [inventory.members]);

    const isEmpty = inventory.members.length === 0 && inventory.unknown.length === 0;
    /** Nothing to copy out of the script — the switch would have no honest "off" state. */
    const sourceLocked = usesScriptSounds && currentList.length === 0;

    const handleSource = useCallback(
        (useScript: boolean) => {
            // Materialised, not emptied: "custom list" starting from nothing
            // would silently switch the generator off.
            onUpdate({ inventory: useScript ? [] : [...currentList] });
        },
        [currentList, onUpdate],
    );

    const handleCycleTilt = useCallback(
        (phoneme: string, tilt: FrequencyTilt) => {
            const next = nextTilt(tilt);
            onUpdate((current) => {
                const tilts = { ...current.phonemeTilt };
                // `normal` is the ABSENCE of a tilt, not a value: storing it
                // would grow the settings object by one key per sound the user
                // clicked twice, and every one of them would travel in the export.
                if (next === 'normal') delete tilts[phoneme];
                else tilts[phoneme] = next;
                return { phonemeTilt: tilts };
            });
        },
        [onUpdate],
    );

    const handleRemove = useCallback(
        (phoneme: string) => {
            onUpdate((current) => {
                const tilts = { ...current.phonemeTilt };
                delete tilts[phoneme];
                return {
                    // From `currentList`, not `current.inventory`: in script
                    // mode the stored inventory is empty, and removing a sound
                    // there means "make this an explicit list without it".
                    inventory: currentList.filter((entry) => entry !== phoneme),
                    phonemeTilt: tilts,
                };
            });
        },
        [currentList, onUpdate],
    );

    const handleAdd = useCallback(() => {
        const value = draft.trim();
        if (!value) return;
        // Compared as typed: `deriveInventory` deduplicates by phonetic
        // identity, so a `t͡ʃ` added next to a `tʃ` collapses there rather than
        // being refused here, where the user would see no reason for the refusal.
        if (currentList.includes(value)) {
            setDraft('');
            return;
        }
        if (currentList.length >= LIMITS.MAX_INVENTORY) return;
        onUpdate({ inventory: [...currentList, value] });
        setDraft('');
    }, [draft, currentList, onUpdate]);

    const atLimit = currentList.length >= LIMITS.MAX_INVENTORY;

    return (
        <>
            <div className={styles.sourceRow}>
                <CyberSwitch
                    value={usesScriptSounds}
                    onChange={handleSource}
                    disabled={sourceLocked}
                    width="3em"
                    aria-label="Use my script's sounds"
                />
                <span className={styles.switchLabel}>
                    {usesScriptSounds
                        ? "Using my script's sounds"
                        : 'Using a custom list of sounds'}
                </span>
            </div>
            <p className={styles.sectionHint}>
                {usesScriptSounds
                    ? 'Every sound your graphemes are set to spell. Add graphemes and this list follows.'
                    : 'An explicit list. Your script can change without changing the words this makes.'}
            </p>

            {isEmpty ? (
                <EmptyState
                    icon="soundwave"
                    title="No sounds yet"
                    description="Pick a flavour above to start from a ready-made set, or add sounds to your script."
                    action={
                        <>
                            <button
                                type="button"
                                className={styles.inlineButton}
                                onClick={onPickFlavour}
                            >
                                Pick a flavour
                            </button>
                            <Link className={styles.ghostButton} to={ROUTES.scriptMaker}>
                                Open the Script Maker
                            </Link>
                        </>
                    }
                />
            ) : (
                groups.map((group) => (
                    <div className={styles.chipGroup} key={group.letter}>
                        <span className={styles.chipGroupLabel}>{classGroupLabel(group.letter)}</span>
                        <ul className={styles.chips}>
                            {group.members.map((member) => (
                                <li
                                    key={member.phoneme}
                                    className={classNames(styles.chip, TILT_CLASS[member.tilt])}
                                >
                                    <button
                                        type="button"
                                        className={styles.chipButton}
                                        onClick={() => handleCycleTilt(member.phoneme, member.tilt)}
                                        // The tilt is a glyph; the name is the
                                        // word. "k — common, in your script".
                                        aria-label={`${member.phoneme} — ${TILT_LABELS[member.tilt]}${
                                            member.inConlang ? ', in your script' : ''
                                        }`}
                                    >
                                        <span className={styles.chipSound} aria-hidden="true">
                                            {member.phoneme}
                                        </span>
                                        <span className={styles.chipTilt} aria-hidden="true">
                                            {TILT_GLYPHS[member.tilt]}
                                        </span>
                                        {member.inConlang && (
                                            <span className={styles.chipCheck} aria-hidden="true">
                                                ✓
                                            </span>
                                        )}
                                    </button>
                                    {!usesScriptSounds && (
                                        <button
                                            type="button"
                                            className={styles.chipRemove}
                                            onClick={() => handleRemove(member.phoneme)}
                                            aria-label={`Remove ${member.phoneme}`}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            )}

            {inventory.unknown.length > 0 && (
                <div className={styles.chipGroup}>
                    <span className={styles.unknownTitle}>
                        Not recognised — these cannot be used to build words
                    </span>
                    <ul className={styles.chips}>
                        {inventory.unknown.map((entry) => (
                            <li key={entry} className={classNames(styles.chip, styles.chipUnknown)}>
                                <span className={classNames(styles.chipButton, styles.chipSound)}>
                                    {entry}
                                </span>
                                <button
                                    type="button"
                                    className={styles.chipRemove}
                                    onClick={() => handleRemove(entry)}
                                    aria-label={`Remove ${entry}`}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={styles.addRow}>
                <span className={styles.addField}>
                    <label className={styles.fieldLabel} htmlFor={addFieldId}>
                        Add a sound
                    </label>
                    <input
                        id={addFieldId}
                        type="text"
                        className={classNames(styles.textInput, styles.monoInput)}
                        value={draft}
                        placeholder="ʃ"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            handleAdd();
                        }}
                    />
                </span>
                <button
                    type="button"
                    className={styles.inlineButton}
                    onClick={handleAdd}
                    disabled={draft.trim().length === 0 || atLimit}
                >
                    Add
                </button>
            </div>
            <p className={styles.sectionHint}>
                {atLimit
                    ? `That is the maximum of ${LIMITS.MAX_INVENTORY} sounds.`
                    : 'Type IPA directly. The full IPA keyboard is on the word form; the chart in the Script Maker names every symbol.'}
            </p>
        </>
    );
}
