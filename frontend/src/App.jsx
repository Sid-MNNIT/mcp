import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import Email from "./pages/Emails";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Job from "./pages/Jobs";
import Settings from "./pages/Settings";
import AskAI from "./pages/AskAI";
import AskAIFab from "./components/common/AskAIFab";
import Resume from "./pages/Resume";
import { useAuth } from "./context/AuthContext";
import { useEmailAutoSync } from "./hooks/useEmailAutoSync";

function AppInner() {
  const location = useLocation();
  const { status } = useAuth();
  useEmailAutoSync(status === "authenticated");
  const hideFab = ["/auth", "/ask-ai"].includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/emails" element={<ProtectedRoute><Email /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><Job /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/ask-ai" element={<ProtectedRoute><AskAI /></ProtectedRoute>} />
        <Route path="/resume" element={<ProtectedRoute><Resume /></ProtectedRoute>} />
      </Routes>
      {!hideFab && <AskAIFab />}
    </>
  );
}

export default function App() {
  return <AppInner />;
}