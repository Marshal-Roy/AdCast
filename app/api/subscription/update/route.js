import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = jwt.verify(tokenCookie.value, process.env.JWT_SECRET || 'your_custom_jwt_secret_token_123456');
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { targetPlan } = await request.json();

    if (targetPlan !== 'STARTER') {
      return NextResponse.json({ error: 'Upgrades must go through checkout' }, { status: 400 });
    }

    // 1. Fetch current subscription
    const subRes = await query(
      `SELECT id, plan, price_per_day, current_period_start, current_period_end 
       FROM subscriptions 
       WHERE user_id = $1 AND status = 'ACTIVE' 
       ORDER BY id DESC LIMIT 1`,
      [decoded.id]
    );

    if (subRes.rows.length === 0) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const currentSub = subRes.rows[0];

    if (currentSub.plan === 'STARTER') {
      return NextResponse.json({ error: 'Already on Starter plan' }, { status: 400 });
    }

    // 2. Perform proration arithmetic
    const now = new Date();
    const periodEnd = new Date(currentSub.current_period_end);
    const remainingTimeMs = periodEnd.getTime() - now.getTime();
    const remainingDays = Math.max(0, remainingTimeMs / (1000 * 60 * 60 * 24));

    const currentPricePerDay = parseFloat(currentSub.price_per_day);
    const targetPricePerDay = 500.00; // Starter plan daily rate in INR

    const currentRemainingValue = remainingDays * currentPricePerDay;
    const targetRemainingValue = remainingDays * targetPricePerDay;
    const credit = currentRemainingValue - targetRemainingValue; // Credit to extend subscription

    if (credit < 0) {
      return NextResponse.json({ error: 'Arithmetic mismatch. This appears to be an upgrade.' }, { status: 400 });
    }

    const extensionDays = credit / targetPricePerDay;
    const extendedEndDate = new Date(periodEnd.getTime() + (extensionDays * 24 * 60 * 60 * 1000));

    // 3. Update the subscription in the database
    await query(
      `UPDATE subscriptions 
       SET plan = $1, price_per_day = $2, current_period_end = $3 
       WHERE id = $4`,
      ['STARTER', targetPricePerDay, extendedEndDate, currentSub.id]
    );

    // 4. Log transaction in payments table
    const transactionId = `DWN_${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    await query(
      `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [decoded.id, 0.00, 'CREDIT_ADJUSTMENT', 'SUCCESS', transactionId]
    );

    return NextResponse.json({
      message: 'Subscription downgraded successfully',
      subscription: {
        plan: 'STARTER',
        status: 'ACTIVE',
        price_per_day: targetPricePerDay,
        current_period_end: extendedEndDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Subscription downgrade API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
