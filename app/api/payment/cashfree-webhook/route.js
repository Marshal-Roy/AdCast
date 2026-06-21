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

    const rawEvent = payload.event || payload.type;
    if (!rawEvent) {
      return NextResponse.json({ error: 'Event type not specified' }, { status: 400 });
    }

    // Normalize event to uppercase with underscores (e.g. "subscription.cancelled" -> "SUBSCRIPTION_CANCELLED", "success payment" -> "SUCCESS_PAYMENT")
    const event = rawEvent.trim().toUpperCase().replace(/[\s\.\-]+/g, '_');
    const data = payload.data || payload;

    // 3. Extract fields — prefer cf_payment_id as the unique charge identifier
    const cfPaymentId = data.payment?.cf_payment_id || data.cf_payment_id;
    const subscriptionId = 
      data.subscription?.subscription_id || 
      data.subscription_id || 
      payload.subscription_id || 
      data.order?.order_id || 
      data.order_id || 
      (payload.data && (payload.data.subscription_id || payload.data.subscription?.subscription_id));
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

    console.log(`Processing normalized event "${event}" (raw: "${rawEvent}"):`, { cfPaymentId, subscriptionId, amount, customerId, customerEmail, paymentStatus });

    // ─── PAYMENT SUCCESS HANDLER ─────────────────────────────────────────────
    // NOTE: SUBSCRIPTION_STATUS_CHANGED is intentionally excluded here.
    // It is a status-only event with no payment amount and is handled separately below.
    const isPaymentSuccess =
      event === 'SUBSCRIPTION_PAYMENT_SUCCESS' ||
      event === 'PAYMENT_CHARGES_WEBHOOK' ||
      event === 'ORDER_PAID' ||
      event === 'PAYMENT_SUCCESS_WEBHOOK' ||
      event === 'SUCCESS_PAYMENT' ||
      event === 'SUCCESS_PAYMENT_TDR';

    if (isPaymentSuccess) {
      const isValidState = 
        paymentStatus === 'SUCCESS' || 
        paymentStatus === 'PAID' || 
        paymentStatus === 'ACTIVE' || 
        paymentStatus === 'BANK_APPROVAL_PENDING';

      if (!isValidState) {
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

      // ── LOOK UP LAST SUBSCRIPTION (ACTIVE OR EXPIRED) ──────────────────────
      const lastSubRes = await query(
        `SELECT id, status, current_period_start, current_period_end, plan
         FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      const lastSub = lastSubRes.rows.length > 0 ? lastSubRes.rows[0] : null;
      const isFirstActivation = !lastSub;

      // ── ACTIVE-GUARD: skip retried/duplicate webhooks for a cycle already covered ─
      // A webhook is a DUPLICATE (retried delivery of a past event) only if it has
      // NO unique cf_payment_id — meaning Cashfree cannot link it to a distinct charge.
      // Legitimate renewal webhooks always carry a new cf_payment_id (already deduped
      // above by the idempotency check), so we must NOT block them here even if the
      // current period hasn't expired yet (Cashfree charges ~24h before period end).
      if (lastSub && lastSub.status === 'ACTIVE' && !cfPaymentId) {
        const activeEnd = new Date(lastSub.current_period_end).getTime();
        if (Date.now() < activeEnd) {
          console.log(`⚠️ No cf_payment_id — treating as duplicate webhook for user ${userId}. Subscription still active until ${lastSub.current_period_end}.`);
          return NextResponse.json({ message: 'Webhook acknowledged: duplicate event ignored (no cf_payment_id)' });
        }
      }

      // ── CALCULATE PERIOD ────────────────────────────────────────────────────
      // Anchor periodStart from the PREVIOUS period_end when this is a renewal.
      // This prevents stale payment_time from retried webhooks creating an
      // already-expired subscription period.
      const now = new Date();
      let periodStart;

      if (lastSub && new Date(lastSub.current_period_end) > new Date(now.getTime() - 48 * 60 * 60 * 1000)) {
        // Renewal: start from where last period ended (max with now to avoid going backwards)
        periodStart = new Date(Math.max(new Date(lastSub.current_period_end).getTime(), now.getTime()));
        console.log(`🔄 Renewal anchored from previous period_end: ${lastSub.current_period_end}`);
      } else {
        // First activation OR gap > 48h: start from max(payment_time, now)
        periodStart = new Date(Math.max(paymentTime.getTime(), now.getTime()));
        console.log(`🆕 Period anchored from max(paymentTime, now): ${periodStart.toISOString()}`);
      }

      let periodEnd;
      if (plan === 'TEST') {
        periodEnd = new Date(periodStart.getTime() + (24 * 60 * 60 * 1000)); // 1 day
      } else if (plan === 'STARTER') {
        periodEnd = new Date(periodStart.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
      } else {
        const durationDays = amount > 100000 ? 365 : 30;
        periodEnd = new Date(periodStart.getTime() + (durationDays * 24 * 60 * 60 * 1000));
      }

      // Expire any existing active subscription before inserting new one
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
      // We only insert if amount > 0 to avoid recording zero-amount status updates as financial transactions.
      if (amount > 0) {
        const transactionId = cfPaymentId ? `CF_PAY_${cfPaymentId}` : `CF_SUB_${subscriptionId || 'UNKNOWN'}_${Date.now()}`;
        await query(
          `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
           VALUES ($1, $2, 'CASHFREE', 'SUCCESS', $3) 
           ON CONFLICT (transaction_id) DO NOTHING`,
          [userId, amount, transactionId]
        );
      }

      console.log(`✅ Webhook provisioned ${plan} plan for user ${userId} | Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()} | isRenewal=${!isFirstActivation}`);
      return NextResponse.json({ message: 'Webhook processed: subscription provisioned successfully' });
    }

    // ─── SUBSCRIPTION STATUS CHANGED ─────────────────────────────────────────
    // This is a status-only event. It carries NO payment amount.
    // Only act on terminal states (CANCELLED / EXPIRED / HALTED).
    // ACTIVE status here does NOT mean a new payment was collected — ignore it.
    if (event === 'SUBSCRIPTION_STATUS_CHANGED') {
      const subStatus = data.subscription?.subscription_status;
      console.log(`📋 SUBSCRIPTION_STATUS_CHANGED received: status=${subStatus}, subscriptionId=${subscriptionId}`);

      if (subStatus === 'CANCELLED' || subStatus === 'EXPIRED' || subStatus === 'HALTED') {
        let cId = customerId ? parseInt(customerId) : null;
        if (!cId && customerEmail) {
          const lookup = await query('SELECT id FROM users WHERE email = $1', [customerEmail.toLowerCase().trim()]);
          cId = lookup.rows[0]?.id || null;
        }
        if (cId) {
          await query(
            "UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'ACTIVE'",
            [cId]
          );
          console.log(`✅ Subscription marked CANCELLED for user ${cId} due to Cashfree status: ${subStatus}`);
        } else {
          console.log(`⚠️ SUBSCRIPTION_STATUS_CHANGED: could not resolve user from customerId=${customerId} or email=${customerEmail}`);
        }
      } else {
        // e.g. ACTIVE, BANK_APPROVAL_PENDING — not actionable without a payment event
        console.log(`ℹ️ SUBSCRIPTION_STATUS_CHANGED: status "${subStatus}" is not terminal — no DB change made.`);
      }
      return NextResponse.json({ message: `SUBSCRIPTION_STATUS_CHANGED processed: status=${subStatus}` });
    }

    // ─── SUBSCRIPTION PAYMENT FAILED ─────────────────────────────────────────
    if (event === 'SUBSCRIPTION_PAYMENT_FAILED') {
      console.log(`⚠️ Subscription payment FAILED for subscription: ${subscriptionId}`);
      // Do not expire the subscription on failure — Cashfree retries automatically (1+3 policy)
      return NextResponse.json({ message: 'Subscription payment failure noted. Awaiting Cashfree retry.' });
    }

    // ─── SUBSCRIPTION CANCELLED ───────────────────────────────────────────────
    if (
      event === 'SUBSCRIPTION_CANCELLED' ||
      event === 'SUBSCRIPTION_PAYMENT_CANCELLED' ||
      event === 'SUBSCRIPTION_DEACTIVATED' ||
      event === 'SUBSCRIPTION_CANCEL'
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
