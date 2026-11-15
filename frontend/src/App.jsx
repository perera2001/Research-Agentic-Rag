import AuthPage from './pages/AuthPage';
import Workspace from './pages/Workspace';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot-screen"><div className="boot-mark">✦</div><span>Opening your research workspace…</span></div>;
  return user ? <Workspace /> : <AuthPage />;
}
