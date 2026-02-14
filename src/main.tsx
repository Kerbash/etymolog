import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Get the same base path from import.meta.env
const basename = import.meta.env.BASE_URL

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter basename={basename}>
            <App/>
        </BrowserRouter>
    </StrictMode>,
)
