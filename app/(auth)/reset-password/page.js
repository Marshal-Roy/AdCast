'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useNotification();

  useEffect(() => {
    const t = searchParams.get('token');
    if (t) {
      setToken(t);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      showToast('Invalid or missing reset token', 'error');
      return;
    }
    if (!password || !confirmPassword) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Password reset failed');
      }

      showToast('Password reset successful! You can now log in.', 'success');
      router.push('/login');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2 className="auth-title">Invalid Reset Link</h2>
        <p className="auth-subtitle">The password reset token is missing or malformed. Please request a new one.</p>
        <Link href="/forgot-password" className="btn btn-primary btn-full">
          Request Reset Link
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <Link href="/" style={{ display: 'inline-block' }}>
          <h2 style={{ background: 'linear-gradient(135deg, #0b2b5c, #1e4a76)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '2.2rem', fontWeight: 800 }}>YourCast</h2>
        </Link>
      </div>
      <h2 className="auth-title">Choose New Password</h2>
      <p className="auth-subtitle">Create a secure password for your account</p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="password">New Password</label>
          <input
            type="password"
            id="password"
            className="form-control"
            placeholder="•••••••• (Min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
          <input
            type="password"
            id="confirmPassword"
            className="form-control"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={isLoading}
        >
          {isLoading ? 'Resetting password...' : 'Save Password →'}
        </button>
      </form>

      <div className="auth-footer">
        Back to <Link href="/login">Log in</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-wrapper">
      <Suspense fallback={
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p className="auth-subtitle">Loading reset form...</p>
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
