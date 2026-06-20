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
    // 1. Verify caller is admin
    await verifyAdmin();

    // 2. Parse request body
    const body = await request.json().catch(() => ({}));
    const { subscriptionId, amount } = body;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Subscription ID is required' }, { status: 400 });
    }

    const chargeAmount = parseFloat(amount || '500');

    // 3. Prepare Cashfree details
    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const isProduction = process.env.CASHFREE_ENV === 'production';

    if (!appId || !secretKey) {
      return NextResponse.json({ error: 'Cashfree API credentials are not set on the server' }, { status: 500 });
    }

    const host = isProduction ? 'api.cashfree.com' : 'sandbox.cashfree.com';
    const chargeId = `CHG_${Date.now()}`;

    // Calculate future date (25 hours from now) in Indian Standard Time (IST, UTC+05:30).
    // UPI Autopay / NPCI guidelines require scheduling at least 24 hours in advance to allow for pre-debit notifications.
    const localNow = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5:30
    const futureIst = new Date(localNow.getTime() + istOffset + 25 * 60 * 60 * 1000); // 25 hours in the future

    const pad = (n) => n.toString().padStart(2, '0');
    const year = futureIst.getUTCFullYear();
    const month = pad(futureIst.getUTCMonth() + 1);
    const date = pad(futureIst.getUTCDate());
    const hours = pad(futureIst.getUTCHours());
    const minutes = pad(futureIst.getUTCMinutes());
    const seconds = pad(futureIst.getUTCSeconds());

    const paymentScheduleDate = `${year}-${month}-${date}T${hours}:${minutes}:${seconds}+05:30`;

    const payload = {
      subscription_id: subscriptionId,
      payment_id: chargeId,
      payment_amount: chargeAmount,
      payment_type: 'CHARGE',
      payment_schedule_date: paymentScheduleDate,
      payment_remarks: 'Simulated renewal charge from Admin Dashboard'
    };

    console.log(`🔌 Admin API contacting Cashfree (${host}) to charge:`);
    console.log(JSON.stringify(payload, null, 2));

    const cfRes = await fetch(`https://${host}/pg/subscriptions/pay`, {
      method: 'POST',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2025-01-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const cfData = await cfRes.json().catch(() => ({}));

    if (!cfRes.ok) {
      console.error('Cashfree charge endpoint failed:', cfData);
      return NextResponse.json({
        error: cfData.message || 'Cashfree charge request rejected',
        details: cfData
      }, { status: cfRes.status });
    }

    console.log(`✅ Cashfree charge accepted:`, cfData);
    return NextResponse.json({
      success: true,
      message: 'Charge successfully initiated via Cashfree API!',
      details: cfData
    });

  } catch (err) {
    console.error('Admin charge handler error:', err.message);
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}
