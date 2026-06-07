import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 });
    }

    const emailClean = email.toLowerCase().trim();
    const userRes = await query('SELECT id, name FROM users WHERE email = $1', [emailClean]);

    // Safety: we return success message even if email doesn't exist, but we only generate token for existing users
    if (userRes.rows.length === 0) {
      return NextResponse.json({
        message: 'If an account exists with this email, a reset link has been generated.',
        // For testing, we won't return a token since the email doesn't exist
      });
    }

    const user = userRes.rows[0];

    // Generate token and 1-hour expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [token, expiry, user.id]
    );

    // Formulate reset URL
    const origin = request.nextUrl.origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    // Log the link for server testing
    console.log('\n========================================');
    console.log(`🔑 PASSWORD RESET LINK FOR ${emailClean}:`);
    console.log(resetUrl);
    console.log('========================================\n');

    return NextResponse.json({
      message: 'If an account exists with this email, a reset link has been generated.',
      // We return the reset token/link in the JSON response directly for easy sandbox testing!
      debugLink: resetUrl,
      debugToken: token
    });

  } catch (error) {
    console.error('Forgot password API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
