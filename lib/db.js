import { Pool } from 'pg';

let pool;

if (!global.pgPool) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('⚠️ WARNING: DATABASE_URL environment variable is not defined.');
  }
  global.pgPool = new Pool({
    connectionString: connectionString,
    // Add SSL support for production databases (e.g. Supabase, Neon) but disable rejectUnauthorized for ease of use
    ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false
  });
}
pool = global.pgPool;

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Log query metadata for debugging
    console.log('Executed query:', { text: text.substring(0, 100), duration: `${duration}ms`, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}

export default pool;
