import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, googleLogin } from "../../utils/api";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../context/AuthContext";


export default function Login({ onSwitchToSignup }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh: refreshAuth } = useAuth();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setIsLoading(true);
      const response = await loginUser(form);

      if (response.success) {
        // Re-fetch /user/me so AuthContext flips to "authenticated"
        // BEFORE ProtectedRoute evaluates the /dashboard route.
        // Without this the previous "unauthenticated" state stays,
        // ProtectedRoute redirects back to /auth, and the login
        // "silently loops" — a race the DevTools throttling masks.
        await refreshAuth();
        navigate("/dashboard");
      } else {
        alert(response.message || "Login failed");
      }
    } catch (err) {
      alert("Server error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

//for google login
 const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setIsLoading(true);
      const response = await googleLogin(credentialResponse.credential);

      if (response.success) {
        // Same race fix as email/password login — update AuthContext
        // state before navigating so ProtectedRoute sees us logged in.
        await refreshAuth();
        navigate("/dashboard");
      } else {
        alert(response.message || "Google login failed");
      }
    } catch (err) {
      console.error("Google login error:", err);
      alert("Google login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    alert("Google login was unsuccessful. Please try again.");
  };


  return (
    <div className="auth-form-wrapper">
      <div className="auth-header">
        <span className="auth-logo">Jobsy</span>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">
          Don't have an account?
          <span className="auth-link" onClick={onSwitchToSignup}> Sign up</span>
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            type="email"
            name="email"
            className="form-input"
            placeholder="name@company.com"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            name="password"
            className="form-input"
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>

        <button type="submit" className="btn-auth-primary" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="auth-divider">Or continue with</div>
      <div className="google-btn-wrapper">
  <GoogleLogin
    onSuccess={handleGoogleSuccess}
    onError={handleGoogleError}
  />
</div>

    </div>
  );
}
