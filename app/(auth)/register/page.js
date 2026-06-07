'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      showToast('All fields are required', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      showToast('Account registered successfully!', 'success');
      router.push('/dashboard');
      router.refresh();
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
        <h2 className="auth-title">Create your Account</h2>
        <p className="auth-subtitle">Set up your screen console</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              className="form-control"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

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

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label" htmlFor="password">Password</label>
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

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isLoading}
          >
            {isLoading ? 'Creating account...' : 'Get Started Now →'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link href="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
