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

        // 1. Update User Data (Single Row)
        // Store the entire array of owned codes as a JSONB column
        // This replaces the old "ownership" table logic
        const uniqueCodes = [...new Set(ownedCodes)];
        const jsonPayload = JSON.stringify(uniqueCodes);

        await sql`
            INSERT INTO users (client_id, owned_items, last_updated)
            VALUES (${clientId}, ${jsonPayload}::jsonb, NOW())
            ON CONFLICT (client_id) 
            DO UPDATE SET 
                owned_items = ${jsonPayload}::jsonb,
                last_updated = NOW()
        `;

        // 2. Calculate Rarity Stats
        // "Explode" the JSON arrays from all users to count global item ownership
        const totalUsersResult = await sql`SELECT COUNT(*) AS count FROM users`;
        const totalUsers = parseInt(totalUsersResult.rows[0].count) || 1;

        const ownershipResult = await sql`
            SELECT item_code, COUNT(*) as owned_count
            FROM users, jsonb_array_elements_text(owned_items) as item_code
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
