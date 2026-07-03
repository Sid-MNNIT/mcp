import { useAuth } from "../context/AuthContext";

/**
 * Backwards-compatible hook that now reads from the global AuthContext
 * instead of firing its own /user/me request on every page mount.
 */
export function useCurrentUser() {
  const { user } = useAuth();
  return user?.fullname || "";
}
