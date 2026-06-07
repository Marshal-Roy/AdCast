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

    const { amount, paymentMethod, targetPlan, cardDetails, upiDetails } = await request.json();

    if (!targetPlan || !['STARTER', 'PRO'].includes(targetPlan)) {
      return NextResponse.json({ error: 'Invalid target plan' }, { status: 400 });
    }

    if (amount === undefined || amount < 0) {
      return NextResponse.json({ error: 'Invalid charge amount' }, { status: 400 });
    }

    // Validate simulated inputs
    if (paymentMethod === 'CARD') {
      if (!cardDetails || !cardDetails.cardNumber || !cardDetails.expiry || !cardDetails.cvv) {
        return NextResponse.json({ error: 'Missing credit/debit card details' }, { status: 400 });
      }
      if (cardDetails.cardNumber.replace(/\s/g, '').length < 15 || cardDetails.cvv.length < 3) {
        return NextResponse.json({ error: 'Invalid card format entered' }, { status: 400 });
      }
    } else if (paymentMethod === 'UPI') {
      if (!upiDetails || !upiDetails.upiId) {
        return NextResponse.json({ error: 'Missing UPI Address' }, { status: 400 });
      }
      if (!upiDetails.upiId.includes('@')) {
        return NextResponse.json({ error: 'Invalid UPI ID format' }, { status: 400 });
      }
    } else if (paymentMethod !== 'CASHFREE') {
      return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 });
    }

    // 1. Retrieve current active subscription
    const subRes = await query(
      `SELECT id, plan, current_period_end 
       FROM subscriptions 
       WHERE user_id = $1 AND status = 'ACTIVE' 
       ORDER BY id DESC LIMIT 1`,
      [decoded.id]
    );

    const transactionId = `TXN_${paymentMethod.substring(0,3)}_${Math.random().toString(36).substring(2,11).toUpperCase()}`;
    const targetPricePerDay = targetPlan === 'STARTER' ? 500.00 : 1500.00;

    let finalExpiry;

    if (subRes.rows.length === 0) {
      // Create new subscription for 30 days
      const now = new Date();
      const expiry = new Date();
      expiry.setDate(now.getDate() + 30);
      finalExpiry = expiry.toISOString();

      await query(
        `INSERT INTO subscriptions 
         (user_id, plan, status, price_per_day, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [decoded.id, targetPlan, 'ACTIVE', targetPricePerDay, now, expiry]
      );

      // Initialize devices (Starter = 1, Pro = 3)
      if (targetPlan === 'STARTER') {
        await query(
          `INSERT INTO ad_boards (user_id, name, location, content, impressions) VALUES 
           ($1, $2, $3, $4, $5)`,
          [decoded.id, 'Downtown LED Screen', 'Mumbai HQ (Main Terminal)', '🔴 LIVE: YourCast Retail Broadcast', 105]
        );
      } else {
        await query(
          `INSERT INTO ad_boards (user_id, name, location, content, impressions) VALUES 
           ($1, $2, $3, $4, $5),
           ($6, $7, $8, $9, $10),
           ($11, $12, $13, $14, $15)`,
          [
            decoded.id, 'Downtown LED Screen #1', 'Mumbai Terminal 1', '🔴 LIVE: YourCast Premium Screen 1', 120,
            decoded.id, 'Highway Billboard #2', 'Bandra Flyover', '⚡ Special Offer: Coffee 50m ahead!', 240,
            decoded.id, 'In-Store Display #3', 'Retail Zone Entrance', '💎 Premium Sponsor Board Active', 78
          ]
        );
      }

    } else {
      // Upgrade from Starter to Pro
      const currentSub = subRes.rows[0];
      finalExpiry = new Date(currentSub.current_period_end).toISOString();

      await query(
        `UPDATE subscriptions 
         SET plan = $1, price_per_day = $2 
         WHERE id = $3`,
        [targetPlan, targetPricePerDay, currentSub.id]
      );

      // Add 2 more screens so they have 3 total
      await query(
        `INSERT INTO ad_boards (user_id, name, location, content, impressions) VALUES 
         ($1, $2, $3, $4, $5),
         ($6, $7, $8, $9, $10)`,
        [
          decoded.id, 'Highway Billboard #2', 'Bandra Flyover', '⚡ Special Offer: Coffee 50m ahead!', 240,
          decoded.id, 'In-Store Display #3', 'Retail Zone Entrance', '💎 Premium Sponsor Board Active', 78
        ]
      );
    }

    // 2. Insert transaction record in payments table
    await query(
      `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [decoded.id, amount, paymentMethod, 'SUCCESS', transactionId]
    );

    return NextResponse.json({
      message: 'Payment processed and subscription upgraded successfully!',
      transaction: {
        id: transactionId,
        amount,
        paymentMethod,
        date: new Date().toISOString()
      },
      subscription: {
        plan: targetPlan,
        price_per_day: targetPricePerDay,
        current_period_end: finalExpiry
      }
    });

  } catch (error) {
    console.error('Payment processing API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
