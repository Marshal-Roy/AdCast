import { NextResponse } from 'next/server';

export async function GET(request) {
  // Extract parameters passed from Cashfree
  const searchParams = request.nextUrl.searchParams;
  const subId = searchParams.get('sub_id');
  const status = searchParams.get('status') || 'success';
  
  // Create an absolute URL for the destination
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${protocol}://${host}`;
  
  // Safely redirect the user to the billing dashboard via a same-site GET request
  // This ensures the browser safely attaches the SameSite=Lax authentication cookie
  return NextResponse.redirect(`${baseUrl}/dashboard/billing?status=${status}&sub_id=${subId}`);
}

export async function POST(request) {
  // Cashfree might use a POST redirect. We handle it exactly the same way.
  const searchParams = request.nextUrl.searchParams;
  const subId = searchParams.get('sub_id');
  const status = searchParams.get('status') || 'success';
  
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${protocol}://${host}`;
  
  // Use a 303 See Other redirect to force the browser to change the method to GET
  return NextResponse.redirect(`${baseUrl}/dashboard/billing?status=${status}&sub_id=${subId}`, { status: 303 });
}
