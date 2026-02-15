import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Get the same base path from import.meta.env
const basename = import.meta.env.BASE_URL

// Handle GitHub Pages SPA redirect from 404.html
const redirectPath = sessionStorage.getItem('redirectPath');
if (redirectPath) {
    sessionStorage.removeItem('redirectPath');
    // Use history.replaceState to update the URL without triggering a page reload
    history.replaceState(null, '', redirectPath);
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter basename={basename}>
            <App/>
        </BrowserRouter>
    </StrictMode>,
)
