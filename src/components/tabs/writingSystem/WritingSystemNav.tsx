/**
 * WritingSystemNav — the nested Direction / Blocks strip of `/writing-system`.
 *
 * The same contract as `ScriptMakerNav` (Script Maker): the ROUTER owns the
 * active tab (`urlSync={false}` + `controlledActiveSection` +
 * `onSectionChange`), so a deep link, the back button and a tab click can
 * never disagree. It is a LAYOUT route — both sections render the same
 * `<Outlet/>`.
 *
 * Switching tabs goes through `guardedNavigate`: the Blocks page holds an
 * unsaved DRAFT scheme and registers it as dirty, so leaving for Direction
 * asks first. A refused navigation leaves the strip where it was, because the
 * active section is derived from the pathname, not from the click.
 */

import { useMemo } from 'react';
import { Outlet, useMatch } from 'react-router-dom';

import TabContainer, { type section } from 'cyber-components/container/tabContainer';
import { sizing } from 'utils-styles';

import { ROUTES } from '../../../url_mapping';
import { useUnsavedChanges } from '../../shell';

export default function WritingSystemNav() {
    const { guardedNavigate } = useUnsavedChanges();
    const onBlocks = useMatch(`${ROUTES.writingSystemBlocks}/*`) !== null;

    const sections = useMemo<section[]>(
        () => [
            { id: 'direction', toggle: 'Direction', content: <Outlet /> },
            { id: 'blocks', toggle: 'Blocks', content: <Outlet /> },
        ],
        [],
    );

    return (
        <TabContainer
            id="writing-system-nav"
            sections={sections}
            urlSync={false}
            controlledActiveSection={onBlocks ? 'blocks' : 'direction'}
            onSectionChange={(id) => void guardedNavigate(id === 'blocks' ? ROUTES.writingSystemBlocks : ROUTES.writingSystem)}
            dropdownBelowWidth={480}
            parts={{
                root: { role: 'navigation', 'aria-label': 'Writing System' },
                panel: { className: sizing.paddingL },
            }}
        />
    );
}
