import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './cores-theme.css'

document.addEventListener('wheel', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) {
    target.blur()
  }
}, { capture: true, passive: true })

const appBase = window.location.pathname === '/planner' || window.location.pathname.startsWith('/planner/')
  ? '/planner/'
  : '/'

document.querySelector<HTMLLinkElement>('#app-manifest')?.setAttribute('href', `${appBase}manifest.webmanifest`)
document.querySelector<HTMLLinkElement>('#app-touch-icon')?.setAttribute('href', `${appBase}app-icons/icon-180.png`)
document.querySelector<HTMLLinkElement>('#app-favicon')?.setAttribute('href', `${appBase}logos/plannercore_black_icon.svg`)

const standaloneQuery = window.matchMedia('(display-mode: standalone)')
const syncDisplayMode = () => {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  document.documentElement.classList.toggle(
    'is-standalone',
    standaloneQuery.matches || navigatorWithStandalone.standalone === true,
  )
}

syncDisplayMode()
standaloneQuery.addEventListener?.('change', syncDisplayMode)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${appBase}sw.js?v=2`, {
      scope: appBase,
      updateViaCache: 'none',
    }).catch((error: unknown) => {
      console.error('PlannerCore service worker registration failed:', error)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
