import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './state/auth';
import Landing from './pages/Landing';
import AuthPage from './pages/Auth';
import Hub from './pages/Hub';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import PublicRooms from './pages/PublicRooms';
import RoomPage from './pages/room/RoomPage';
import ProfilePage from './pages/Profile';
import History from './pages/History';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function Protected({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!profile) return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="auth" element={<AuthPage />} />
        <Route path="hub" element={<Protected><Hub /></Protected>} />
        <Route path="create" element={<Protected><CreateRoom /></Protected>} />
        <Route path="join" element={<Protected><JoinRoom /></Protected>} />
        <Route path="join/:code" element={<Protected><JoinRoom /></Protected>} />
        <Route path="rooms" element={<Protected><PublicRooms /></Protected>} />
        <Route path="room/:roomId" element={<Protected><RoomPage /></Protected>} />
        <Route path="profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="player/:id" element={<Protected><ProfilePage /></Protected>} />
        <Route path="history" element={<Protected><History /></Protected>} />
        <Route path="leaderboard" element={<Protected><Leaderboard /></Protected>} />
        <Route path="settings" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
