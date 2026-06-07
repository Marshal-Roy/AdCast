import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    // Delete the auth_token cookie
    cookieStore.set('auth_token', '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0)
    });

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
