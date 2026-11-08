import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { PlayerProvider } from './player/PlayerProvider';
import { QuestboardProvider } from './questboard/QuestboardProvider';
import { DashboardPage } from './pages/DashboardPage';
import { WorldMapPage } from './pages/WorldMapPage';
import { QuestboardPage } from './pages/QuestboardPage';
import { JournalPage } from './pages/JournalPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="map" element={<WorldMapPage />} />
        <Route path="questboard" element={<QuestboardPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <BrowserRouter><PlayerProvider><QuestboardProvider><AppRoutes /></QuestboardProvider></PlayerProvider></BrowserRouter>;
}
