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

    // Real-time expiry check: if subscription period has ended, mark as EXPIRED
    if (subscription && subscription.status === 'ACTIVE') {
      const expiryTime = new Date(subscription.current_period_end).getTime();
      const now = new Date().getTime();
      if (now > expiryTime) {
        await query(
          "UPDATE subscriptions SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ACTIVE'",
          [user.id]
        );
        subscription.status = 'EXPIRED';
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
