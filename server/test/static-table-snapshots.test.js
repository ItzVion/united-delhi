import test from 'node:test';
import assert from 'node:assert/strict';
import {staticBackupTableNames,snapshotStaticTables} from '../src/static-table-snapshots.js';

test('backup table names are safe and separate for bus and Metro feeds',()=>{
 const bus=staticBackupTableNames('a'.repeat(64),'dtc');
 const metro=staticBackupTableNames('b'.repeat(64),'metro');
 assert.ok([...Object.values(bus),...Object.values(metro)].every(name=>/^[a-z0-9_]+$/.test(name)&&name.length<=63));
 assert.notEqual(bus.routes,metro.metro_routes);
 assert.throws(()=>staticBackupTableNames('bad','dtc'),/full archive SHA-256/);
 assert.throws(()=>staticBackupTableNames('a'.repeat(64),'other'),/Unsupported static backup kind/);
});

test('snapshot copies each table and metadata using the caller transaction',async()=>{
 const statements=[];
 const client={query:async(sql)=>{
  statements.push(sql);
  if(sql.startsWith('SELECT COUNT(*)'))return {rows:[{count:'0'}]};
  return {rows:[]};
 }};
 const names=await snapshotStaticTables(client,'dtc','c'.repeat(64));
 assert.equal(names.length,4);
 assert.equal(statements.filter(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS public.')).length,4);
 assert.equal(statements.filter(sql=>sql.startsWith('INSERT INTO public.')).length,4);
});
