/**
 * BlocksPage — `/writing-system/blocks`, the Block Designer.
 *
 * ```
 *  Blocks                                            ← PageHeader
 *  [x] Draw words in blocks    3 roles · 4 templates · 2 variant groups
 *                                        Unsaved changes  [Discard] [Save]
 *  ⚠ Blocks have no templates …                     ← enabled + zero templates
 *  ⚠ Saved with corrections: …                      ← issues from the last save
 *  ┌ Splitting words into blocks ─────────────────────────────────┐
 *  │ (•) By syllable [Recommended]   ( ) By template order        │
 *  └──────────────────────────────────────────────────────────────┘
 *  ┌ Consonants with no vowel ────────────────────────────────────┐
 *  │ (•) Draw it on its own          ( ) Add a vowel-killer mark  │
 *  └──────────────────────────────────────────────────────────────┘
 *  ┌ Try a word ─ BlockPreview (controlled: tryWordId / tryIpa) ──┐
 *  ┌ Check all my words ─ WordCheck, "Try it" → Try a word ───────┐
 *  ┌ Roles ─────────┐ ┌ Variant groups ─┐ ┌ Templates ──────────┐
 *  └────────────────┘ └─────────────────┘ └─────────────────────┘
 *  ┌ Edit template … ─ canvas + live preview ──────────────────────┐
 * ```
 *
 * THE DRAFT MODEL. The page edits a DRAFT `BlockScheme` in React state,
 * initialised from `data.blockScheme` (the saved, validated scheme). Nothing
 * reaches the database until Save:
 *
 *  - every edit (roles, the enable toggle, the split mode, the lone-consonant
 *    mark, template order, Apply in the template editor, the generator seed)
 *    replaces the draft;
 *  - dirty = the draft differs (deep, key-order-insensitive) from the scheme
 *    it was derived from; the page registers that with the unsaved-changes
 *    registry, so leaving (the Direction tab, the app nav) asks first;
 *  - Save → `api.blockScheme.save(draft)` through `useApiAction`. The API is
 *    LENIENT: it stores the corrected scheme and returns what it corrected;
 *    those issues are shown inline and the draft becomes the stored scheme;
 *  - Discard → the draft goes back to the saved scheme, the editor closes;
 *  - when the saved scheme changes underneath (another tab, an import) and the
 *    draft is CLEAN, the draft follows it; a dirty draft is never overwritten.
 *
 * The template editor holds its own WORKING copy (lifted here, so its dirt
 * counts too and the preview can render it); Apply writes it into the draft.
 *
 * Save is refused (disabled, with the reason listed) when `draftProblems`
 * finds something the lenient validator would fix by DROPPING data — an empty
 * category would drop the role and every template using it.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import NotificationBanner from 'cyber-components/interactable/information/notificationBanner';

import { useEtymolog } from '../../../../db';
import type { BlockScheme, BlockTemplate, RoleMatcher } from '../../../../blocks';
import { validateBlockSchemeUsage } from '../../../../rules';
import { PageHeader, useApiAction } from '../../../shared';
import { useRegisterUnsaved } from '../../../shell';
import { VariantGroupsDialog } from '../../grapheme/variantGroups';
import { INLINE_BANNER_PARTS } from '../inlineBanner';
import RolesEditor from './RolesEditor';
import SplitSettings from './SplitSettings';
import LoneConsonantSettings from './LoneConsonantSettings';
import BlockPreview from './BlockPreview';
import WordCheck from './WordCheck';
import TemplateList from './TemplateList';
import TemplateEditor from './TemplateEditor';
import PageContents from './PageContents';
import type { PageContentsLink } from './PageContents';
import ScriptSpacingSettings from '../ScriptSpacingSettings';
import {
    addRole,
    applyTemplate,
    cloneScheme,
    draftProblems,
    duplicateTemplate,
    moveTemplate,
    newTemplate,
    previewScheme,
    removeRole,
    removeTemplate,
    reorderTemplates,
    sameDocument,
    schemeStatusLine,
    templatesUsingRole,
    updateRole,
} from './blockSchemeDraft';
import { suggestDiphthongs, suggestSyllabicConsonants } from './diphthongSuggestions';
import { withLeftovers, withSplit } from './schemeOptions';
import { seedFlexibleTemplate, seedFromGenerator } from './seedFromGenerator';
import type { SeedKind, SeedResult } from './seedFromGenerator';

import styles from './blocksPage.module.scss';

/** The template open in the editor: its working copy and where it came from. */
interface EditingState {
    /** As it was when the editor opened (for the editor's own dirty check). */
    original: BlockTemplate;
    working: BlockTemplate;
    isNew: boolean;
}

