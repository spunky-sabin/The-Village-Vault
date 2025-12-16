import { sql } from '@vercel/postgres';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    // Create Users Table with JSONB for owned items
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        client_id VARCHAR(64) PRIMARY KEY,
        owned_items JSONB DEFAULT '[]'::jsonb,
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Drop old normalized table if it exists (Migration)
    await sql`DROP TABLE IF EXISTS ownership`;

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
