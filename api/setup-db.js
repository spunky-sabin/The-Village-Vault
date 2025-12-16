import { Client } from '@vercel/postgres';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const client = new Client({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    // Create Users Table
    await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                client_id UUID PRIMARY KEY,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

    // Create Ownership Table
    await client.query(`
            CREATE TABLE IF NOT EXISTS ownership (
                client_id UUID REFERENCES users(client_id) ON DELETE CASCADE,
                item_code VARCHAR(255) NOT NULL,
                PRIMARY KEY (client_id, item_code)
            )
        `);

    // Create Index for faster stats
    await client.query(`
            CREATE INDEX IF NOT EXISTS idx_ownership_item_code ON ownership(item_code)
        `);

    return new Response(JSON.stringify({ message: 'Database tables created successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await client.end();
  }
}
