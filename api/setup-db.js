import { sql } from '@vercel/postgres';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    // Drop existing tables to recreate with correct types
    // (Only needed first time after schema change)
    await sql`DROP TABLE IF EXISTS ownership`;
    await sql`DROP TABLE IF EXISTS users`;

    // Create Users Table with VARCHAR for flexible client IDs
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        client_id VARCHAR(64) PRIMARY KEY,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create Ownership Table
    await sql`
      CREATE TABLE IF NOT EXISTS ownership (
        client_id VARCHAR(64) REFERENCES users(client_id) ON DELETE CASCADE,
        item_code VARCHAR(255) NOT NULL,
        PRIMARY KEY (client_id, item_code)
      )
    `;

    // Create Index for faster stats
    await sql`
      CREATE INDEX IF NOT EXISTS idx_ownership_item_code ON ownership(item_code)
    `;

    return new Response(JSON.stringify({ message: 'Database tables created successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Setup DB error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
