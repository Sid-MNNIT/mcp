import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * Reads auth from the global AuthContext (checked once at app startup)
 * instead of re-fetching /user/me on every route change.
 * This is what removes the "Checking authentication..." flash between URLs.
 */
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();

  // Only shows on the initial app load, never on subsequent navigation.
  if (status === "loading") return null;

  if (status === "unauthenticated") return <Navigate to="/auth" replace />;

  return children;
}
