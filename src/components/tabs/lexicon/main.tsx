/**
 * Lexicon Tab Main
 * ----------------
 * Entry point for the Lexicon tab with routing.
 *
 * No wrapper element: the shell's `BasicBody` already supplies the max-width,
 * the gutters and the column layout. The `marginBottom: 1rem` that used to live
 * here existed only to stop the last row being clipped by the old
 * `height: 100dvh` shell, which no longer exists.
 *
 * Create, view and edit are three ROUTES — one CRUD paradigm, shared with every
 * other entity in the app. Editing used to be a mode on the view page.
 */

import { Routes, Route } from 'react-router-dom';
import LexiconHome from './LexiconHome';
import CreateLexiconPage from './createLexicon/CreateLexiconPage';
import WordGeneratorPage from './generator/WordGeneratorPage';
import LexiconViewPage from './viewLexicon/LexiconViewPage';
import EditLexiconPage from './editLexicon/EditLexiconPage';

export default function LexiconMain() {
    return (
        <Routes>
            <Route index element={<LexiconHome />} />
            <Route path="create" element={<CreateLexiconPage />} />
            {/* The word generator is a lexicon page, not a tab of its own: what
                it produces is words, and every exit from it lands back here. */}
            <Route path="generate" element={<WordGeneratorPage />} />
            <Route path="db/:id" element={<LexiconViewPage />} />
            <Route path="db/:id/edit" element={<EditLexiconPage />} />
        </Routes>
    );
}
