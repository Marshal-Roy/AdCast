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

    if (!targetPlan || !['STARTER', 'PRO'].includes(targetPlan)) {
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

    // Call Cashfree API
    const url = isTestingEnv
      ? 'https://sandbox.cashfree.com/pg/orders'
      : 'https://api.cashfree.com/pg/orders';

    const payload = {
      order_id: orderId,
      order_amount: parseFloat(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: user.id.toString(),
        customer_name: user.name || 'YourCast Customer',
        customer_email: user.email,
        customer_phone: '9999999999' // placeholder customer phone required by Cashfree
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cashfree order creation error output:', data);
      throw new Error(data.message || 'Cashfree payment gateway order creation failed');
    }

    return NextResponse.json({
      simulated: false,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      order_amount: data.order_amount,
      order_currency: data.order_currency
    });

  } catch (err) {
    console.error('API /payment/cashfree-order error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
