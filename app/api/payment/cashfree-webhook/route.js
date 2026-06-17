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
      bodyPreview: rawBody.substring(0, 400)
    });

    // 1. Validate signature if key is configured
    if (secretKey && secretKey !== 'your_cashfree_secret_key' && signature && timestamp) {
      const sigPayload = timestamp + rawBody;
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(sigPayload)
        .digest('base64');

      if (expectedSignature !== signature) {
        console.warn('⚠️ Webhook signature verification failed.');
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

    const event = payload.event || payload.type;
    const data = payload.data || payload;

    if (!event) {
      return NextResponse.json({ error: 'Event type not specified' }, { status: 400 });
    }

    // 3. Extract fields — prefer cf_payment_id as the unique charge identifier
    const cfPaymentId = data.payment?.cf_payment_id || data.cf_payment_id;
    const subscriptionId = data.subscription?.subscription_id || data.order?.order_id || data.order_id;
    const amount = parseFloat(
      data.payment?.payment_amount ||
      data.order?.order_amount ||
      data.subscription?.plan_details?.plan_recurring_amount ||
      data.order_amount ||
      0
    );
    const customerId = data.customer_details?.customer_id || data.subscription?.customer_details?.customer_id || data.customer_id;
    const customerEmail = data.customer_details?.customer_email || data.subscription?.customer_details?.customer_email;
    const paymentStatus = data.payment?.payment_status || data.payment_status || data.subscription?.subscription_status || 'SUCCESS';
    // Use actual payment time from Cashfree, not server receive time
    const paymentTime = data.payment?.payment_time ? new Date(data.payment.payment_time) : new Date();

    console.log(`Processing event "${event}":`, { cfPaymentId, subscriptionId, amount, customerId, customerEmail, paymentStatus });

    // ─── PAYMENT SUCCESS HANDLER ─────────────────────────────────────────────
    const isPaymentSuccess =
      event === 'SUBSCRIPTION_PAYMENT_SUCCESS' ||
      event === 'PAYMENT_CHARGES_WEBHOOK' ||
      event === 'ORDER_PAID' ||
      event === 'PAYMENT_SUCCESS_WEBHOOK' ||
      event === 'payment.success' ||
      event === 'subscription.charge.success' ||
      event === 'success payment' ||
      event === 'success payment tdr';

    if (isPaymentSuccess) {
      if (paymentStatus !== 'SUCCESS' && paymentStatus !== 'PAID' && paymentStatus !== 'ACTIVE') {
        return NextResponse.json({ message: `Event ignored: Payment status is "${paymentStatus}", not a success state` });
      }

      // ── IDEMPOTENCY CHECK ──────────────────────────────────────────────────
      // Use cf_payment_id as the unique deduplication key (each actual charge has a unique ID).
      // This prevents duplicate processing when Cashfree fires multiple webhook types
      // (e.g. "success payment" AND "SUBSCRIPTION_PAYMENT_SUCCESS") for the same charge.
      if (cfPaymentId) {
        const transactionId = `CF_PAY_${cfPaymentId}`;
        const existingPayment = await query(
          'SELECT id FROM payments WHERE transaction_id = $1',
          [transactionId]
        );
        if (existingPayment.rows.length > 0) {
          console.log(`⚠️ Payment ${transactionId} already processed — duplicate webhook ignored.`);
          return NextResponse.json({ message: 'Duplicate webhook ignored: payment already processed' });
        }
      }

      // ── RESOLVE USER ────────────────────────────────────────────────────────
      let userId = null;

      if (customerId) {
        userId = parseInt(customerId);
        if (isNaN(userId)) userId = null;
      }

      if (!userId && customerEmail) {
        const emailLookup = await query('SELECT id FROM users WHERE email = $1', [customerEmail.toLowerCase().trim()]);
        if (emailLookup.rows.length > 0) {
          userId = emailLookup.rows[0].id;
          console.log(`🔍 Resolved user by email "${customerEmail}" → userId=${userId}`);
        }
      }

      if (!userId) {
        console.log(`⚠️ Could not resolve user from customer_id="${customerId}" or email="${customerEmail}"`);
        return NextResponse.json({ message: 'Event ignored: Could not identify user from webhook payload' }, { status: 200 });
      }

      const userRes = await query('SELECT id, name FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        return NextResponse.json({ error: 'User not found for webhook payment' }, { status: 404 });
      }

      // ── DETERMINE PLAN FROM AMOUNT ──────────────────────────────────────────
      let plan = 'PRO';
      let pricePerDay = 1500.00;

      if (amount <= 50) {
        plan = 'TEST';
        pricePerDay = 720.00;
      } else if (amount < 30000) {
        plan = 'STARTER';
        pricePerDay = 500.00;
      }

      // ── CALCULATE PERIOD ────────────────────────────────────────────────────
      const periodStart = paymentTime;
      let periodEnd;

      if (plan === 'TEST') {
        periodEnd = new Date(periodStart.getTime() + (24 * 60 * 60 * 1000)); // 1 day
      } else if (plan === 'STARTER') {
        periodEnd = new Date(periodStart.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
      } else {
        // PRO: monthly or yearly based on amount
        const durationDays = amount > 100000 ? 365 : 30;
        periodEnd = new Date(periodStart.getTime() + (durationDays * 24 * 60 * 60 * 1000));
      }

      // ── CHECK IF THIS IS FIRST ACTIVATION OR A RENEWAL ─────────────────────
      const existingSubRes = await query(
        `SELECT id, plan FROM subscriptions WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      const isFirstActivation = existingSubRes.rows.length === 0;

      // Expire existing active subscriptions
      await query(
        "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
        [userId]
      );

      // Insert fresh active subscription record
      await query(
        `INSERT INTO subscriptions (user_id, plan, status, price_per_day, current_period_start, current_period_end) 
         VALUES ($1, $2, 'ACTIVE', $3, $4, $5)`,
        [userId, plan, pricePerDay, periodStart, periodEnd]
      );

      // ── PROVISION AD BOARDS (first activation only) ────────────────────────
      // On renewal, keep existing user-customized boards. Only reset on first-ever activation.
      if (isFirstActivation) {
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
        console.log(`🆕 First activation — ad boards provisioned for user ${userId}`);
      } else {
        console.log(`🔄 Renewal — existing ad boards preserved for user ${userId}`);
      }

      // ── RECORD PAYMENT ────────────────────────────────────────────────────
      // Use cf_payment_id as the unique transaction key. This guarantees one payment
      // record per actual bank charge, even if multiple webhook events fire.
      const transactionId = cfPaymentId ? `CF_PAY_${cfPaymentId}` : `CF_SUB_${subscriptionId}_${Date.now()}`;
      await query(
        `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
         VALUES ($1, $2, 'CASHFREE', 'SUCCESS', $3) 
         ON CONFLICT (transaction_id) DO NOTHING`,
        [userId, amount, transactionId]
      );

      console.log(`✅ Webhook provisioned ${plan} plan for user ${userId} | Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()} | isRenewal=${!isFirstActivation}`);
      return NextResponse.json({ message: 'Webhook processed: subscription provisioned successfully' });
    }

    // ─── SUBSCRIPTION STATUS CHANGED ─────────────────────────────────────────
    if (event === 'SUBSCRIPTION_STATUS_CHANGED') {
      const subStatus = data.subscription?.subscription_status;
      if (subStatus === 'CANCELLED' || subStatus === 'EXPIRED') {
        const cId = customerId || (customerEmail ? await query('SELECT id FROM users WHERE email = $1', [customerEmail]).then(r => r.rows[0]?.id) : null);
        if (cId) {
          await query(
            "UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'ACTIVE'",
            [parseInt(cId)]
          );
          console.log(`✅ Subscription cancelled for user ${cId}`);
        }
      }
      return NextResponse.json({ message: `SUBSCRIPTION_STATUS_CHANGED processed: status=${subStatus}` });
    }

    // ─── SUBSCRIPTION PAYMENT FAILED ─────────────────────────────────────────
    if (event === 'SUBSCRIPTION_PAYMENT_FAILED' || event === 'subscription.payment.failed') {
      console.log(`⚠️ Subscription payment FAILED for subscription: ${subscriptionId}`);
      // Do not expire the subscription on failure — Cashfree retries automatically (1+3 policy)
      return NextResponse.json({ message: 'Subscription payment failure noted. Awaiting Cashfree retry.' });
    }

    // ─── SUBSCRIPTION CANCELLED ───────────────────────────────────────────────
    if (
      event === 'subscription.cancelled' ||
      event === 'subscription.deactivated' ||
      event === 'subscription.cancel'
    ) {
      if (customerId) {
        await query(
          "UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'ACTIVE'",
          [parseInt(customerId)]
        );
        console.log(`✅ Subscription cancelled for user ${customerId}`);
      }
      return NextResponse.json({ message: 'Subscription cancelled' });
    }

    // Default: unhandled event
    console.log(`ℹ️ Unhandled event type: "${event}" — no action taken`);
    return NextResponse.json({ message: `Webhook event "${event}" received but not actionable` });

  } catch (error) {
    console.error('Fatal Webhook API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
