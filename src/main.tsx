import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './watermelon-overrides.css'
import App from './App'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
