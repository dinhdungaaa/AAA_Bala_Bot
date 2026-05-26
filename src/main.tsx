import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ============================================================
// Cloudflare Proxy Base Path Interceptor
// ============================================================
// When the app is served behind a reverse proxy at a subpath
// (e.g. antiantiai.xyz/balabot), all /api/ fetch calls need
// to be prefixed with /balabot so the Cloudflare Worker can
// catch and forward them to the origin server.
//
// This global interceptor handles it transparently so that
// zero changes are needed in the rest of the codebase.
// ============================================================
const BASE_PATH = window.location.pathname.startsWith('/balabot') ? '/balabot' : '';

if (BASE_PATH) {
  const _originalFetch = window.fetch.bind(window);
  (window as any).fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return _originalFetch(`${BASE_PATH}${input}`, init);
    }
    return _originalFetch(input, init);
  };
}

// Export for use by other modules (e.g. webhook URL display)
export const APP_BASE_PATH = BASE_PATH;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
