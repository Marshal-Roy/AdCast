const { Client } = require('pg');

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL is not set in environment variables.');
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
    console.log('Connected to DB. Running migration...');

    // Add subscription_id to subscriptions table
    await client.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255);
    `);
    console.log('✅ Added "subscription_id" column to "subscriptions" table.');

    // Let's migrate any existing active/expired TEST subscription records
    // to have a placeholder subscription_id if they don't have one, just to avoid nulls
    // (though new subscriptions will write the actual Cashfree subscription_id).
    
    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
