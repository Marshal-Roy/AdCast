import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/db';

// Update ad board content
export async function PUT(request) {
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

    const { id, content } = await request.json();

    if (!id || content === undefined) {
      return NextResponse.json({ error: 'Board ID and content are required' }, { status: 400 });
    }

    // Verify ownership and update content
    const updateRes = await query(
      `UPDATE ad_boards 
       SET content = $1 
       WHERE id = $2 AND user_id = $3 
       RETURNING *`,
      [content.trim(), id, decoded.id]
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json({ error: 'Ad board not found or access denied' }, { status: 403 });
    }

    return NextResponse.json({
      message: 'Ad board updated successfully',
      adBoard: updateRes.rows[0]
    });

  } catch (error) {
    console.error('API /ad-boards PUT error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}

// Fetch ad boards list
export async function GET() {
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

    const boardsRes = await query(
      'SELECT id, name, location, content, impressions, status FROM ad_boards WHERE user_id = $1 ORDER BY id ASC',
      [decoded.id]
    );

    return NextResponse.json({ adBoards: boardsRes.rows });

  } catch (error) {
    console.error('API /ad-boards GET error:', error);
    return NextResponse.json({ error: 'Internal server error occurred' }, { status: 500 });
  }
}
