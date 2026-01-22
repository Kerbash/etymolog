import {Routes, Route, Link, useLocation} from "react-router-dom";
import CreateLexiconForm from "./create/createLexicon.tsx";
import LexiconView from "./view/lexiconView.tsx";

function LexiconNav() {
    const location = useLocation();
    const isCreate = location.pathname.includes('/create');
    const isView = location.pathname.includes('/view');
    const isHome = !isCreate && !isView;

    return (
        <nav style={{marginBottom: '1rem', display: 'flex', gap: '1rem'}}>
            <Link
                to="/lexicon"
                style={{fontWeight: isHome ? 'bold' : 'normal'}}
            >
                Home
            </Link>
            <Link
                to="/lexicon/create"
                style={{fontWeight: isCreate ? 'bold' : 'normal'}}
            >
                Create
            </Link>
            <Link
                to="/lexicon/view"
                style={{fontWeight: isView ? 'bold' : 'normal'}}
            >
                View
            </Link>
        </nav>
    );
}

function LexiconHome() {
    return (
        <div>
            <h2>Lexicon Home</h2>
            <p>Welcome to the Lexicon section. Choose an option above.</p>
        </div>
    );
}

export default function LexiconMain() {
    return (
        <div>
            <LexiconNav />
            <Routes>
                <Route index element={<LexiconHome />} />
                <Route path="create" element={<CreateLexiconForm />} />
                <Route path="view" element={<LexiconView />} />
                <Route path="view/:id" element={<LexiconView />} />
            </Routes>
        </div>
    )
}