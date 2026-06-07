import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    // 1. Verify token exists and has not expired
    const userRes = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > CURRENT_TIMESTAMP',
      [token]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Reset token is invalid or has expired' }, { status: 400 });
    }

    const userId = userRes.rows[0].id;

    // 2. Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Update password and nullify token fields
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [passwordHash, userId]
    );

    return NextResponse.json({ message: 'Password has been reset successfully' });

  } catch (error) {
    console.error('Reset password API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
