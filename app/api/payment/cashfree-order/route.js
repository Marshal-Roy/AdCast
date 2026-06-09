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

    // Fetch user details
    const userRes = await query('SELECT id, name, email FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }
    const user = userRes.rows[0];

    const { amount, targetPlan } = await request.json();

    if (!targetPlan || !['STARTER', 'PRO', 'TEST'].includes(targetPlan)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount parameter' }, { status: 400 });
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const isTestingEnv = process.env.CASHFREE_ENV !== 'PRODUCTION';

    const orderId = `CF_ORD_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Check if real keys are supplied
    const hasKeys = appId && appId !== 'your_cashfree_app_id' && secretKey && secretKey !== 'your_cashfree_secret_key';

    if (!hasKeys) {
      // Return a simulated order structure for checkout page
      console.log('🧪 Using Cashfree simulation mode (mock keys detected)');
      return NextResponse.json({
        simulated: true,
        order_id: orderId,
        payment_session_id: `session_mock_${Math.random().toString(36).substring(2, 16)}`,
        order_amount: amount,
        order_currency: 'INR'
      });
    }

    const planId = `PLAN_${targetPlan}_${amount}`;
    
    // 1. Create or ensure the Plan exists
    const planUrl = isTestingEnv
      ? 'https://sandbox.cashfree.com/pg/plans'
      : 'https://api.cashfree.com/pg/plans';
      
    const planPayload = {
      plan_id: planId,
      plan_name: `${targetPlan} Subscription Plan`,
      plan_type: 'PERIODIC',
      plan_currency: 'INR',
      plan_recurring_amount: parseFloat(amount),
      plan_max_amount: parseFloat(amount) * 10,
      plan_max_cycles: 120, // max renewals
      plan_intervals: targetPlan === 'TEST' ? 1 : 1, 
      plan_interval_type: targetPlan === 'TEST' ? 'DAY' : (amount > 100000 ? 'YEAR' : 'MONTH')
    };

    try {
      await fetch(planUrl, {
        method: 'POST',
        headers: {
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': '2025-01-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(planPayload)
      });
      // We ignore the response here because if it returns 409 (Plan already exists), we can safely proceed.
    } catch (err) {
      console.log('Plan creation threw an exception, but proceeding assuming it might exist', err);
    }

    // 2. Create the Subscription
    const subUrl = isTestingEnv
      ? 'https://sandbox.cashfree.com/pg/subscriptions'
      : 'https://api.cashfree.com/pg/subscriptions';

    const subId = `SUB_${user.id}_${Date.now()}`;
    
    // Default expiry 10 years from now for the mandate
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 10);

    const subPayload = {
      subscription_id: subId,
      plan_details: {
        plan_id: planId
      },
      customer_details: {
        customer_id: user.id.toString(),
        customer_name: user.name || 'YourCast Customer',
        customer_email: user.email,
        customer_phone: '9999999999' // placeholder customer phone
      },
      subscription_meta: {
        return_url: `${request.headers.get('origin') || 'http://localhost:3000'}/dashboard/billing?status=success&sub_id=${subId}`
      },
      subscription_expiry_time: expiryDate.toISOString()
    };

    const response = await fetch(subUrl, {
      method: 'POST',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2025-01-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cashfree subscription creation error output:', data);
      throw new Error(data.message || 'Cashfree subscription creation failed');
    }

    return NextResponse.json({
      simulated: false,
      subscription_id: data.subscription_id,
      auth_link: data.auth_link,
      subscription_session_id: data.subscription_session_id,
      order_amount: amount,
      order_currency: 'INR'
    });

  } catch (err) {
    console.error('API /payment/cashfree-order error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
