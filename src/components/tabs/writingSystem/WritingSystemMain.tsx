/**
 * The Writing System area, mounted by `App.tsx` at `/writing-system/*`.
 *
 * ```
 *  [ Direction | Blocks ]          ← WritingSystemNav (router-owned)
 *  ┌────────────────────────────┐
 *  │ index   → WritingSystemPage │  glyph / word / line direction rules
 *  │ blocks  → BlocksPage        │  the block-script designer
 *  └────────────────────────────┘
 * ```
 */

import { Route, Routes } from 'react-router-dom';

import { ROUTES } from '../../../url_mapping';
import { NotFoundNotice } from '../../shared';
import WritingSystemNav from './WritingSystemNav';
import WritingSystemPage from './WritingSystemPage';
import { BlocksPage } from './blocks';

export default function WritingSystemMain() {
    return (
        <Routes>
            <Route element={<WritingSystemNav />}>
                <Route index element={<WritingSystemPage />} />
                <Route path="blocks" element={<BlocksPage />} />
                <Route path="*" element={<NotFoundNotice backTo={ROUTES.writingSystem} backLabel="Go to the writing system" />} />
            </Route>
        </Routes>
    );
}
