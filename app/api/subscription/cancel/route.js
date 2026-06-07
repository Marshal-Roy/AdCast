import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

export async function POST() {
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

    // Update active subscription status to CANCELLED
    const result = await query(
      `UPDATE subscriptions 
       SET status = 'CANCELLED' 
       WHERE user_id = $1 AND status = 'ACTIVE' 
       RETURNING id`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'No active subscription found to cancel' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Subscription cancelled successfully' });

  } catch (error) {
    console.error('Subscription cancellation API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
