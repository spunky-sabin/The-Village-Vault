import { sql } from '@vercel/postgres';

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

    try {
        const { clientId, ownedCodes } = await request.json();

        if (!clientId || !Array.isArray(ownedCodes)) {
            return new Response(JSON.stringify({ error: 'Invalid input' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 1. Upsert User
        await sql`
      INSERT INTO users (client_id, last_updated)
      VALUES (${clientId}, NOW())
      ON CONFLICT (client_id) DO UPDATE SET last_updated = NOW()
    `;

        // 2. Update Ownership
        // Delete old ownership for this user
        await sql`DELETE FROM ownership WHERE client_id = ${clientId}`;

        // Insert new ownership in chunks to avoid large queries
        const uniqueCodes = [...new Set(ownedCodes)];
        const chunkSize = 50;

        for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
            const chunk = uniqueCodes.slice(i, i + chunkSize);

            // Insert each item individually (sql.join is not available in @vercel/postgres)
            for (const code of chunk) {
                await sql`
                    INSERT INTO ownership (client_id, item_code)
                    VALUES (${clientId}, ${code})
                    ON CONFLICT DO NOTHING
                `;
            }
        }

        // 3. Calculate rarity
        const totalUsersResult = await sql`SELECT COUNT(*) AS count FROM users`;
        const totalUsers = parseInt(totalUsersResult.rows[0].count) || 1;

        const ownershipResult = await sql`
      SELECT item_code, COUNT(client_id) AS owned_count
      FROM ownership
      GROUP BY item_code
    `;

        const rarityData = {};
        ownershipResult.rows.forEach(row => {
            const percentage = (parseInt(row.owned_count) / totalUsers) * 100;
            let label = 'Common';
            if (percentage < 1) label = 'Legendary';
            else if (percentage < 5) label = 'Ultra Rare';
            else if (percentage < 15) label = 'Very Rare';
            else if (percentage < 30) label = 'Rare';

            rarityData[row.item_code] = {
                percentage: parseFloat(percentage.toFixed(2)),
                count: parseInt(row.owned_count),
                label,
            };
        });

        return new Response(
            JSON.stringify({
                success: true,
                totalUsers,
                rarityData,
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (err) {
        console.error('Analysis error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
