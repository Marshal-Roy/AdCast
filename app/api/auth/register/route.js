import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // 1. Check if user already exists
    const userCheck = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (userCheck.rows.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert user into DB
    const insertUserRes = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name.trim(), email.toLowerCase().trim(), passwordHash]
    );
    const newUser = insertUserRes.rows[0];

    // No subscription or devices assigned automatically on sign up.
    // The user will choose their plan and get screens initialized upon checkout.

    // 6. Sign JWT token
    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email },
      process.env.JWT_SECRET || 'your_custom_jwt_secret_token_123456',
      { expiresIn: '7d' }
    );

    // 7. Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: false, // Set to false to allow local testing over HTTP without SSL issues
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return NextResponse.json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      }
    });

  } catch (error) {
    console.error('Registration API error:', error);
    return NextResponse.json(
      { error: 'Internal server error occurred' },
      { status: 500 }
    );
  }
}
