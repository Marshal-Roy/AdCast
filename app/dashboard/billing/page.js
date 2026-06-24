'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

export default function BillingPage() {
  const [userData, setUserData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Proration Modal States
  const [prorationData, setProrationData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    onConfirm: null,
    isDanger: false
  });

  const router = useRouter();
  const { showToast } = useNotification();

  const loadBillingData = async () => {
    try {
      // Fetch user profile info
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/login');
        return;
      }
      const meData = await meRes.json();
      setUserData(meData);

      // Fetch payment transaction history
      const historyRes = await fetch('/api/payment/history');
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setPayments(historyData.payments || []);
      }
    } catch (err) {
      showToast('Error loading billing records', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, [router]);

  const handlePlanChangeInitiate = async (targetPlan) => {
    setIsCalculating(true);
    try {
      const res = await fetch('/api/subscription/calculate-proration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlan }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate proration');
      }

      setProrationData(data);
      setIsModalOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfirmDowngrade = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlan: 'STARTER' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Downgrade failed');
      }

      showToast('Downgraded to Starter! Billing period extended.', 'success');
      setIsModalOpen(false);
      loadBillingData(); // Reload profile & payments
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSubscription = () => {
    setConfirmModal({
      isOpen: true,
      title: '⚠️ Cancel Subscription Plan',
      message: 'Are you sure you want to cancel your subscription plan? This will immediately disable your connected ad screens and halt all scheduled rotations.',
      confirmText: 'Yes, Cancel Subscription',
      cancelText: 'Keep Active Plan',
      isDanger: true,
      onConfirm: async () => {
        setIsCancelling(true);
        try {
          const res = await fetch('/api/subscription/cancel', {
            method: 'POST',
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to cancel subscription');
          }
          showToast('Subscription cancelled successfully', 'success');
          loadBillingData(); // Reload billing records & status
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setIsCancelling(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleProceedToUpgradeCheckout = () => {
    if (!prorationData) return;
    setIsModalOpen(false);
    // Redirect to checkout with query params
    router.push(`/checkout?plan=pro&amount=${prorationData.amountDue}`);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        showToast('Logged out successfully', 'success');
        window.location.href = '/';
      }
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--primary-light)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s infinite linear', margin: '0 auto 16px' }}></div>
          <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Loading ledger records...</p>
        </div>
      </div>
    );
  }

  const { user, subscription } = userData || {};

  return (
    <div className="dashboard-grid">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div style={{ marginBottom: '40px', padding: '0 8px' }}>
            <Link href="/">
              <h2 style={{ background: 'linear-gradient(135deg, #0b2b5c, #1e4a76)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '1.8rem', fontWeight: 800 }}>YourCast</h2>
            </Link>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>Ad Cast Console</span>
          </div>

          <nav className="sidebar-nav">
            <Link href="/dashboard" className="sidebar-link">
              📺 Screens Control
            </Link>
            <Link href="/dashboard/billing" className="sidebar-link active">
              💳 Plans & Billing
            </Link>
            {user?.is_admin && (
              <Link href="/dashboard/admin" className="sidebar-link">
                🛡️ Super Admin Portal
              </Link>
            )}
          </nav>
        </div>
      </aside>

      {/* Main Console Workspace */}
      <main className="dashboard-content">
        <header className="dash-header">
          <div>
            <h1 style={{ fontSize: '1.8rem', color: 'var(--text-dark)' }}>Plans & Billing</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>
              Manage subscription plans, check proration calculations, and view payment statements.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleLogout} className="btn btn-outline" style={{ border: '1px solid var(--accent-red)', color: 'var(--accent-red)', background: 'transparent', padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              🔒 Logout
            </button>
          </div>
        </header>

        {/* Current Active Plan Status */}
        <section className="dash-card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Current Subscription</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: (subscription?.status === 'ACTIVE' || subscription?.status === 'PENDING_RENEWAL') ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {(subscription?.status === 'ACTIVE' || subscription?.status === 'PENDING_RENEWAL') ? `${subscription?.plan} Plan` : 'No Active Plan'}
                </span>
                <span style={{ 
                  background: subscription?.status === 'PENDING_RENEWAL' 
                    ? '#fef9c3' 
                    : (subscription?.status === 'ACTIVE' ? 'var(--primary-light)' : '#fee2e2'), 
                  color: subscription?.status === 'PENDING_RENEWAL' 
                    ? '#854d0e' 
                    : (subscription?.status === 'ACTIVE' ? 'var(--primary)' : 'var(--accent-red)'), 
                  padding: '2px 10px', 
                  borderRadius: '12px', 
                  fontSize: '0.8rem', 
                  fontWeight: 600 
                }}>
                  {subscription?.status === 'PENDING_RENEWAL' ? 'RENEWAL PROCESSING' : (subscription?.status === 'ACTIVE' ? 'ACTIVE' : 'UNSUBSCRIBED')}
                </span>
              </div>
              {(subscription?.status === 'ACTIVE' || subscription?.status === 'PENDING_RENEWAL') && (
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {subscription?.status === 'PENDING_RENEWAL' ? 'Renewal started at: ' : 'Renews on: '}
                  <strong>{new Date(subscription?.current_period_end).toLocaleDateString(undefined, { dateStyle: 'long' })}</strong>
                </p>
              )}
              {subscription?.status === 'PENDING_RENEWAL' && (
                <div style={{ marginTop: '16px', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontSize: '0.85rem' }}>
                  <span>⚠️</span>
                  <span><strong>Automatic Renewal In-Progress:</strong> Your bank is processing the recurring charge. Your screen displays remain active. Please do not subscribe to another plan.</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {(subscription?.status === 'ACTIVE' || subscription?.status === 'PENDING_RENEWAL') ? (
                <>
                  {subscription?.plan === 'STARTER' ? (
                    <button
                      onClick={() => handlePlanChangeInitiate('PRO')}
                      className="btn btn-primary"
                      disabled={isCalculating || isCancelling || subscription?.status === 'PENDING_RENEWAL'}
                    >
                      {isCalculating ? 'Calculating...' : '🚀 Upgrade to Pro (₹1500/day)'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChangeInitiate('STARTER')}
                      className="btn btn-outline"
                      disabled={isCalculating || isCancelling || subscription?.status === 'PENDING_RENEWAL'}
                    >
                      {isCalculating ? 'Calculating...' : '📉 Downgrade to Starter (₹500/day)'}
                    </button>
                  )}
                  <button
                    onClick={handleCancelSubscription}
                    className="btn btn-outline"
                    style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                    disabled={isCancelling || subscription?.status === 'PENDING_RENEWAL'}
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                </>
              ) : (
                <Link href="/dashboard" className="btn btn-primary">
                  Choose a Plan
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Plan Tiers Info Card */}
        <section className="billing-tiers-grid">
          <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color-light)', borderTop: subscription?.plan === 'STARTER' ? '4px solid var(--primary)' : '1px solid var(--border-color-light)' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Starter Tier</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Best for local cafes or static displays</p>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '16px' }}>₹500.00 <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>/ day</span></div>
            <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
              <li>1 connected LED screen</li>
              <li>1 geographic zone coverage</li>
              <li>Manual ad rotation controls</li>
            </ul>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color-light)', borderTop: subscription?.plan === 'PRO' ? '4px solid var(--primary)' : '1px solid var(--border-color-light)' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Pro Tier</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Best for fleets or dynamic campaigns</p>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '16px' }}>₹1500.00 <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>/ day</span></div>
            <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
              <li>Up to 3 connected LED screens</li>
              <li>Hyper-local targeting (time & location)</li>
              <li>Dynamic real-time dashboard panel</li>
            </ul>
          </div>
        </section>

        {/* Ledger Transaction History */}
        <section className="dash-card">
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Payment Ledger Statement</h2>
          {payments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '20px 0', textAlign: 'center' }}>
              No transaction history available.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Date</th>
                    <th>Payment Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{payment.transaction_id}</td>
                      <td>{new Date(payment.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td>
                        <span style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontWeight: 500 }}>
                          {payment.payment_method}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: payment.amount > 0 ? 'var(--text-dark)' : 'var(--text-muted)' }}>
                        {payment.amount > 0 ? `₹${parseFloat(payment.amount).toLocaleString('en-IN')}` : 'Credit Adj'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: '12px',
                          background: payment.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: payment.status === 'SUCCESS' ? 'var(--accent-green)' : 'var(--accent-red)'
                        }}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Proration Calculation Confirmation Overlay Modal */}
        {isModalOpen && prorationData && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}>
            <div style={{
              background: 'white',
              maxWidth: '520px',
              width: '100%',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              animation: 'modalSlide 0.25s ease-out'
            }}>
              <style>{`
                @keyframes modalSlide {
                  from { transform: translateY(20px); opacity: 0; }
                  to { transform: translateY(0); opacity: 1; }
                }
              `}</style>

              <h3 style={{ fontSize: '1.4rem', marginBottom: '8px', color: 'var(--text-dark)' }}>
                {prorationData.netCharge > 0 ? '🚀 Confirm Plan Upgrade' : '📉 Confirm Plan Downgrade'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
                Review the prorated subscription timeline calculations before completing the change.
              </p>

              {/* TIMELINE MATH CARD */}
              <div className="proration-summary">
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #c2dbfc', paddingBottom: '10px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                  <span>Proration Component</span>
                  <span>Calculation Details</span>
                </div>

                <div className="timeline-math">
                  <div className="timeline-step">
                    <span>Remaining Cycle Duration</span>
                    <strong>{prorationData.remainingDays.toFixed(2)} days</strong>
                  </div>
                  <div className="timeline-step">
                    <span>Current Plan Credit Balance</span>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                      +₹{prorationData.currentRemainingValue.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="timeline-step">
                    <span>New Plan Period Cost</span>
                    <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
                      -₹{prorationData.targetRemainingValue.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {prorationData.netCharge > 0 ? (
                    <div className="timeline-step total">
                      <span>Net Upgrade Charge</span>
                      <span>₹{prorationData.amountDue.toLocaleString('en-IN')} due now</span>
                    </div>
                  ) : (
                    <>
                      <div className="timeline-step">
                        <span>Excess Credit Remaining</span>
                        <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                          +₹{(-prorationData.netCharge).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="timeline-step">
                        <span>Cycle Extension Duration</span>
                        <strong>{prorationData.extensionDays.toFixed(1)} days extended</strong>
                      </div>
                      <div className="timeline-step total">
                        <span>Net Downgrade Charge</span>
                        <span>₹0.00 due</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* DATES ADJUSTMENT */}
              <div style={{ marginTop: '20px', background: '#f8fafc', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>
                  Original Period End: <strong>{new Date(prorationData.currentPeriodEnd).toLocaleDateString()}</strong>
                </p>
                <p style={{ marginTop: '4px', color: 'var(--text-dark)', fontWeight: 600 }}>
                  Adjusted Period End: <strong>{new Date(prorationData.newPeriodEnd).toLocaleDateString()}</strong>
                </p>
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                {prorationData.netCharge > 0 ? (
                  <button
                    onClick={handleProceedToUpgradeCheckout}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Proceed to Payment (₹{prorationData.amountDue.toLocaleString('en-IN')}) →
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmDowngrade}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Confirming...' : 'Downgrade & Extend Period'}
                  </button>
                )}
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-outline"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Confirmation Modal */}
        {confirmModal.isOpen && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}>
            <div style={{
              background: 'white',
              maxWidth: '440px',
              width: '100%',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              animation: 'modalSlide 0.2s ease-out',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '3rem',
                marginBottom: '16px'
              }}>
                {confirmModal.isDanger ? '⚠️' : '❓'}
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-dark)' }}>
                {confirmModal.title}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6 }}>
                {confirmModal.message}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={confirmModal.onConfirm}
                  className="btn"
                  style={{
                    flex: 1,
                    background: confirmModal.isDanger ? 'var(--accent-red)' : 'var(--primary)',
                    color: 'white',
                    padding: '10px 16px',
                    fontWeight: 600
                  }}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '10px 16px' }}
                >
                  {confirmModal.cancelText || 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
