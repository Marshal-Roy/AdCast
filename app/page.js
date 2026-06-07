'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/lib/NotificationContext';

export default function LandingPage() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isNavigating, setIsNavigating] = useState(true);
  const { showToast } = useNotification();
  const router = useRouter();

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setUser(data.user);
            setIsAuthenticated(true);
            router.push('/dashboard');
          }
        }
      } catch (err) {
        console.error('Auth verification error:', err);
      } finally {
        setIsNavigating(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        showToast('Logged out successfully', 'success');
        setUser(null);
        setIsAuthenticated(false);
        router.refresh();
      }
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  };

  // Helper scroll function
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Pricing buttons action
  const handlePricingClick = (planName) => {
    if (planName === 'starter') {
      if (isAuthenticated) {
        showToast('ℹ️ You are already active on the Starter plan!', 'info');
        router.push('/dashboard');
      } else {
        router.push('/register');
      }
    } else if (planName === 'pro') {
      if (isAuthenticated) {
        router.push('/checkout?plan=pro');
      } else {
        showToast('🔑 Please log in or register to buy Pro plan!', 'info');
        router.push('/login');
      }
    } else if (planName === 'enterprise') {
      scrollToSection('contact');
      setContactMessage("I am interested in the YourCast Enterprise Plan. Please contact me with a custom quote for our fleet/locations.");
      showToast('🏢 Enterprise plan: details populated in contact form below!');
    }
  };

  // Special request CTA button
  const handleSpecialRequest = () => {
    scrollToSection('contact');
    setTimeout(() => {
      const msgBox = document.getElementById('askMessage');
      if (msgBox) msgBox.focus();
      setContactMessage("I want to run a special advertising campaign (e.g. drone-led banners, 3D anamorphic screens, etc.): ");
      showToast('💡 Tell us your unique idea! We build custom screen solutions.');
    }, 300);
  };

  // Contact form submission
  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) {
      showToast('❌ Please fill in your name, email and message.', 'error');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      showToast(`✅ Thanks ${contactName}! Request received. We'll connect in 2 hours.`, 'success');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactMessage('');
      setIsSubmitting(false);
    }, 1200);
  };

  return (
    <>
      {/* Header section */}
      <header>
        <div className="container">
          <div className="navbar">
            <div className="logo" onClick={() => scrollToSection('home')} style={{ cursor: 'pointer' }}>
              <h1>YourCast</h1>
              <span>smart ad displays</span>
            </div>

            <div className="nav-links">
              <a href="#home" onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}>Home</a>
              <a href="#howitworks" onClick={(e) => { e.preventDefault(); scrollToSection('howitworks'); }}>How it works</a>
              <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToSection('pricing'); }}>Pricing</a>
              <a href="#contact" onClick={(e) => { e.preventDefault(); scrollToSection('contact'); }}>Connect</a>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {isNavigating ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Checking session...</span>
              ) : isAuthenticated ? (
                <>
                  <Link href="/dashboard" className="btn btn-outline" style={{ padding: '8px 20px' }}>
                    Console Dashboard
                  </Link>
                  <button onClick={handleLogout} className="btn btn-primary" style={{ padding: '8px 20px', background: 'var(--accent-red)' }}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-outline" style={{ padding: '8px 20px' }}>
                    Sign In
                  </Link>
                  <Link href="/register" className="btn btn-primary" style={{ padding: '8px 20px' }}>
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section id="home" className="hero-section">
          <div className="container">
            <div className="hero-grid">
              <div>
                <div style={{ background: '#e9f0fd', color: '#1a5bbf', display: 'inline-block', padding: '6px 14px', borderRadius: '40px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '24px' }}>
                  ⚡ LIVE ADVERTISING · RELIABLE SCHEDULING
                </div>
                <h1 className="hero-title">
                  Turn every screen into a <span style={{ color: 'var(--primary)' }}>marketing opportunity</span>
                </h1>
                <p className="hero-description">
                  Digital ad boards for mobile fleets, retail stores, and events. Display your campaigns and track impressions live.
                </p>
                <div className="hero-buttons">
                  <button onClick={() => scrollToSection('pricing')} className="btn btn-primary btn-large">
                    Get Started →
                  </button>
                  <button onClick={() => scrollToSection('howitworks')} className="btn btn-outline btn-large">
                    How it works
                  </button>
                </div>
              </div>
              <div className="hero-visual-container">
                <div className="led-frame">
                  <div className="led-preview">
                    <div className="led-badge">🔴 LIVE PREVIEW</div>
                    LIVE: “Coffee 50m ahead”<br />
                    🟢 Impressions: 1,284<br />
                    ⏱️ updated 2 sec ago
                  </div>
                  <p style={{ marginTop: '16px', fontSize: '0.8rem', opacity: 0.8, fontWeight: 500, textAlign: 'center' }}>
                    ✨ Automated ad rotation | Location targeted
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="howitworks" style={{ padding: '70px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div className="container">
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, textAlign: 'center', marginBottom: '48px' }}>
              ⚙️ How YourCast works
            </h2>
            <div className="steps-grid">
              <div className="step-card">
                <div className="step-badge">1</div>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>Select screen package</h3>
                <p style={{ color: 'var(--text-muted)' }}>Choose the plan that suits you best: Starter (1 screen) or Pro (3 screens) for your ad campaign.</p>
              </div>
              <div className="step-card">
                <div className="step-badge">2</div>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>Assign display content</h3>
                <p style={{ color: 'var(--text-muted)' }}>Select what you want to show on your screens upon scheduling. Content remains fixed and reliable for the duration.</p>
              </div>
              <div className="step-card">
                <div className="step-badge">3</div>
                <h3 style={{ fontSize: '1.3rem', marginBottom: '12px' }}>Track live impressions</h3>
                <p style={{ color: 'var(--text-muted)' }}>Monitor real impressions and track performance metrics directly from your console dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Why YourCast */}
        <section style={{ padding: '70px 0', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          <div className="container">
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, textAlign: 'center', marginBottom: '48px' }}>
              🚀 Why brands choose YourCast
            </h2>
            <div className="why-grid">
              <div className="why-card" style={{ background: 'var(--bg-main)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚡</div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Automated schedules</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Reliable automated rotations run continuously without manual intervention</p>
              </div>
              <div className="why-card" style={{ background: 'var(--bg-main)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📍</div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Hyper-local reach</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Target your audience within specific geographic display locations</p>
              </div>
              <div className="why-card" style={{ background: 'var(--bg-main)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📊</div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Transparent analytics</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Monitor verified screen views and aggregate impression metrics in real-time</p>
              </div>
              <div className="why-card" style={{ background: 'var(--bg-main)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💰</div>
                <h4 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Flexible pricing</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Choose from standard Starter or Pro daily rates without hidden fees</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" style={{ padding: '70px 0', borderBottom: '1px solid var(--border-color)' }}>
          <div className="container">
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, textAlign: 'center', marginBottom: '48px' }}>
              📋 Simple & flexible plans
            </h2>
            <div className="plans-grid">
              {/* Starter Plan */}
              <div className="plan-card">
                <div>
                  <h3 style={{ fontSize: '1.4rem' }}>Starter</h3>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, margin: '20px 0 10px' }}>
                    ₹500<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/day</span>
                  </div>
                  <ul style={{ margin: '20px 0', listStyle: 'none', lineHeight: 2, color: 'var(--text-muted)' }}>
                    <li>✓ 1 static screen</li>
                    <li>✓ 1 location</li>
                    <li>✓ manual updates</li>
                  </ul>
                </div>
                <button onClick={() => handlePricingClick('starter')} className="btn btn-outline btn-full">
                  {isAuthenticated ? 'Active on Starter' : 'Register Now'}
                </button>
              </div>

              {/* Pro Plan */}
              <div className="plan-card pro-plan">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.4rem' }}>Pro</h3>
                    <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600 }}>POPULAR</span>
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, margin: '20px 0 10px' }}>
                    ₹1500<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/day</span>
                  </div>
                  <ul style={{ margin: '20px 0', listStyle: 'none', lineHeight: 2, color: 'var(--text-muted)' }}>
                    <li>✓ 3 screens / rotating ads</li>
                    <li>✓ location & time targeting</li>
                    <li>✓ real-time dashboard console</li>
                  </ul>
                </div>
                <button onClick={() => handlePricingClick('pro')} className="btn btn-primary btn-full">
                  Upgrade to Pro →
                </button>
              </div>

              {/* Enterprise Plan */}
              <div className="plan-card">
                <div>
                  <h3 style={{ fontSize: '1.4rem' }}>Enterprise</h3>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, margin: '20px 0 10px' }}>
                    Custom
                  </div>
                  <ul style={{ margin: '20px 0', listStyle: 'none', lineHeight: 2, color: 'var(--text-muted)' }}>
                    <li>✓ Full city fleet</li>
                    <li>✓ weather & traffic triggers</li>
                    <li>✓ dedicated account manager</li>
                  </ul>
                </div>
                <button onClick={() => handlePricingClick('enterprise')} className="btn btn-outline btn-full">
                  Talk to expert
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Connect section */}
        <section id="contact" style={{ padding: '70px 0', borderBottom: 'none' }}>
          <div className="container">
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, textAlign: 'center', marginBottom: '48px' }}>
              📢 Connect with YourCast
            </h2>
            <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '36px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color-light)' }}>
              {/* Contact Info */}
              <div>
                <h3 style={{ fontSize: '1.6rem', marginBottom: '24px', textAlign: 'center' }}>📞 Reach us directly</h3>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'var(--primary-light)', minWidth: '48px', height: '48px', borderRadius: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>📍</div>
                  <div>
                    <strong>HQ / Service hub</strong>
                    <br /><span style={{ color: 'var(--text-muted)' }}>Mumbai, India | also serving Delhi, Bangalore</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'var(--primary-light)', minWidth: '48px', height: '48px', borderRadius: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>📱</div>
                  <div>
                    <strong>Phone / WhatsApp</strong>
                    <br /><span style={{ color: 'var(--text-muted)' }}>+91 98765 43210</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'var(--primary-light)', minWidth: '48px', height: '48px', borderRadius: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>✉️</div>
                  <div>
                    <strong>Email</strong>
                    <br /><span style={{ color: 'var(--text-muted)' }}><a href="mailto:hello@yourcast.com" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>hello@yourcast.com</a></span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'var(--primary-light)', minWidth: '48px', height: '48px', borderRadius: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>💬</div>
                  <div>
                    <strong>Live support hours</strong>
                    <br /><span style={{ color: 'var(--text-muted)' }}>Mon–Sat, 9am – 9pm IST</span>
                  </div>
                </div>
                <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid var(--border-color-light)', paddingTop: '24px' }}>
                  <p style={{ fontWeight: 600, marginBottom: '12px' }}>Follow us:</p>
                  <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', color: 'var(--primary)', fontWeight: 500 }}>
                    <span style={{ cursor: 'pointer' }}>🔵 Instagram</span>
                    <span style={{ cursor: 'pointer' }}>🔗 LinkedIn</span>
                    <span style={{ cursor: 'pointer' }}>🐦 Twitter</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Special request prompt */}
        <section style={{ background: 'var(--primary-light)', padding: '48px 0', borderBottom: 'none' }}>
          <div className="container" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.9rem', marginBottom: '8px' }}>✨ Need something special? <br />Just tell YourCast.</h2>
            <p style={{ margin: '12px auto 24px', maxWidth: '600px', color: 'var(--text-muted)' }}>
              From drone-led banners to 3D anamorphic screens – we build custom ad solutions.
            </p>
            <a href="mailto:hello@yourcast.com?subject=Special Campaign Request" className="btn btn-primary btn-large" style={{ display: 'inline-flex', textDecoration: 'none', alignItems: 'center', justifyContent: 'center' }}>
              📢 Talk to our team now
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--navy-dark)', color: '#cbd5e1', padding: '48px 0 32px', textAlign: 'center' }}>
        <div className="container">
          <p>© 2026 YourCast – Real-Time Advertising Networks. All rights reserved.</p>
          <p style={{ marginTop: '16px', fontSize: '0.8rem', opacity: 0.7 }}>
            Privacy Policy | Terms of Service | Real-time DOOH Platform
          </p>
        </div>
      </footer>
    </>
  );
}
