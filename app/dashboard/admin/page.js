'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNotification } from '@/lib/NotificationContext';

export default function AdminDashboardPage() {
  const [adminUser, setAdminUser] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);

  // Cashfree Charge Simulator States
  const [simSubId, setSimSubId] = useState('');
  const [simAmount, setSimAmount] = useState('500');
  const [isSimulating, setIsSimulating] = useState(false);

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

  // Load admin session and customers list
  useEffect(() => {
    async function initAdminDashboard() {
      try {
        // 1. Verify user is logged in & is an admin
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          showToast('Session expired. Please log in.', 'error');
          router.push('/login');
          return;
        }
        const meData = await meRes.json();
        if (!meData.user?.is_admin) {
          showToast('Access denied: Requires super admin authorization.', 'error');
          router.push('/dashboard');
          return;
        }
        setAdminUser(meData.user);

        // 2. Fetch customer registry
        await fetchCustomers();
      } catch (err) {
        showToast('Error initializing dashboard workspace', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    initAdminDashboard();
  }, [router, showToast]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        throw new Error('Failed to retrieve user directory');
      }
      const data = await res.json();
      setCustomers(data.users || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  const handleSimulateCharge = async (e) => {
    e.preventDefault();
    if (!simSubId.trim()) {
      showToast('❌ Subscription ID is required', 'error');
      return;
    }
    setIsSimulating(true);
    try {
      const res = await fetch('/api/admin/charge-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: simSubId.trim(),
          amount: parseFloat(simAmount || '500')
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to simulate subscription charge');
      }
      showToast('⚡ Charge successfully triggered on Cashfree! Webhook will update shortly.', 'success');
      setSimSubId('');
    } catch (err) {
      showToast(`❌ Simulation failed: ${err.message}`, 'error');
    } finally {
      setIsSimulating(false);
    }
  };

  // Cancel customer plan
  const handleCancelPlan = (userId, userName) => {
    setConfirmModal({
      isOpen: true,
      title: '⚠️ Cancel Plan Confirmation',
      message: `Are you sure you want to cancel the subscription plan for ${userName}? This will immediately disable their screen displays.`,
      confirmText: 'Yes, Cancel Plan',
      cancelText: 'Keep Active Plan',
      isDanger: true,
      onConfirm: async () => {
        setIsActioning(true);
        try {
          const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to cancel subscription');
          }

          showToast(`Subscription plan cancelled for ${userName}`, 'success');
          await fetchCustomers(); // reload table
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setIsActioning(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Delete customer account
  const handleDeleteUser = (userId, userName) => {
    setConfirmModal({
      isOpen: true,
      title: '🛑 PERMANENT ACCOUNT DELETION',
      message: `Are you absolutely sure you want to permanently delete user "${userName}"? This will erase their login credentials, subscriptions, ledger files, and screen databases. This action cannot be undone.`,
      confirmText: 'Yes, Permanently Delete',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setIsActioning(true);
        try {
          const res = await fetch(`/api/admin/users?userId=${userId}`, {
            method: 'DELETE',
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to delete user account');
          }

          showToast(`Account deleted successfully for ${userName}`, 'success');
          await fetchCustomers(); // reload table
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setIsActioning(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Filter customers by search input
  const filteredCustomers = customers.filter((customer) => {
    const name = customer.name?.toLowerCase() || '';
    const email = customer.email?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--primary-light)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s infinite linear', margin: '0 auto 16px' }}></div>
          <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Connecting secure admin interface...</p>
          <style jsx global>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div style={{ marginBottom: '40px', padding: '0 8px' }}>
            <Link href="/dashboard">
              <h2 style={{ background: 'linear-gradient(135deg, #0b2b5c, #1e4a76)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '1.8rem', fontWeight: 800 }}>YourCast</h2>
            </Link>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>Ad Cast Admin</span>
          </div>

          <nav className="sidebar-nav">
            <Link href="/dashboard" className="sidebar-link">
              📺 Screens Control
            </Link>
            <Link href="/dashboard/billing" className="sidebar-link">
              💳 Plans & Billing
            </Link>
            <Link href="/dashboard/admin" className="sidebar-link active">
              🛡️ Super Admin Portal
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main Console Workspace */}
      <main className="dashboard-content">
        <header className="dash-header">
          <div>
            <h1 style={{ fontSize: '1.8rem', color: 'var(--text-dark)' }}>Super Admin Workspace</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>
              Logged in as superuser: <strong>{adminUser?.name}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eef4ff', padding: '8px 16px', borderRadius: '30px', border: '1px solid #cce0ff' }}>
              <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>Authorized Session</span>
            </div>
            <button onClick={handleLogout} className="btn btn-outline" style={{ border: '1px solid var(--accent-red)', color: 'var(--accent-red)', background: 'transparent', padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              🔒 Logout
            </button>
          </div>
        </header>

        {/* Info Grid */}
        <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          <div className="stat-item" style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color-light)', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Registered Users</p>
            <div className="stat-value">{customers.length}</div>
          </div>
          <div className="stat-item" style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color-light)', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Subscriptions</p>
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
              {customers.filter(c => c.subscription_plan && c.subscription_status === 'ACTIVE').length}
            </div>
          </div>
          <div className="stat-item" style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color-light)', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Active Screens</p>
            <div className="stat-value" style={{ color: 'var(--navy-dark)' }}>
              {customers.reduce((sum, c) => sum + parseInt(c.ad_board_count || 0), 0)}
            </div>
          </div>
        </section>

        {/* Cashfree Subscription Charge Simulator */}
        <div className="dash-card" style={{ marginBottom: '32px', background: 'linear-gradient(135deg, #0b2b5c, #163e70)', color: 'white', border: 'none' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚡ Cashfree Sandbox Subscription Charge Simulator
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '24px' }}>
            Simulate a renewal charge directly via Cashfree's Sandbox PG. This will trigger a test transaction payment event, extend the user's active billing cycle, and update the ledger.
          </p>

          <form onSubmit={handleSimulateCharge} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '240px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Subscription ID</label>
              <input
                type="text"
                placeholder="e.g. SUB_12_1781937404933"
                value={simSubId}
                onChange={(e) => setSimSubId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #3b82f6', background: 'rgba(255,255,255,0.08)', color: 'white', outline: 'none' }}
              />
            </div>
            
            <div style={{ width: '120px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Amount (₹)</label>
              <input
                type="number"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #3b82f6', background: 'rgba(255,255,255,0.08)', color: 'white', outline: 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSimulating}
              className="btn btn-primary"
              style={{ background: '#3b82f6', padding: '11px 24px', border: 'none', fontWeight: 600, color: 'white' }}
            >
              {isSimulating ? 'Processing...' : 'Trigger Charge'}
            </button>
          </form>
        </div>

        {/* Customer Registry Management */}
        <div className="dash-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Customer Registry</h3>
            
            {/* Search filter input */}
            <input
              type="text"
              placeholder="🔍 Search users by name or email..."
              className="form-control"
              style={{ maxWidth: '320px', background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No registered customers found matching your search.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email Address</th>
                    <th>Plan Status</th>
                    <th>Registered Date</th>
                    <th>Devices</th>
                    <th style={{ textAlign: 'right' }}>Management Options</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const hasActiveSub = customer.subscription_plan && customer.subscription_status === 'ACTIVE';
                    const isSelf = customer.id === adminUser.id;

                    return (
                      <tr key={customer.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {customer.name} {customer.is_admin && <span style={{ fontSize: '0.65rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>ADMIN</span>}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {customer.id}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.9rem' }}>{customer.email}</span>
                        </td>
                        <td>
                          {hasActiveSub ? (
                            <div>
                              <span style={{ fontSize: '0.8rem', background: '#d1fae5', color: '#065f46', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                                {customer.subscription_plan}
                              </span>
                              {customer.current_period_end && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  Expires: {customer.subscription_plan === 'TEST' 
                                    ? new Date(customer.current_period_end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                                    : new Date(customer.current_period_end).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', background: '#f3f4f6', color: '#374151', padding: '4px 10px', borderRadius: '12px' }}>
                              No Active Plan
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem' }}>{new Date(customer.created_at).toLocaleDateString()}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{customer.ad_board_count} screens</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {hasActiveSub && (
                              <button
                                onClick={() => handleCancelPlan(customer.id, customer.name)}
                                className="btn btn-outline"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: '#d97706', color: '#d97706' }}
                                disabled={isActioning}
                              >
                                Cancel Plan
                              </button>
                            )}
                            
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(customer.id, customer.name)}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--accent-red)' }}
                                disabled={isActioning}
                              >
                                Delete User
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
