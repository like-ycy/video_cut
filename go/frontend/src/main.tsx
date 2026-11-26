import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import { initThemeFromStorage } from './lib/theme'
import App from './App'

initThemeFromStorage()

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
