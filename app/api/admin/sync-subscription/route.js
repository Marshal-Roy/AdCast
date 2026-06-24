import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('auth_token');

  if (!tokenCookie || !tokenCookie.value) {
    throw new Error('Unauthorized');
  }

  let decoded;
  try {
    decoded = jwt.verify(tokenCookie.value, process.env.JWT_SECRET || 'your_custom_jwt_secret_token_123456');
  } catch (err) {
    throw new Error('Unauthorized');
  }

  const userRes = await query('SELECT id, is_admin FROM users WHERE id = $1', [decoded.id]);
  if (userRes.rows.length === 0 || !userRes.rows[0].is_admin) {
    throw new Error('Forbidden');
  }

  return decoded.id;
}

export async function POST(request) {
  try {
    // 1. Auth check
    try {
      await verifyAdmin();
    } catch (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: authErr.message === 'Forbidden' ? 403 : 401 });
    }

    // 2. Parse request body
    const body = await request.json().catch(() => ({}));
    const { subscriptionId, userId } = body;

    if (!subscriptionId || !userId) {
      return NextResponse.json({ error: 'subscriptionId and userId are required' }, { status: 400 });
    }

    // Check if target user exists
    const userRes = await query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }
    const targetUser = userRes.rows[0];

    // 3. Call Cashfree PG Subscription Status API
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const isProduction = process.env.CASHFREE_ENV === 'production';
    const baseUrl = isProduction
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';

    console.log(`[Admin Sync] Syncing subscription ${subscriptionId} for user ${userId} via ${baseUrl}`);

    const cfRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId.trim()}`, {
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
      console.error('[Admin Sync] Cashfree fetch error:', errData);
      return NextResponse.json({ error: 'Could not fetch subscription from Cashfree', details: errData }, { status: 502 });
    }

    const cfSub = await cfRes.json();
    const cfStatus = cfSub.subscription_status;
    const recurringAmount = parseFloat(cfSub.plan_details?.plan_recurring_amount || 0);

    console.log(`[Admin Sync] Cashfree response: status=${cfStatus}, recurringAmount=${recurringAmount}`);

    const isProvisionable = cfStatus === 'ACTIVE' || cfStatus === 'BANK_APPROVAL_PENDING';

    if (!isProvisionable) {
      return NextResponse.json({
        synced: false,
        cashfree_status: cfStatus,
        message: `Cashfree subscription status is "${cfStatus}" — no activation performed.`
      });
    }

    // Determine plan type from recurring amount
    let plan = 'PRO';
    let pricePerDay = 1500.00;
    if (recurringAmount <= 50) {
      plan = 'TEST';
      pricePerDay = 720.00;
    } else if (recurringAmount < 30000) {
      plan = 'STARTER';
      pricePerDay = 500.00;
    }

    // Expire old active records
    await query(
      "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
      [userId]
    );

    // Create a new subscription record anchored from now
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
      [userId, plan, pricePerDay, now, periodEnd, subscriptionId]
    );

    // Insert a payment record into the ledger
    const transactionId = `CF_SYNC_${subscriptionId}_${Date.now()}`;
    await query(
      `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id)
       VALUES ($1, $2, 'CASHFREE', 'SUCCESS', $3)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [userId, recurringAmount, transactionId]
    );

    // Auto-create ad boards if first time activation
    const boardsCount = await query('SELECT count(id) FROM ad_boards WHERE user_id = $1', [userId]);
    const isFirstActivation = parseInt(boardsCount.rows[0].count) === 0;

    if (isFirstActivation) {
      if (plan === 'TEST') {
        await query(
          "INSERT INTO ad_boards (user_id, name, location, content) VALUES ($1, 'Test Screen', 'Sandbox Area', 'Testing digital screen content.')",
          [userId]
        );
      } else if (plan === 'STARTER') {
        await query(
          "INSERT INTO ad_boards (user_id, name, location, content) VALUES ($1, 'Primary Screen', 'Main Lobby', 'Welcome to YourCast! Edit this text from the console.')",
          [userId]
        );
      } else {
        await query(
          `INSERT INTO ad_boards (user_id, name, location, content) VALUES 
           ($1, 'Executive Screen A', 'Conference Hall', 'Welcome to YourCast! Display text can be edited.'),
           ($1, 'Lobby Screen B', 'Entrance Gateway', 'Promotion: Up to 50% discount on summer items!'),
           ($1, 'Retail Screen C', 'Showroom Floor', 'YourCast Digital Board running on Pro Tier.')`,
          [userId]
        );
      }
    }

    console.log(`[Admin Sync] Success: Synced ${plan} subscription for user ${userId}`);

    return NextResponse.json({
      synced: true,
      message: `Subscription successfully synced! User now has active ${plan} plan, and a payment of ₹${recurringAmount} has been written to the ledger.`,
      plan,
      period_end: periodEnd.toISOString()
    });

  } catch (error) {
    console.error('[Admin Sync] Fatal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
