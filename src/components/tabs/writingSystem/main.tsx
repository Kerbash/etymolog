/**
 * Writing System tab area - main entry
 *
 * Contains the UI for the writing system section.
 * Configures directional flow rules for the conlang's script.
 */

import classNames from 'classnames';
import RouterTabContainer from 'cyber-components/container/tabContainer/routerTabContainer.tsx';
import GeneralTab from './general/GeneralTab';
import { flex, sizing } from 'utils-styles';

const sections = [
    {
        path: '',
        toggle: 'General',
        content: <GeneralTab />,
    },
];

export default function WritingSystemMain() {
    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <RouterTabContainer
                basePath="/writing-system"
                sections={sections}
                contentContainerProps={{
                    className: classNames(sizing.paddingL),
                }}
            />
        </div>
    );
}
