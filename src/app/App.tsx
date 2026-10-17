import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { KeyboardSandboxPage } from '@/features/dev/KeyboardSandboxPage';
import { AboutPage } from '@/features/about/AboutPage';
import { SongPage } from '@/features/song/SongPage';
import { ChordLibraryPage } from '@/features/chords/ChordLibraryPage';
import { ChordDrillPage } from '@/features/chords/ChordDrillPage';
import { KnownChordsPage } from '@/features/chords/KnownChordsPage';
import { ProgressionsPage } from '@/features/progressions/ProgressionsPage';
import { ProgressionPage } from '@/features/progressions/ProgressionPage';
import { ProgressionBuilderPage } from '@/features/progressions/ProgressionBuilderPage';
import { SongsPage } from '@/features/song/SongsPage';
import { FillsPage } from '@/features/fills/FillsPage';
import { FillPage } from '@/features/fills/FillPage';
import { EarPage } from '@/features/ear/EarPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { StudioPage } from '@/features/studio/StudioPage';
import { MySongPage } from '@/features/mysongs/MySongPage';
import { EditSongPage } from '@/features/mysongs/EditSongPage';
import { ChartPage } from '@/features/charts/ChartPage';
import { ChartEditorPage } from '@/features/charts/ChartEditorPage';
import { NotFoundPage } from '@/features/not-found/NotFoundPage';
import { useThemeEffect } from './theme';
import { ROUTER_BASENAME } from './config';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="songs" element={<SongsPage />} />
        <Route path="songs/mine/:songId" element={<MySongPage />} />
        <Route path="songs/charts/new" element={<ChartEditorPage />} />
        <Route path="songs/charts/:chartId" element={<ChartPage />} />
        <Route path="songs/charts/:chartId/edit" element={<ChartEditorPage key="edit" />} />
        <Route path="songs/:songId" element={<SongPage />} />
        <Route path="chords" element={<ChordLibraryPage />} />
        <Route path="chords/drill" element={<ChordDrillPage />} />
        <Route path="chords/known" element={<KnownChordsPage />} />
        <Route path="progressions" element={<ProgressionsPage />} />
        <Route path="progressions/new" element={<ProgressionBuilderPage />} />
        <Route path="progressions/:progressionId" element={<ProgressionPage />} />
        <Route path="progressions/:progressionId/edit" element={<ProgressionBuilderPage />} />
        <Route path="fills" element={<FillsPage />} />
        <Route path="fills/:fillId" element={<FillPage />} />
        <Route path="ear" element={<EarPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="studio/edit/:songId" element={<EditSongPage />} />
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
