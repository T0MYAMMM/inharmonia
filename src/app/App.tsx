import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { KeyboardSandboxPage } from '@/features/dev/KeyboardSandboxPage';
import { AboutPage } from '@/features/about/AboutPage';
import { SongPage } from '@/features/song/SongPage';
import { ChordLibraryPage } from '@/features/chords/ChordLibraryPage';
import { ChordDrillPage } from '@/features/chords/ChordDrillPage';
import { SongsPage } from '@/features/song/SongsPage';
import { NotFoundPage } from '@/features/not-found/NotFoundPage';
import { useThemeEffect } from './theme';
import { ROUTER_BASENAME } from './config';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="songs" element={<SongsPage />} />
        <Route path="songs/:songId" element={<SongPage />} />
        <Route path="chords" element={<ChordLibraryPage />} />
        <Route path="chords/drill" element={<ChordDrillPage />} />
        <Route path="keyboard" element={<KeyboardSandboxPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  useThemeEffect();
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AppRoutes />
    </BrowserRouter>
  );
}
