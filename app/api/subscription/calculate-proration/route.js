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

    if (!targetPlan || !['STARTER', 'PRO', 'TEST'].includes(targetPlan)) {
      return NextResponse.json({ error: 'Invalid target plan selected' }, { status: 400 });
    }

    // 1. Fetch current subscription
    const subRes = await query(
      `SELECT id, plan, price_per_day, current_period_start, current_period_end 
       FROM subscriptions 
       WHERE user_id = $1 AND status = 'ACTIVE' 
       ORDER BY id DESC LIMIT 1`,
      [decoded.id]
    );

    const now = new Date();
    let currentPlan = null;
    let currentPricePerDay = 0;
    let periodEnd = now;
    let remainingDays = 30; // default for new subscriptions
    let currentRemainingValue = 0;
    let targetRemainingValue = 0;
    let netCharge = 0;
    let amountDue = 0;
    let newPeriodEnd = now.toISOString();
    let extensionDays = 0;

    const targetPricePerDay = targetPlan === 'STARTER' ? 500.00 : targetPlan === 'PRO' ? 1500.00 : 720.00;

    if (subRes.rows.length === 0) {
      // New subscription
      if (targetPlan === 'TEST') {
        targetRemainingValue = 1.00;
        netCharge = 1.00;
        amountDue = 1.00;
        const expiry = new Date();
        expiry.setMinutes(now.getMinutes() + 2);
        newPeriodEnd = expiry.toISOString();
      } else {
        targetRemainingValue = 30 * targetPricePerDay;
        netCharge = targetRemainingValue;
        amountDue = netCharge;
        const expiry = new Date();
        expiry.setDate(now.getDate() + 30);
        newPeriodEnd = expiry.toISOString();
      }
    } else {
      const currentSub = subRes.rows[0];
      currentPlan = currentSub.plan;
      currentPricePerDay = parseFloat(currentSub.price_per_day);

      if (currentPlan === targetPlan) {
        return NextResponse.json({ error: 'Already subscribed to this plan' }, { status: 400 });
      }

      periodEnd = new Date(currentSub.current_period_end);
      const remainingTimeMs = periodEnd.getTime() - now.getTime();

      if (currentPlan === 'TEST' || targetPlan === 'TEST') {
        const remainingMins = Math.max(0, remainingTimeMs / (1000 * 60));
        currentRemainingValue = currentPlan === 'TEST' 
          ? (remainingMins / 2.0) * 1.00 
          : (remainingMins / (30 * 24 * 60.0)) * (30 * currentPricePerDay);
        targetRemainingValue = targetPlan === 'TEST'
          ? (remainingMins / 2.0) * 1.00
          : (remainingMins / (30 * 24 * 60.0)) * (30 * targetPricePerDay);
        netCharge = targetRemainingValue - currentRemainingValue;
        remainingDays = remainingMins / (24 * 60.0);
      } else {
        remainingDays = Math.max(0, remainingTimeMs / (1000 * 60 * 60 * 24));
        currentRemainingValue = remainingDays * currentPricePerDay;
        targetRemainingValue = remainingDays * targetPricePerDay;
        netCharge = targetRemainingValue - currentRemainingValue;
      }

      if (netCharge > 0) {
        amountDue = netCharge;
        newPeriodEnd = periodEnd.toISOString();
      } else {
        amountDue = 0;
        const credit = -netCharge;
        if (targetPlan === 'TEST') {
          // extend by minutes
          const extensionMins = (credit / 1.00) * 2;
          const extendedEndDate = new Date(periodEnd.getTime() + (extensionMins * 60 * 1000));
          newPeriodEnd = extendedEndDate.toISOString();
        } else {
          extensionDays = credit / targetPricePerDay;
          const extendedEndDate = new Date(periodEnd.getTime() + (extensionDays * 24 * 60 * 60 * 1000));
          newPeriodEnd = extendedEndDate.toISOString();
        }
      }
    }

    return NextResponse.json({
      currentPlan,
      targetPlan,
      currentPricePerDay,
      targetPricePerDay,
      remainingDays: parseFloat(remainingDays.toFixed(4)),
      currentRemainingValue: parseFloat(currentRemainingValue.toFixed(2)),
      targetRemainingValue: parseFloat(targetRemainingValue.toFixed(2)),
      netCharge: parseFloat(netCharge.toFixed(2)),
      amountDue: parseFloat(amountDue.toFixed(2)),
      extensionDays: parseFloat(extensionDays.toFixed(2)),
      currentPeriodEnd: periodEnd.toISOString(),
      newPeriodEnd
    });

  } catch (error) {
    console.error('Proration calculation API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
