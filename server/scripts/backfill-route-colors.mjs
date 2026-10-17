import 'dotenv/config';
import pg from 'pg';
import { resolveGtfsRouteColors } from '../src/route-colors.js';

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

  const { Pool } = pg;
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    ssl: /localhost|127(?:\.\d+){3}|::1/i.test(DATABASE_URL)
      ? false
      : { rejectUnauthorized: true }
  });

  try {
    const client = await pool.connect();
    let updated = 0;
    let generatedBackgrounds = 0;
    let generatedTextColors = 0;

    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT route_id, short_name, route_color, route_text_color FROM routes ORDER BY route_id'
      );

      for (const row of result.rows) {
        const rawBackground = String(row.route_color ?? '').trim();
        const rawText = String(row.route_text_color ?? '').trim();
        const hasValidBackground = /^#?[0-9a-f]{6}$/i.test(rawBackground);
        const hasValidText = /^#?[0-9a-f]{6}$/i.test(rawText);

        // Leave complete, valid GTFS colors untouched. Only fill missing or malformed fields.
        if (hasValidBackground && hasValidText) continue;

        const colors = resolveGtfsRouteColors({
          routeId: row.route_id,
          shortName: row.short_name,
          routeColor: hasValidBackground ? rawBackground : null,
          routeTextColor: hasValidText ? rawText : null
        });

        const routeColor = hasValidBackground
          ? rawBackground.replace(/^#/, '').toUpperCase()
          : colors.route_color;
        const routeTextColor = hasValidText
          ? rawText.replace(/^#/, '').toUpperCase()
          : colors.route_text_color;

        await client.query(
          'UPDATE routes SET route_color = $2, route_text_color = $3, updated_at = NOW() WHERE route_id = $1',
          [row.route_id, routeColor, routeTextColor]
        );
        updated += 1;
        if (!hasValidBackground) generatedBackgrounds += 1;
        if (!hasValidText) generatedTextColors += 1;
      }

      await client.query('COMMIT');
      console.log(
        'Route-color backfill complete: ' + updated + ' route rows updated; ' +
        generatedBackgrounds + ' background colors generated; ' +
        generatedTextColors + ' text colors generated. Valid complete colors were left untouched.'
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(error => {
  console.error('Route-color backfill failed:', error?.message || error);
  process.exitCode = 1;
});
