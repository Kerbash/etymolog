/**
 * Translator Tab Main
 * -------------------
 * Entry point for the Translator tab.
 */

import classNames from 'classnames';
import { flex, sizing } from "utils-styles";
import TranslatorHome from './TranslatorHome';

export default function TranslatorMain() {
    return (
        <div className={classNames(flex.flexRow, flex.flexGapM, sizing.paddingM)} style={{ marginBottom: '1rem' }}>
            <TranslatorHome />
        </div>
    );
}
