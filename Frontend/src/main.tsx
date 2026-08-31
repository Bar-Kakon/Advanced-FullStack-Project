import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Provider } from 'react-redux';

import { App } from './App';
import { store } from './store/store';

/**
 * The single point where React takes over a piece of the page: it finds the empty `<div id="root">`
 * in `index.html` and renders the app inside it. Everything else on screen is drawn by React.
 *
 * `StrictMode` is a development-only wrapper that deliberately runs certain code twice to surface
 * bugs early — an effect that does not clean up after itself, for instance. It disappears from the
 * production build and changes nothing a visitor sees.
 */
const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing <div id="root">.');

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
