import 'dotenv/config';
import pg from 'pg';
import { syncMetroStatic } from '../src/metro-sync.js';

if (String(process.env.METRO_STATIC_ALLOW_REPLACEMENT || '').toLowerCase() !== 'true') {
  console.error('Refusing metro replacement. Set METRO_STATIC_ALLOW_REPLACEMENT=true only after reviewing the source and a current backup.');
  process.exitCode = 2;
} else if (!String(process.env.DATABASE_URL || '').trim()) {
  console.error('DATABASE_URL is required. No database was changed.');
  process.exitCode = 2;
} else {
  const pool = new pg.Pool({
    connectionString: String(process.env.DATABASE_URL).trim(),
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 120000,
    ssl: /localhost|127(?:\.\d+){3}|::1/i.test(String(process.env.DATABASE_URL))
      ? false
      : { rejectUnauthorized: true }
  });
  try {
    const result = await syncMetroStatic(pool, {
      allowReplacement: true,
      allowExpiredCalendar: String(process.env.METRO_ALLOW_EXPIRED_CALENDAR || '').toLowerCase() === 'true',
      allowInvalidCalendar: String(process.env.METRO_ALLOW_INVALID_CALENDAR || '').toLowerCase() === 'true'
    });
    if (!result?.ok || result?.requiresApproval) {
      console.error(result?.reason || 'Metro sync did not complete; no success is claimed.');
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error('Explicit metro sync failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}
