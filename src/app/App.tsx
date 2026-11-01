import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/not-found/NotFoundPage';
import { lazyPage } from './lazyPage';
import { useThemeEffect } from './theme';
import { ROUTER_BASENAME } from './config';

// Every room but Home loads its code when it first opens.
const KeyboardSandboxPage = lazyPage(
  () => import('@/features/dev/KeyboardSandboxPage'),
  'KeyboardSandboxPage',
);
const AboutPage = lazyPage(() => import('@/features/about/AboutPage'), 'AboutPage');
const SongPage = lazyPage(() => import('@/features/song/SongPage'), 'SongPage');
const ChordLibraryPage = lazyPage(
  () => import('@/features/chords/ChordLibraryPage'),
  'ChordLibraryPage',
);
const ChordDrillPage = lazyPage(() => import('@/features/chords/ChordDrillPage'), 'ChordDrillPage');
const KnownChordsPage = lazyPage(
  () => import('@/features/chords/KnownChordsPage'),
  'KnownChordsPage',
);
const ProgressionsPage = lazyPage(
  () => import('@/features/progressions/ProgressionsPage'),
  'ProgressionsPage',
);
const ProgressionPage = lazyPage(
  () => import('@/features/progressions/ProgressionPage'),
  'ProgressionPage',
);
const ProgressionBuilderPage = lazyPage(
  () => import('@/features/progressions/ProgressionBuilderPage'),
  'ProgressionBuilderPage',
);
const SongsPage = lazyPage(() => import('@/features/song/SongsPage'), 'SongsPage');
const FillsPage = lazyPage(() => import('@/features/fills/FillsPage'), 'FillsPage');
const FillPage = lazyPage(() => import('@/features/fills/FillPage'), 'FillPage');
const EarPage = lazyPage(() => import('@/features/ear/EarPage'), 'EarPage');
const ProgressPage = lazyPage(() => import('@/features/progress/ProgressPage'), 'ProgressPage');
const StudioPage = lazyPage(() => import('@/features/studio/StudioPage'), 'StudioPage');
const MySongPage = lazyPage(() => import('@/features/mysongs/MySongPage'), 'MySongPage');
const EditSongPage = lazyPage(() => import('@/features/mysongs/EditSongPage'), 'EditSongPage');
const ChartPage = lazyPage(() => import('@/features/charts/ChartPage'), 'ChartPage');
const ChartEditorPage = lazyPage(
  () => import('@/features/charts/ChartEditorPage'),
  'ChartEditorPage',
);
/** For composers, not linked from the app. */
const ComposePage = lazyPage(() => import('@/features/compose/ComposePage'), 'ComposePage');

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
        <Route path="compose" element={<ComposePage />} />
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
