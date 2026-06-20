const { Client } = require('pg');

// Usage: node --env-file=.env scripts/promote-user.js <email>

const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Please specify the email address to promote.');
  console.log('Usage: node --env-file=.env scripts/promote-user.js <email>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is not set in your environment variables.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
    ? { rejectUnauthorized: false }
    : false
});

async function run() {
  console.log(`🔌 Connecting to database...`);
  try {
    await client.connect();
    
    // Check if user exists
    const checkRes = await client.query('SELECT id, name, email, is_admin FROM users WHERE email = $1', [email]);
    if (checkRes.rows.length === 0) {
      console.log(`❌ User "${email}" was not found. Please register this email first via the website sign-up page.`);
      process.exit(1);
    }
    
    // Promote user
    const updateRes = await client.query(
      'UPDATE users SET is_admin = TRUE WHERE email = $1 RETURNING id, name, email, is_admin',
      [email]
    );
    
    console.log('🎉 Success! User successfully promoted to Super Admin:');
    console.log(JSON.stringify(updateRes.rows[0], null, 2));
  } catch (err) {
    console.error('❌ Error promoting user:', err.message);
  } finally {
    await client.end();
  }
}

run();
