import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { signupUser, googleLogin } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

export default function Signin({ onSwitchToLogin }) {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh: refreshAuth } = useAuth();

  const [form, setForm] = useState({
    fullname: "",
    email: "",
    age: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);

      const response = await signupUser({
        fullname: form.fullname,
        email: form.email,
        password: form.password,
        age: form.age,
      });

      if (response.success) {
        alert("Account created successfully");
        onSwitchToLogin();
      } else {
        alert(response.message || "Signup failed");
      }
    } catch (error) {
      alert("Server error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setIsLoading(true);
      const response = await googleLogin(credentialResponse.credential);

      if (response.success) {
        // Refresh AuthContext BEFORE navigating so ProtectedRoute
        // sees us as authenticated. Without this, /dashboard bounces
        // us back to /auth even though cookies were set correctly.
        await refreshAuth();
        navigate("/dashboard");
      } else {
        alert(response.message || "Google signup failed");
      }
    } catch (err) {
      console.error("Google signup error:", err);
      alert("Google signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    alert("Google signup was unsuccessful. Please try again.");
  };

  return (
    <div className="auth-form-wrapper">
      <div className="auth-header">
        <span className="auth-logo">Jobsy</span>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">
          Already have an account? 
          <span className="auth-link" onClick={onSwitchToLogin}> Log in</span>
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        
        {/* Full Name */}
        <div className="form-group">
          <label className="form-label">Full Name</label>
          <input type="text" name="fullname" className="form-input" placeholder="e.g. John Doe" value={form.fullname} onChange={handleChange} required/>
        </div>

        {/* Email & Age (Grid Layout) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input type="email" name="email" className="form-input" placeholder="name@company.com" value={form.email} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Age</label>
            <input type="number" name="age" className="form-input" placeholder="18+" min="1" value={form.age} onChange={handleChange} required />
          </div>
        </div>

        {/* Password */}
        <div className="form-group">
          <label className="form-label">Password</label>
          <input type="password" name="password" className="form-input" placeholder="••••••••" value={form.password} onChange={handleChange} required />
        </div>

        {/* Confirm Password */}
        <div className="form-group">
          <label className="form-label">Confirm Password</label>
          <input type="password" name="confirmPassword" className="form-input" placeholder="••••••••" value={form.confirmPassword} onChange={handleChange} required />
        </div>

        <button type="submit" className="btn-auth-primary" disabled={isLoading}>
          {isLoading ? "Creating..." : "Create Account"}
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