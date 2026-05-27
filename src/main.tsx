import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Cloudflare Proxy Base Path Interceptor
// When the app is served behind a reverse proxy at a subpath
// (e.g. antiantiai.xyz/balabot), all /api/ fetch calls need
// to be prefixed with /balabot so the proxy can catch and forward them.
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
