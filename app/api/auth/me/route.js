import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth_token');

    if (!tokenCookie || !tokenCookie.value) {
      return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = jwt.verify(tokenCookie.value, process.env.JWT_SECRET || 'your_custom_jwt_secret_token_123456');
    } catch (err) {
      return NextResponse.json({ authenticated: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    // Fetch user details
    const userRes = await query('SELECT id, name, email, is_admin, created_at FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ authenticated: false, error: 'User not found' }, { status: 401 });
    }
    const user = userRes.rows[0];

    // Fetch active subscription
    const subRes = await query(
      `SELECT plan, status, price_per_day, current_period_start, current_period_end 
       FROM subscriptions 
       WHERE user_id = $1 
       ORDER BY id DESC LIMIT 1`, 
      [user.id]
    );
    let subscription = subRes.rows.length > 0 ? subRes.rows[0] : null;

    // Auto-renew test subscription if expired (2-minute intervals)
    if (subscription && subscription.plan === 'TEST' && subscription.status === 'ACTIVE') {
      const expiryTime = new Date(subscription.current_period_end).getTime();
      const now = new Date();
      if (now.getTime() > expiryTime) {
        const newStart = now;
        const newEnd = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes

        // 1. Mark previous active as EXPIRED
        await query(
          "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
          [user.id]
        );

        // 2. Insert new active subscription
        await query(
          `INSERT INTO subscriptions 
           (user_id, plan, status, price_per_day, current_period_start, current_period_end) 
           VALUES ($1, 'TEST', 'ACTIVE', 720.00, $2, $3)`,
          [user.id, newStart, newEnd]
        );

        // 3. Insert auto-renew payment record of ₹1
        const transactionId = `TEST_RENEW_${Math.random().toString(36).substring(2,11).toUpperCase()}`;
        await query(
          `INSERT INTO payments (user_id, amount, payment_method, status, transaction_id) 
           VALUES ($1, 1.00, 'AUTO_RENEW', 'SUCCESS', $2)`,
          [user.id, transactionId]
        );

        // Re-fetch the updated subscription
        const updatedSubRes = await query(
          `SELECT plan, status, price_per_day, current_period_start, current_period_end 
           FROM subscriptions 
           WHERE user_id = $1 AND status = 'ACTIVE' 
           ORDER BY id DESC LIMIT 1`, 
          [user.id]
        );
        subscription = updatedSubRes.rows.length > 0 ? updatedSubRes.rows[0] : null;
      }
    }

    // Fetch ad boards
    const boardsRes = await query(
      'SELECT id, name, location, content, impressions, status FROM ad_boards WHERE user_id = $1 ORDER BY id ASC',
      [user.id]
    );

    return NextResponse.json({
      authenticated: true,
      user,
      subscription,
      adBoards: boardsRes.rows
    });

  } catch (error) {
    console.error('API /auth/me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
