import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const headers = request.headers;

    const signature = headers.get('x-webhook-signature');
    const timestamp = headers.get('x-webhook-timestamp');
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    console.log('📥 Received Cashfree Webhook:', {
      signature: signature ? 'Present' : 'Missing',
      timestamp,
      bodyPreview: rawBody.substring(0, 300)
    });

    // 1. Validate signature if key is configured
    if (secretKey && secretKey !== 'your_cashfree_secret_key' && signature && timestamp) {
      const payload = timestamp + rawBody;
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(payload)
        .digest('base64');

      if (expectedSignature !== signature) {
        console.warn('⚠️ Webhook signature verification failed. Expected vs Received mismatch.');
        // In production, reject. In local dev/testing, we can log a warning and proceed
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
        }
      } else {
        console.log('✅ Webhook signature verified successfully.');
      }
    } else {
      console.log('ℹ️ Skipping signature verification: Secret key or signature headers missing.');
    }

    // 2. Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const event = payload.event || (payload.type);
    const data = payload.data || payload;

    if (!event) {
      return NextResponse.json({ error: 'Event type not specified' }, { status: 400 });
    }

    // Extract common fields across different Cashfree versions (Orders & Subscriptions)
    const orderId = data.order?.order_id || data.subscription?.subscription_id || data.order_id || `SUB_${Date.now()}`;
    const amount = parseFloat(
      data.order?.order_amount || 
      data.payment?.payment_amount || 
      data.subscription?.plan_details?.plan_recurring_amount || 
      data.order_amount || 
      0
    );
    const customerId = data.customer_details?.customer_id || data.subscription?.customer_details?.customer_id || data.customer_id;
    const paymentStatus = data.payment?.payment_status || data.payment_status || data.subscription?.subscription_status || 'SUCCESS';
    const cfPaymentId = data.payment?.cf_payment_id || data.cf_payment_id || `PAY_${Date.now()}`;

    console.log(`Processing event "${event}":`, { orderId, amount, customerId, paymentStatus });

    // Handle payment successes (both manual checkout & auto-pay renewals)
    if (
      event === 'ORDER_PAID' || 
      event === 'PAYMENT_SUCCESS_WEBHOOK' || 
      event === 'payment.success' || 
      event === 'subscription.charge.success' ||
      event === 'SUBSCRIPTION_PAYMENT_SUCCESS' ||
      (event === 'SUBSCRIPTION_STATUS_CHANGED' && paymentStatus === 'ACTIVE') ||
      event === 'success payment' ||
      event === 'success payment tdr'
    ) {
      // Allow SUCCESS, PAID (for standard orders) and ACTIVE (for subscription activations)
      if (paymentStatus !== 'SUCCESS' && paymentStatus !== 'PAID' && paymentStatus !== 'ACTIVE') {
        return NextResponse.json({ message: 'Event ignored: Payment/Subscription status is not SUCCESS or ACTIVE' });
      }

      if (!customerId) {
        return NextResponse.json({ error: 'Customer ID missing in payload' }, { status: 400 });
      }

      const userId = parseInt(customerId);
      if (isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid Customer ID' }, { status: 400 });
      }

      // Check if user exists
      const userRes = await query('SELECT id, name FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        return NextResponse.json({ error: 'User associated with webhook payment not found' }, { status: 404 });
      }

      // Determine plan level based on price
      // Starter = 500/day -> 15000/30 days. Pro = 1500/day -> 45000/30 days. Test = 1.00 / 24 hr.
      let plan = 'PRO';
      let pricePerDay = 1500.00;
      let targetScreens = 3;

      if (amount <= 50) { // e.g. 1.00 Rupee Test plan
        plan = 'TEST';
        pricePerDay = 720.00;
        targetScreens = 1;
      } else if (amount < 30000) { // e.g. 15000
        plan = 'STARTER';
        pricePerDay = 500.00;
        targetScreens = 1;
      }

      const periodStart = new Date();
      let periodEnd = new Date(periodStart.getTime() + (30 * 24 * 60 * 60 * 1000)); // Default 30 days

      if (plan === 'TEST') {
        // Daily billing interval (minimum supported by Cashfree recurring)
        periodEnd = new Date(periodStart.getTime() + (24 * 60 * 60 * 1000)); // 1 day
      } else if (plan === 'STARTER') {
        // Monthly billing interval
        periodEnd = new Date(periodStart.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
      } else if (plan === 'PRO') {
        // Pro plan supports Monthly or Yearly depending on transaction amount
        if (amount > 100000) { // Yearly pricing threshold
          periodEnd = new Date(periodStart.getTime() + (365 * 24 * 60 * 60 * 1000)); // 365 days
        } else {
          periodEnd = new Date(periodStart.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
        }
      }

      // Update or create active subscription
      // Set any existing subscriptions to EXPIRED/CANCELLED first
      await query(
        "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
        [userId]
      );

      // Insert new active subscription record
      await query(
        `INSERT INTO subscriptions (user_id, plan, status, price_per_day, current_period_start, current_period_end) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, plan, 'ACTIVE', pricePerDay, periodStart, periodEnd]
      );

      // Provision active screens/ad_boards for the user
      // Delete any current active screens and insert fresh ones
      await query('DELETE FROM ad_boards WHERE user_id = $1', [userId]);

      if (plan === 'STARTER' || plan === 'TEST') {
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

      // Record transaction ledger payment
      const transactionId = `CF_${orderId || cfPaymentId}`;
      await query(
        `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (transaction_id) DO NOTHING`,
        [userId, amount, 'CASHFREE', 'SUCCESS', transactionId]
      );

      console.log(`✅ Webhook successfully provisioned ${plan} plan for user ${userId}`);
      return NextResponse.json({ message: 'Webhook payment processed, subscription provisioned successfully' });
    }

    // Handle subscription cancellations
    if (
      event === 'subscription.cancelled' || 
      event === 'subscription.deactivated' || 
      event === 'subscription.cancel'
    ) {
      if (!customerId) {
        return NextResponse.json({ error: 'Customer ID missing in cancellation payload' }, { status: 400 });
      }

      const userId = parseInt(customerId);
      await query(
        `UPDATE subscriptions 
         SET status = 'CANCELLED' 
         WHERE user_id = $1 AND status = 'ACTIVE'`,
        [userId]
      );

      console.log(`✅ Webhook successfully cancelled subscription for user ${userId}`);
      return NextResponse.json({ message: 'Webhook processed, subscription status set to CANCELLED' });
    }

    // Default return for unhandled event types
    return NextResponse.json({ message: `Webhook event "${event}" received but not actionable` });

  } catch (error) {
    console.error('Fatal Webhook API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
