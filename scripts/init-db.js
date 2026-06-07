const { Client } = require('pg');

async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not set in environment variables.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    await client.connect();
    console.log('Connected successfully. Creating tables if they do not exist...');

    // 1. Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        reset_token VARCHAR(255),
        reset_token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Run migration just in case the table already exists without the is_admin column
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    console.log('✅ "users" table verified (with is_admin support).');

    // 2. Create Subscriptions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        price_per_day DECIMAL(10,2) NOT NULL,
        current_period_start TIMESTAMP NOT NULL,
        current_period_end TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ "subscriptions" table verified.');

    // 3. Create Payments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ "payments" table verified.');

    // 4. Create Ad Boards Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ad_boards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        impressions INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ "ad_boards" table verified.');

    console.log('🎉 Database initialization complete!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDb();
