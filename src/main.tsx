import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles/global.css';
import { App } from './app/App';
import { installAudioUnlock, installMidiAutoConnect } from './app/services';

installAudioUnlock();
installMidiAutoConnect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
