'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { useNotification } from '@/lib/NotificationContext';

function CheckoutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useNotification();

  // Params
  const [targetPlan, setTargetPlan] = useState('PRO');
  const [amount, setAmount] = useState(0.00);

  // General state
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState(null); // stores success txn record

  useEffect(() => {
    const plan = searchParams.get('plan');
    const amt = parseFloat(searchParams.get('amount'));

    if (plan) setTargetPlan(plan.toUpperCase());
    if (!isNaN(amt)) setAmount(amt);
  }, [searchParams]);

  // Initiate Cashfree checkout flow
  const handleCashfreePay = async () => {
    setIsProcessing(true);
    try {
      // 1. Call our API route to create a Cashfree Order session
      const orderRes = await fetch('/api/payment/cashfree-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, targetPlan }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error || 'Failed to initialize payment gateway order');
      }

      // If simulated fallback order returned
      if (orderData.simulated) {
        showToast('🧪 Mock Order generated. Initiating checkout simulation...', 'info');
        await handleSimulateInstantPay();
        return;
      }
      
      // Check if Cashfree SDK is ready
      if (typeof window === 'undefined' || !window.Cashfree) {
        throw new Error('Cashfree SDK is still loading or blocked by your browser.');
      }

      // Initialize Cashfree SDK
      const isProduction = false; 
      const cashfree = window.Cashfree({
        mode: isProduction ? 'production' : 'sandbox',
      });

      // We use the subscription_session_id but pass it as paymentSessionId for the JS SDK
      const sessionId = orderData.subscription_session_id || orderData.payment_session_id;

      if (!sessionId) {
        throw new Error('Missing session ID from payment gateway');
      }

      const checkoutOptions = {
        subsSessionId: sessionId,
        redirectTarget: '_modal', // popup modal
      };

      // Ensure the SDK supports subscriptionsCheckout
      if (typeof cashfree.subscriptionsCheckout !== 'function') {
        throw new Error('Cashfree SDK version does not support subscriptions checkout. Please ensure v3 is loaded.');
      }

      cashfree.subscriptionsCheckout(checkoutOptions).then(async (result) => {
        if (result.error) {
          console.error('Cashfree subscription modal error:', result.error);
          showToast(result.error.message || 'Mandate authorization window closed or cancelled', 'error');
          setIsProcessing(false);
          return;
        }

        showToast('Processing your subscription setup...', 'info');
        
        // Best Practice: Proactively sync status immediately upon modal close!
        // Instead of waiting blindly for the webhook which may lag, we query Cashfree directly.
        try {
          if (orderData.subscription_id) {
            await fetch('/api/payment/sync-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription_id: orderData.subscription_id })
            });
          }
        } catch (syncErr) {
          console.warn('Sync attempt failed, relying on webhook', syncErr);
        }

        // Redirect to dashboard billing to check status
        router.push('/dashboard/billing');
      });

    } catch (err) {
      showToast(err.message, 'error');
      setIsProcessing(false);
    }
  };

  // Test simulator to approve transactions immediately without opening Cashfree SDK (great for sandbox/offline)
  const handleSimulateInstantPay = async () => {
    setIsProcessing(true);
    try {
      const mockPayId = `pay_mock_${Math.random().toString(36).substring(2, 12)}`;
      const processRes = await fetch('/api/payment/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod: 'CASHFREE',
          targetPlan,
          upiDetails: { upiId: `${mockPayId}@cf` }
        })
      });

      const processData = await processRes.json();
      if (!processRes.ok) {
        throw new Error(processData.error || 'Simulator payment process failed');
      }

      showToast(`🧪 Sandbox: Payment of ₹${amount.toLocaleString('en-IN')} simulated successfully!`, 'success');
      setReceipt(processData.transaction);
      router.refresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Render receipt page upon success
  if (receipt) {
    return (
      <div style={{ minHeight: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', background: 'linear-gradient(120deg, #ffffff 0%, #eef6ff 100%)' }}>
        <div style={{ background: 'white', maxWidth: '480px', width: '100%', borderRadius: 'var(--radius-lg)', padding: '40px 32px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          
          <div style={{ width: '72px', height: '72px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 24px' }}>
            ✓
          </div>
          
          <h2 style={{ fontSize: '1.6rem', marginBottom: '8px' }}>Payment Successful!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '32px' }}>
            Your account now has access to the <strong>{targetPlan}</strong> plan features.
          </p>

          <div style={{ background: '#f8fafc', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-color-light)', textAlign: 'left', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transaction ID:</span>
              <strong style={{ fontFamily: 'monospace' }}>{receipt.id}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Amount Paid:</span>
              <strong style={{ color: 'var(--primary)' }}>₹{parseFloat(receipt.amount).toLocaleString('en-IN')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Gateway:</span>
              <strong style={{ background: '#0a84ff', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Cashfree</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Processed Date:</span>
              <strong>{new Date(receipt.date).toLocaleDateString()}</strong>
            </div>
          </div>

          <Link href="/dashboard" className="btn btn-primary btn-full">
            Go to Console Dashboard →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(120deg, #ffffff 0%, #f0f7ff 100%)', minHeight: 'calc(100vh - 120px)', padding: '40px 16px' }}>
      <div className="container">
        
        <div style={{ marginBottom: '32px' }}>
          <Link href="/dashboard/billing" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            ← Back to Billing Management
          </Link>
        </div>

        <div className="checkout-container" style={{ gap: '32px', alignItems: 'start' }}>
          {/* Left panel: Payment form */}
          <div className="checkout-card" style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.4rem' }}>Cashfree Checkout</h2>
              <span style={{ fontSize: '0.75rem', background: '#e2f0fd', color: '#0a84ff', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Official API</span>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '32px', lineHeight: 1.6 }}>
              Clicking below will launch the official Cashfree Payments checkout page. You can make payment via UPI QR code scanning, Netbanking, Cards or popular mobile wallets.
            </p>

            <button
              onClick={handleCashfreePay}
              className="btn btn-primary btn-full"
              style={{ padding: '16px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#0a84ff' }}
              disabled={isProcessing}
            >
              {isProcessing ? 'Connecting Cashfree...' : `💳 Pay ₹${amount.toLocaleString('en-IN')} with Cashfree`}
            </button>

            <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-color-light)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>OR MOCK TEST</span>
              <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-color-light)' }} />
            </div>

            <button
              onClick={handleSimulateInstantPay}
              className="btn btn-outline btn-full"
              style={{ border: '1px dashed var(--accent-green)', color: 'var(--accent-green)', padding: '12px' }}
              disabled={isProcessing}
            >
              🧪 SIMULATOR: Click to Approve Payment Directly (Bypass Popup)
            </button>
          </div>

          {/* Right panel: Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Billing Summary</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Target Plan</span>
                  <span style={{ fontWeight: 600 }}>{targetPlan} Level Workspace</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Daily Rate</span>
                  <span>₹{targetPlan === 'STARTER' ? '500.00' : targetPlan === 'PRO' ? '1500.00' : '720.00'} / day</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cycle Length</span>
                  <span>{targetPlan === 'TEST' ? '24 Hours' : '30 Days'} Period</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 8px', fontSize: '1.1rem', fontWeight: 800 }}>
                <span>Amount Due:</span>
                <span style={{ color: '#0a84ff' }}>₹{amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style={{ padding: '0 8px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              🔒 <strong>Secured via Cashfree Payments.</strong> Supports credit cards, netbanking, wallets, and instant UPI. Mapped dynamically to your local database configuration.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading checkout workspace...</p>
      </div>
    }>
      {/* Load Cashfree SDK checkout script */}
      <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="lazyOnload" />
      <CheckoutForm />
    </Suspense>
  );
}
