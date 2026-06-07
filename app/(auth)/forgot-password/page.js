'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [debugLink, setDebugLink] = useState('');
  const { showToast } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      showToast('Please enter your email', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      showToast(data.message, 'success');
      setSubmitted(true);
      if (data.debugLink) {
        setDebugLink(data.debugLink);
      }
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
        <h2 className="auth-title">Reset your Password</h2>
        
        {!submitted ? (
          <>
            <p className="auth-subtitle">We will send a reset link to your registered email</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '24px' }}>
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

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={isLoading}
              >
                {isLoading ? 'Sending request...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <p style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '1.05rem', marginBottom: '12px' }}>
              ✓ Request Processed
            </p>
            <p className="auth-subtitle" style={{ marginBottom: '24px' }}>
              Check your terminal console or use the sandbox test shortcut below to complete password reset.
            </p>

            {debugLink && (
              <div style={{ background: 'var(--primary-light)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid #c2dbfc', marginBottom: '24px' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🧪 Sandbox Testing Portal
                </p>
                <Link href={debugLink} className="btn btn-primary btn-full" style={{ fontSize: '0.9rem', padding: '8px 16px' }}>
                  Reset Password Now →
                </Link>
              </div>
            )}
            
            <button className="btn btn-outline btn-full" onClick={() => setSubmitted(false)} style={{ fontSize: '0.9rem' }}>
              ← Try another email
            </button>
          </div>
        )}

        <div className="auth-footer">
          Back to <Link href="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
