import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { KeyboardSandboxPage } from '@/features/dev/KeyboardSandboxPage';
import { AboutPage } from '@/features/about/AboutPage';
import { NotFoundPage } from '@/features/not-found/NotFoundPage';
import { useThemeEffect } from './theme';
import { ROUTER_BASENAME } from './config';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
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
