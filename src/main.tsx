import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept all fetch requests to prepend `/balabot` to `/api` requests in production/staging environments
const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = '';
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.pathname + input.search;
  } else if (input && typeof input === 'object' && 'url' in input) {
    url = (input as Request).url;
  }

  if (url.startsWith('/api')) {
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname.startsWith('192.168.');
    const isProd = !isLocal;
    
    if (isProd && window.location.pathname.includes('/balabot')) {
      const newUrl = `/balabot${url}`;
      if (typeof input === 'string') {
        input = newUrl;
      } else if (input instanceof URL) {
        input = new URL(newUrl, window.location.origin);
      } else {
        input = new Request(newUrl, input as Request);
      }
    }
  }
  return originalFetch.call(this, input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
