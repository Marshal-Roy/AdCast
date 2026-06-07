import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

// Helper to verify admin status
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

  return decoded.id; // Returns logged-in admin user ID
}

// 1. GET: List all customers, their active subscriptions, and active ad board counts
export async function GET() {
  try {
    await verifyAdmin();

    const usersRes = await query(
      `SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.is_admin, 
        u.created_at, 
        s.plan as subscription_plan, 
        s.status as subscription_status, 
        s.current_period_end,
        COUNT(DISTINCT a.id) as ad_board_count 
       FROM users u 
       LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'ACTIVE' 
       LEFT JOIN ad_boards a ON u.id = a.user_id 
       GROUP BY u.id, s.plan, s.status, s.current_period_end 
       ORDER BY u.id DESC`
    );

    return NextResponse.json({ users: usersRes.rows });
  } catch (err) {
    console.error('Admin GET users error:', err.message);
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

// 2. POST: Cancel user subscription
export async function POST(request) {
  try {
    await verifyAdmin();

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Update the active subscription status to CANCELLED/EXPIRED
    await query(
      `UPDATE subscriptions 
       SET status = 'CANCELLED' 
       WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );

    return NextResponse.json({ message: 'Subscription successfully cancelled' });
  } catch (err) {
    console.error('Admin cancel subscription error:', err.message);
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}

// 3. DELETE: Remove user account completely
export async function DELETE(request) {
  try {
    const adminId = await verifyAdmin();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (parseInt(userId) === parseInt(adminId)) {
      return NextResponse.json({ error: 'You cannot delete your own admin account' }, { status: 400 });
    }

    // Delete user. Cascading foreign keys will automatically delete subscriptions, payments, and ad_boards.
    await query('DELETE FROM users WHERE id = $1', [userId]);

    return NextResponse.json({ message: 'User account and associated screens successfully deleted' });
  } catch (err) {
    console.error('Admin DELETE user error:', err.message);
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}
