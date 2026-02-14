import { Routes, Route } from 'react-router-dom';

import './App.css'

import { EtymologProvider } from "./db";
import { ProcessingLockModalProvider } from "cyber-components/graphics/loading/processingLockModal/processingLockModal";

import NewConlangPage from './components/pages/new-conlang/NewConlangPage.tsx';
import ConlangGuard from './components/pages/new-conlang/ConlangGuard.tsx';
import MainApp from './MainApp.tsx';

function App() {
    return (
        <ProcessingLockModalProvider>
            <EtymologProvider>
                <Routes>
                    <Route path="/new" element={<NewConlangPage />} />
                    <Route path="/*" element={
                        <ConlangGuard>
                            <MainApp />
                        </ConlangGuard>
                    } />
                </Routes>
            </EtymologProvider>
        </ProcessingLockModalProvider>
    )
}

export default App
