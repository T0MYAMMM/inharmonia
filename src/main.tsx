import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles/global.css';
import { App } from './app/App';
import { installMidiAutoConnect } from './app/services';
import { registerServiceWorker } from './app/pwa';
import { reloadOnPreloadError } from './app/preloadError';

reloadOnPreloadError();
installMidiAutoConnect();
void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
