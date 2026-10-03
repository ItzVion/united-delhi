import 'dotenv/config';
import pg from 'pg';
import { importGtfs } from '../src/lib/gtfsBootstrap.js';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const managedDbHost = String(process.env.DB_HOST || '').trim();
const managedDbPort = Number(process.env.DB_PORT || 0);
const managedDbName = String(process.env.DB_NAME || '').trim();
const managedDbUser = String(process.env.DB_USERNAME || '').trim();
const managedDbPassword = String(process.env.DB_PASSWORD || '');
const hasManagedDatabase = Boolean(
  managedDbHost && Number.isInteger(managedDbPort) && managedDbPort > 0 &&
  managedDbName && managedDbUser && managedDbPassword
);
if (!hasManagedDatabase && !databaseUrl) throw new Error('Wasmer DB_* variables or DATABASE_URL is required');

const databaseHost = hasManagedDatabase ? managedDbHost : databaseUrl;
const isLocalDatabase = /(?:localhost|127(?:\.\d+){3}|::1)/i.test(databaseHost);
const pool = hasManagedDatabase
  ? new Pool({
      host: managedDbHost,
      port: managedDbPort,
      database: managedDbName,
      user: managedDbUser,
      password: managedDbPassword,
      max: 2,
      connectionTimeoutMillis: 5000,
      ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: true } })
    })
  : new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 5000,
      ...(isLocalDatabase ? {} : { ssl: { rejectUnauthorized: false } })
    });

try {
  await importGtfs({ pool });
} finally {
  await pool.end().catch(() => {});
}
