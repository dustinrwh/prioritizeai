import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AppBar from './components/AppBar';
import Backlog from './pages/Backlog';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import SettingsPage from './pages/Settings';
import Submit from './pages/Submit';
import { useAuth } from './lib/auth';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  return (
    <div className="min-h-screen flex flex-col">
      <AppBar />
      <main className="flex-1 min-h-0 flex flex-col"><Outlet /></main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/backlog" element={<Backlog />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
