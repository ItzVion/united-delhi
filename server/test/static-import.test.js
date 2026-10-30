import test from 'node:test';
import assert from 'node:assert/strict';
import {isStaticImportTokenValid,createStaticImportEnvironment,staticBackupTableNames} from '../src/static-import.js';

test('static upload token validation rejects missing and unequal values',()=>{
 assert.equal(isStaticImportTokenValid('secret','secret'),true);
 assert.equal(isStaticImportTokenValid('secret','secret2'),false);
 assert.equal(isStaticImportTokenValid('secret',''),false);
 assert.equal(isStaticImportTokenValid('','secret'),false);
});

test('bus import environment is scoped to the bus ZIP and never inherits the upload token',()=>{
 const env=createStaticImportEnvironment('dtc','/tmp/buses.zip',{STATIC_IMPORT_TOKEN:'private',DATABASE_URL:'postgres://example',METRO_STATIC_URL:'https://unused'});
 assert.equal(env.DTC_STATIC_FILE,'/tmp/buses.zip');
 assert.equal(env.DTC_STATIC_ALLOW_REPLACEMENT,'true');
 assert.equal(env.DTC_STATIC_URL,'');
 assert.equal(env.METRO_STATIC_URL,'https://unused');
 assert.equal(env.STATIC_IMPORT_TOKEN,undefined);
});

test('Metro import explicitly permits topology-only expired calendars',()=>{
 const env=createStaticImportEnvironment('metro','/tmp/metro.zip',{STATIC_IMPORT_TOKEN:'private'});
 assert.equal(env.METRO_STATIC_FILE,'/tmp/metro.zip');
 assert.equal(env.METRO_STATIC_ALLOW_REPLACEMENT,'true');
 assert.equal(env.METRO_ALLOW_EXPIRED_CALENDAR,'true');
 assert.equal(env.METRO_ALLOW_INVALID_CALENDAR,'false');
 assert.equal(env.STATIC_IMPORT_TOKEN,undefined);
});

test('hash-named backup tables have safe PostgreSQL identifiers',()=>{
 const bus=staticBackupTableNames('a'.repeat(64),'dtc');
 const metro=staticBackupTableNames('b'.repeat(64),'metro');
 assert.ok([...Object.values(bus),...Object.values(metro)].every(name=>/^[a-z0-9_]+$/.test(name)&&name.length<=63));
 assert.throws(()=>staticBackupTableNames('bad','dtc'),/full archive SHA-256/);
});
