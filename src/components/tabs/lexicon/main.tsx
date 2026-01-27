/**
 * Lexicon Tab Main
 * ----------------
 * Entry point for the Lexicon tab with routing.
 */

import { Routes, Route } from 'react-router-dom';
import classNames from 'classnames';
import { flex, sizing } from "utils-styles";
import LexiconHome from './LexiconHome';
import CreateLexiconPage from './createLexicon/CreateLexiconPage';
import LexiconViewPage from './viewLexicon/LexiconViewPage';

export default function LexiconMain() {
    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <Routes>
                <Route index element={<LexiconHome />} />
                <Route path="create" element={<CreateLexiconPage />} />
                <Route path="db/:id" element={<LexiconViewPage />} />
            </Routes>
        </div>
    );
}
