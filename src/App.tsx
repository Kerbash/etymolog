import { Routes, Route, Navigate } from 'react-router-dom';

import { EtymologProvider } from './db';
import { ProcessingLockModalProvider } from 'cyber-components/graphics/loading/processingLockModal/processingLockModal';

import NewConlangPage from './components/pages/new-conlang/NewConlangPage.tsx';
import ConlangGuard from './components/pages/new-conlang/ConlangGuard.tsx';
import { GuideLayout, GuideIndex, GuideSectionPage } from './components/pages/guide';
import { AppShell } from './components/shell';
import LexiconMain from './components/tabs/lexicon/main.tsx';
import GraphemeMain from './components/tabs/grapheme/main.tsx';
import { WritingSystemMain } from './components/tabs/writingSystem';
import TranslatorMain from './components/tabs/translator/main.tsx';
import { ConfirmDialogProvider, NotFoundNotice, NotificationProvider } from './components/shared';
import { ROUTES } from './url_mapping';

function App() {
    return (
        <ProcessingLockModalProvider>
            <EtymologProvider>
                {/* Both providers sit ABOVE <Routes>, not inside the shell:
                    /new is a sibling route, so mounting them in the shell would
                    leave the new-conlang page (which deletes databases) with no
                    confirmation dialog and no way to report a failure. Above the
                    routes also means a notice raised by an action that navigates
                    survives the navigation. */}
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <Routes>
                            <Route path={ROUTES.new} element={<NewConlangPage />} />
                            <Route path="/guide" element={<GuideLayout />}>
                                <Route index element={<GuideIndex />} />
                                <Route path=":slug" element={<GuideSectionPage />} />
                            </Route>

                            {/* LAYOUT route: the shell renders once and the tab
                                pages swap through its <Outlet/>. The tabs used
                                to be a component that owned its own <Routes>
                                (RouterTabContainer), which meant navigation
                                structure lived inside a presentational
                                component and the shell re-mounted on every tab
                                switch. */}
                            <Route
                                element={
                                    <ConlangGuard>
                                        <AppShell />
                                    </ConlangGuard>
                                }
                            >
                                <Route index element={<Navigate to={ROUTES.lexicon} replace />} />
                                {/* Each tab main keeps owning its own nested
                                    <Routes> — hence the trailing `/*`. */}
                                <Route path="lexicon/*" element={<LexiconMain />} />
                                <Route path="script-maker/*" element={<GraphemeMain />} />
                                <Route path="writing-system/*" element={<WritingSystemMain />} />
                                <Route path="translator/*" element={<TranslatorMain />} />
                                {/* Anything else inside the shell is a typo or a
                                    stale bookmark: say so and offer the way to
                                    the lexicon, rather than a blank panel or a
                                    silent bounce to another page. */}
                                <Route path="*" element={<NotFoundNotice backTo={ROUTES.lexicon} backLabel="Go to the lexicon" />} />
                            </Route>
                        </Routes>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </EtymologProvider>
        </ProcessingLockModalProvider>
    );
}

export default App;
