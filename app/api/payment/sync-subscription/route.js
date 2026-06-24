import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

/**
 * POST /api/payment/sync-subscription
 *
 * Queries Cashfree's API directly to fetch the real-time subscription status
 * for the authenticated user, then corrects the local DB if there is a mismatch.
 *
 * Use this when the app shows "No Active Plan" but Cashfree shows the subscription
 * as Active — i.e., webhooks were missed or created a broken state.
 */
export async function POST(request) {
  try {
    // 1. Authenticate user
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');
    if (!tokenCookie?.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = jwt.verify(tokenCookie.value, process.env.JWT_SECRET || 'your_custom_jwt_secret_token_123456');
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const userRes = await query('SELECT id, name, email FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const user = userRes.rows[0];

    // 2. Parse the subscription_id to look up (passed from client)
    const body = await request.json().catch(() => ({}));
    const { subscription_id } = body;

    if (!subscription_id) {
      return NextResponse.json({ error: 'subscription_id is required' }, { status: 400 });
    }

    // 3. Call Cashfree API to get live subscription data
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const isProduction = process.env.CASHFREE_ENV === 'production';
    const baseUrl = isProduction
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

    const cfRes = await fetch(`${baseUrl}/subscriptions/${subscription_id}`, {
      method: 'GET',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2025-01-01',
        'Content-Type': 'application/json'
      }
    });

    if (!cfRes.ok) {
      const errData = await cfRes.json().catch(() => ({}));
      console.error('Cashfree subscription fetch error:', errData);
      return NextResponse.json({ error: 'Could not fetch subscription from Cashfree', details: errData }, { status: 502 });
    }

    const cfSub = await cfRes.json();
    const cfStatus = cfSub.subscription_status;
    const recurringAmount = parseFloat(cfSub.plan_details?.plan_recurring_amount || 0);

    console.log(`🔍 Cashfree live status for ${subscription_id}: ${cfStatus}, amount: ${recurringAmount}`);

    // 4. Determine plan from recurring amount
    let plan = 'PRO';
    let pricePerDay = 1500.00;
    if (recurringAmount <= 50) {
      plan = 'TEST';
      pricePerDay = 720.00;
    } else if (recurringAmount < 30000) {
      plan = 'STARTER';
      pricePerDay = 500.00;
    }

    // 5. Best Practice for Indian eNACH/UPI Mandates:
    // When using Bank Accounts for subscriptions, NPCI mandates take T+3 days to approve.
    // The status becomes "BANK_APPROVAL_PENDING". Standard practice is to grant PROVISIONAL
    // access immediately upon successful authorization.
    const isProvisionable = cfStatus === 'ACTIVE' || cfStatus === 'BANK_APPROVAL_PENDING';

    if (isProvisionable) {
      const activeSubRes = await query(
        `SELECT id, status, current_period_end FROM subscriptions
         WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
        [user.id]
      );

      if (activeSubRes.rows.length > 0) {
        const activeSub = activeSubRes.rows[0];
        const periodEndMs = new Date(activeSub.current_period_end).getTime();
        if (Date.now() < periodEndMs) {
          return NextResponse.json({
            synced: false,
            message: 'Subscription is already active in database — no sync needed',
            subscription: activeSub
          });
        }
        // Period expired but Cashfree says Active → extend from now
      }

      // Expire any stale active records
      await query(
        "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
        [user.id]
      );

      // Re-create active subscription anchored from now
      const now = new Date();
      let periodEnd;
      if (plan === 'TEST') {
        periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      } else if (plan === 'STARTER') {
        periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else {
        periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      await query(
        `INSERT INTO subscriptions (user_id, plan, status, price_per_day, current_period_start, current_period_end, subscription_id)
         VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6)`,
        [user.id, plan, pricePerDay, now, periodEnd, subscription_id]
      );

      console.log(`✅ Synced: Created active ${plan} subscription for user ${user.id} until ${periodEnd.toISOString()}`);

      return NextResponse.json({
        synced: true,
        message: `Subscription synced from Cashfree. ${plan} plan active until ${periodEnd.toLocaleDateString()}.`,
        plan,
        period_end: periodEnd.toISOString()
      });
    }

    // Cashfree shows non-active state
    return NextResponse.json({
      synced: false,
      cashfree_status: cfStatus,
      message: `Cashfree subscription status is "${cfStatus}" — no re-activation performed`
    });

  } catch (error) {
    console.error('Sync subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
