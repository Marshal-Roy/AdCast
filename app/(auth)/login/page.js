'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    // Input Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      showToast('Welcome back to YourCast!', 'success');
      router.push('/dashboard');
      router.refresh(); // Refresh layout to update auth status in navigation
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Link href="/" style={{ display: 'inline-block' }}>
            <h2 style={{ background: 'linear-gradient(135deg, #0b2b5c, #1e4a76)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '2.2rem', fontWeight: 800 }}>YourCast</h2>
          </Link>
        </div>
        <h2 className="auth-title">Log in to YourCast</h2>
        <p className="auth-subtitle">Access your real-time ad boards console</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              className="form-control"
              placeholder="hello@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: '24px' }}>
            <Link href="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 500 }}>
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Sign In →'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link href="/register">Sign up</Link>
        </div>
      </div>
    </div>
  );
}