const NEW_ROLE_MATCHER: RoleMatcher = { kind: 'class', letter: 'C' };

/**
 * "On this page" links, in the page's own render order (SplitSettings, the
 * "Spacing" section, LoneConsonantSettings, the "Try a word" section, WordCheck,
 * RolesEditor, the "Variant groups" section, TemplateList). Each `id` is set on
 * the matching section below.
 */
const PAGE_CONTENTS: readonly PageContentsLink[] = [
    { id: 'blocks-split', label: 'Splitting' },
    { id: 'blocks-spacing', label: 'Spacing' },
    { id: 'blocks-leftovers', label: 'Lone consonants' },
    { id: 'blocks-try', label: 'Try a word' },
    { id: 'blocks-check', label: 'Check words' },
    { id: 'blocks-roles', label: 'Roles' },
    { id: 'blocks-groups', label: 'Variant groups' },
    { id: 'blocks-templates', label: 'Templates' },
];

export default function BlocksPage() {
    const { api, data, settings } = useEtymolog();
    const runApiAction = useApiAction();

    // Whole values read out first (P8).
    const savedScheme = data.blockScheme;
    const groups = data.variantGroups;
    const syllables = settings.wordGenerator.profile.syllables;
    const graphemeMap = data.graphemeMap;

    const [base, setBase] = useState<BlockScheme>(savedScheme);
    const [draft, setDraft] = useState<BlockScheme>(() => cloneScheme(savedScheme));
    const [editing, setEditing] = useState<EditingState | null>(null);
    const [saveIssues, setSaveIssues] = useState<string[]>([]);
    const [seedReport, setSeedReport] = useState<SeedResult | null>(null);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    // The "Try a word" preview is CONTROLLED here, so "Check all my words"
    // can put a word into it ("Try it").
    const [tryWordId, setTryWordId] = useState<number | null>(null);
    const [tryIpa, setTryIpa] = useState('');
    const trySectionRef = useRef<HTMLElement>(null);

    const draftDirty = !sameDocument(draft, base);
    // Read out of the draft once (P8: member-expression deps defeat the memos).
    const draftRoles = draft.roles;
    const draftTemplates = draft.templates;

    // The saved scheme moved (a save, another tab, an import): adopt it as the
    // new base, and follow it with the draft only while the draft is clean.
    // State-from-props during render (not an effect) so there is no frame in
    // which the old draft is shown against the new base.
    if (savedScheme !== base) {
        setBase(savedScheme);
        if (!draftDirty) setDraft(cloneScheme(savedScheme));
    }

    const editorDirty = editing !== null && (editing.isNew || !sameDocument(editing.working, editing.original));
    useRegisterUnsaved('block-designer', draftDirty || editorDirty);

    // ── derived ────────────────────────────────────────────────────────────

    /** Templates as the role guard must see them: the edited one as it is NOW. */
    const effectiveTemplates = useMemo(() => {
        if (!editing) return draftTemplates;
        return applyTemplate(draft, editing.working).templates;
    }, [draft, draftTemplates, editing]);

    const usage = useMemo(() => {
        const counts = new Map<string, number>();
        for (const role of draftRoles) counts.set(role.id, templatesUsingRole(effectiveTemplates, role.id).length);
        return counts;
    }, [draftRoles, effectiveTemplates]);

    const problems = useMemo(() => draftProblems(draft), [draft]);

    // The whole draft, forced on, for the "Try a word" preview (P8: `draft`
    // is a whole state value, so this only changes when the draft does).
    const tryScheme = useMemo(() => previewScheme(draft, null), [draft]);
    const usageWarnings = useMemo(() => validateBlockSchemeUsage(draft), [draft]);
    const status = schemeStatusLine(draft, groups.length);

    // ── draft edits ────────────────────────────────────────────────────────

    const edit = useCallback((change: (scheme: BlockScheme) => BlockScheme) => {
        setDraft((current) => change(current));
        setSaveIssues([]);
    }, []);

    const openEditor = useCallback((template: BlockTemplate, isNew: boolean) => {
        setEditing({ original: template, working: template, isNew });
    }, []);

    const handleEdit = useCallback(
        (templateId: string) => {
            const template = draftTemplates.find((t) => t.id === templateId);
            if (template) openEditor(template, false);
        },
        [draftTemplates, openEditor],
    );

    const handleRemoveTemplate = useCallback(
        (templateId: string) => {
            edit((scheme) => removeTemplate(scheme, templateId));
            setEditing((current) => (current && current.working.id === templateId ? null : current));
        },
        [edit],
    );

    const handleApply = useCallback(() => {
        if (!editing) return;
        const working = editing.working;
        edit((scheme) => applyTemplate(scheme, working));
        setEditing(null);
    }, [edit, editing]);

    const handleSeed = useCallback(
        (kind: SeedKind) => {
            const seed = kind === 'flexible' ? seedFlexibleTemplate : seedFromGenerator;
            const result = seed(draft, syllables);
            setSeedReport(result);
            if (result.added.length > 0) edit(() => result.scheme);
        },
        [draft, syllables, edit],
    );

    /** "Try it" in the word check: show that word (typed IPA would hide it) and scroll to it. */
    const handleTryWord = useCallback((wordId: number) => {
        setTryWordId(wordId);
        setTryIpa('');
        // Optional call: happy-dom (tests) has no scrollIntoView.
        trySectionRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, []);

    // ── save / discard ─────────────────────────────────────────────────────

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const response = await runApiAction(() => api.blockScheme.save(draft), {
                errorTitle: 'Could not save the block scheme',
                success: 'Block scheme saved.',
            });
            if (response.success && response.data) {
                const { scheme, issues } = response.data;
                setDraft(cloneScheme(scheme));
                setSaveIssues(issues);
            }
        } finally {
            setSaving(false);
        }
    }, [api, draft, runApiAction]);

    const handleDiscard = useCallback(() => {
        setDraft(cloneScheme(base));
        setEditing(null);
        setSaveIssues([]);
        setSeedReport(null);
    }, [base]);

    // ── render ─────────────────────────────────────────────────────────────

    return (
        <div className={styles.page}>
            <PageHeader
                title="Blocks"
                description="Group the signs of a syllable into one composed block, the way Mayan glyphs or Korean hangul are written. Roles say which signs fit a slot; templates say how the slots are laid out."
            />

            <PageContents links={PAGE_CONTENTS} />

            <section className={styles.section} aria-label="Block scheme">
                <div className={styles.toolbar}>
                    <div className={styles.actions}>
                        <label className={styles.toggle}>
                            <input
                                type="checkbox"
                                role="switch"
                                checked={draft.enabled}
                                onChange={(event) => {
                                    const enabled = event.target.checked;
                                    edit((scheme) => ({ ...scheme, enabled }));
                                }}
                            />
                            Draw words in blocks
                        </label>
                        <span className={styles.status} data-scheme-status="">
                            {status}
                        </span>
                    </div>
                    <div className={styles.actions}>
                        {(draftDirty || editorDirty) && (
                            <span className={styles.dirtyNote} role="status">
                                {editorDirty && !draftDirty ? 'The template editor has changes — Apply them first' : 'Unsaved changes'}
                            </span>
                        )}
                        <Button
                            type="button"
                            onClick={handleDiscard}
                            disabled={!draftDirty && !editorDirty}
                            className={buttonStyles.secondary}
                        >
                            Discard
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={!draftDirty || problems.length > 0 || saving}
                            className={buttonStyles.primary}
                        >
                            Save
                        </Button>
                    </div>
                </div>
                {!draft.enabled && (
                    <p className={styles.hint}>
                        Blocks are off: every sign is drawn on its own. You can design templates first and switch
                        blocks on when they look right.
                    </p>
                )}
            </section>

            {usageWarnings.map((warning) => (
                <NotificationBanner
                    key={warning.keys.join('-')}
                    visible
                    severity="warning"
                    title={warning.title}
                    message={warning.message}
                    parts={INLINE_BANNER_PARTS}
                />
            ))}

            {problems.length > 0 && (
                <ul className={styles.issueList} aria-label="Fix before saving">
                    <li className={styles.issueTitle}>
                        Fix these before saving:
                    </li>
                    {problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                    ))}
                </ul>
            )}

            {saveIssues.length > 0 && (
                <ul className={styles.issueList} aria-label="Corrections made when saving" data-save-issues="">
                    <li className={styles.issueTitle}>
                        Saved, with these corrections:
                    </li>
                    {saveIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                    ))}
                </ul>
            )}

            <SplitSettings
                id="blocks-split"
                split={draft.split}
                suggestions={suggestDiphthongs(syllables)}
                syllabicSuggestions={suggestSyllabicConsonants(graphemeMap.values())}
                onChange={(split) =>
                    edit((scheme) =>
                        withSplit(
                            scheme,
                            split.mode,
                            split.sibilantClusters === true,
                            split.diphthongs ?? [],
                            split.syllabicConsonants ?? [],
                        ),
                    )
                }
            />

            <section id="blocks-spacing" className={styles.section} aria-labelledby="blocks-spacing-title">
                <div className={styles.sectionHeader}>
                    <h3 id="blocks-spacing-title" className={styles.sectionTitle}>Spacing</h3>
                </div>
                <p className={styles.hint}>
                    Letter spacing and word separation apply to the whole script and save immediately —
                    unlike the block scheme above, which waits for Save.
                </p>
                <ScriptSpacingSettings />
            </section>

            <LoneConsonantSettings
                id="blocks-leftovers"
                leftovers={draft.leftovers}
                onChange={(leftovers) => edit((scheme) => withLeftovers(scheme, leftovers))}
            />

            {/* The two settings above change how EVERY word is cut, so their
                effect is shown right here, on the user's own words — not only
                inside the template editor further down. */}
            <section id="blocks-try" ref={trySectionRef} className={styles.section} aria-labelledby="blocks-try-title">
                <div className={styles.sectionHeader}>
                    <h3 id="blocks-try-title" className={styles.sectionTitle}>Try a word</h3>
                </div>
                <p className={styles.hint}>
                    Pick one of your words, or type some IPA, to see how it is split with the settings above.
                    Nothing is saved until you press Save.
                </p>
                <BlockPreview
                    scheme={tryScheme}
                    wordId={tryWordId}
                    ipa={tryIpa}
                    onWordChange={setTryWordId}
                    onIpaChange={setTryIpa}
                />
            </section>

            {/* The same forced-on draft as "Try a word", over every word. */}
            <WordCheck id="blocks-check" scheme={tryScheme} onTryWord={handleTryWord} />

            <RolesEditor
                id="blocks-roles"
                roles={draftRoles}
                usage={usage}
                onAdd={() => edit((scheme) => addRole(scheme, NEW_ROLE_MATCHER))}
                onUpdate={(roleId, patch) => edit((scheme) => updateRole(scheme, roleId, patch))}
                onRemove={(roleId) => {
                    // The guard is re-checked against the LIVE editor copy too:
                    // removing a role the open template uses would orphan it.
                    if ((usage.get(roleId) ?? 0) > 0) return;
                    edit((scheme) => removeRole(scheme, roleId));
                }}
            />

            <section id="blocks-groups" className={styles.section} aria-label="Variant groups">
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Variant groups</h3>
                    <Button type="button" onClick={() => setGroupsOpen(true)} className={buttonStyles.secondary}>
                        Manage groups…
                    </Button>
                </div>
                <p className={styles.hint}>
                    {groups.length === 0
                        ? 'No variant groups yet. A group ("head", "narrow"…) gathers one alternative form of many signs; a template slot can ask for a group so each sign is drawn in that form.'
                        : `${groups.length} group${groups.length === 1 ? '' : 's'}: ${groups.map((g) => g.name).join(', ')}. A template slot drawn in a group uses each sign's form from it, or its default form when it has none.`}
                </p>
            </section>
            <VariantGroupsDialog open={groupsOpen} onClose={() => setGroupsOpen(false)} />

            <TemplateList
                id="blocks-templates"
                templates={draftTemplates}
                roles={draftRoles}
                editingId={editing ? editing.working.id : null}
                onReorder={(ids) => edit((scheme) => reorderTemplates(scheme, ids))}
                onMove={(id, delta) => edit((scheme) => moveTemplate(scheme, id, delta))}
                onEdit={handleEdit}
                onDuplicate={(id) => edit((scheme) => duplicateTemplate(scheme, id))}
                onRemove={handleRemoveTemplate}
                onNew={() => openEditor(newTemplate(draft), true)}
                onSeed={handleSeed}
                hasWordShapes={syllables.length > 0}
                seedReport={seedReport}
            />

            {editing && (
                <TemplateEditor
                    // A different template remounts the editor (fresh snap / selection).
                    key={editing.original.id}
                    template={editing.working}
                    scheme={draft}
                    groups={groups}
                    isNew={editing.isNew}
                    onChange={(working) => setEditing((current) => (current ? { ...current, working } : current))}
                    onApply={handleApply}
                    onCancel={() => setEditing(null)}
                />
            )}
        </div>
    );
}
