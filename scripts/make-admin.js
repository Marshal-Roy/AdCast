const { Client } = require('pg');

async function makeAdmin() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    await client.connect();
    const res = await client.query(
      "UPDATE users SET is_admin = TRUE WHERE email = 'admin@yourcast.com' RETURNING id, name, email, is_admin"
    );
    if (res.rows.length === 0) {
      console.log('❌ User admin@yourcast.com not found in database.');
    } else {
      console.log('🎉 Successfully promoted user to admin:', res.rows[0]);
    }
  } catch (err) {
    console.error('❌ Failed to update user admin status:', err);
  } finally {
    await client.end();
  }
}

makeAdmin();
