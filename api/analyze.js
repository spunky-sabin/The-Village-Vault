import { Client } from '@vercel/postgres';

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const client = new Client({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    });

    try {
        await client.connect();

        const { clientId, ownedCodes } = await request.json();

        if (!clientId || !Array.isArray(ownedCodes)) {
            return new Response(JSON.stringify({ error: 'Invalid input' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 1. Upsert User (update last_updated)
        await client.query(`
            INSERT INTO users (client_id, last_updated)
            VALUES ($1, NOW())
            ON CONFLICT (client_id) DO UPDATE SET last_updated = NOW()
        `, [clientId]);

        // 2. Update Ownership
        // First, delete existing entries for this user to handle items they might have removed (less likely in CoC, but good for sync)
        // Or, more robustly for "adding" items:
        // Ideally we want a diff, but for simplicity/statelessness, we replace the user's known inventory.
        // However, sending the ENTIRE inventory every time is what the frontend does.

        // Transaction-like approach (though edge functions and HTTP requests are stateless)
        // We'll delete all ownership records for this user and re-insert. 
        // This ensures if they un-owned something (unlikely) it's reflected, 
        // but more importantly avoids "already exists" errors without checking every single one.

        await client.query('DELETE FROM ownership WHERE client_id = $1', [clientId]);

        if (ownedCodes.length > 0) {
            // Bulk insert is tricky with tagged templates in generic generic libraries, 
            // but we can loop or construct a large query. 
            // Current @vercel/postgres safety recommends individual queries or careful construction.
            // Given the potential size (hundreds of items), individual INSERTs are too slow.
            // We'll use a transaction for batch processing if possible, or build a VALUES string carefully (but that risks injection if not careful).
            // Actually, standard SQL with multiple values is: VALUES (uid, c1), (uid, c2)...

            // Let's do it in chunks to be safe.
            const uniqueCodes = [...new Set(ownedCodes)];
            const chunkSize = 50;

            for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
                const chunk = uniqueCodes.slice(i, i + chunkSize);
                // Construct parametrized query dynamically
                // Use a flat array of parameters matching the placeholders
                const values = [];
                const placeholders = [];

                chunk.forEach((code, index) => {
                    const offset = index * 2;
                    placeholders.push(`($${offset + 1}, $${offset + 2})`);
                    values.push(clientId, code);
                });

                const query = `
                    INSERT INTO ownership (client_id, item_code) 
                    VALUES ${placeholders.join(', ')}
                    ON CONFLICT DO NOTHING
                `;

                // executing raw query with array of values
                await client.query(query, values);
            }
        }

        // 3. Calculate Rarity Stats
        // We want the % of users who own each item.
        // Total users count
        const userCountResult = await client.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(userCountResult.rows[0].count) || 1;

        // Item ownership counts
        // We only need counts for items that exist in our database.
        const distinctItemsResult = await client.query(`
            SELECT item_code, COUNT(client_id) as owned_count
            FROM ownership
            GROUP BY item_code
        `);

        const rarityData = {};
        distinctItemsResult.rows.forEach(row => {
            const percentage = (parseInt(row.owned_count) / totalUsers) * 100;
            let label = 'Common';
            if (percentage < 1) label = 'Legendary';
            else if (percentage < 5) label = 'Ultra Rare';
            else if (percentage < 15) label = 'Very Rare';
            else if (percentage < 30) label = 'Rare'; // Changed "Very Rare" to "Rare" to have a spread

            rarityData[row.item_code] = {
                percentage: parseFloat(percentage.toFixed(2)),
                count: parseInt(row.owned_count),
                label
            };
        });

        return new Response(JSON.stringify({
            success: true,
            totalUsers,
            rarityData
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Analysis error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    } finally {
        await client.end();
    }
}
