import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { LogActivity } from "./pages/LogActivity";
import { Friends } from "./pages/Friends";
import { Goals } from "./pages/Goals";
import { Events } from "./pages/Events";
import { Upgrade } from "./pages/Upgrade";
import { Admin } from "./pages/Admin";

function Protected({ children, adminOnly }: { children: JSX.Element; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted hud">loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/log" element={<Protected><LogActivity /></Protected>} />
      <Route path="/friends" element={<Protected><Friends /></Protected>} />
      <Route path="/goals" element={<Protected><Goals /></Protected>} />
      <Route path="/events" element={<Protected><Events /></Protected>} />
      <Route path="/upgrade" element={<Protected><Upgrade /></Protected>} />
      <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
