import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sha256Hex, sourceWithSha256, sourceHasSha256, currentGtfsDate, inspectGtfsServiceCoverage
} from '../src/gtfs-feed-utils.js';

test('archive SHA-256 is stable and source metadata records exact content', () => {
  const hash = sha256Hex(Buffer.from('same archive bytes'));
  assert.match(hash, /^[a-f0-9]{64}$/);
  const source = sourceWithSha256('local-file:/data/gtfs.zip', hash);
  assert.equal(sourceHasSha256(source, hash), true);
  assert.equal(sourceHasSha256(source, sha256Hex(Buffer.from('different bytes'))), false);
  assert.equal(sourceWithSha256(source, hash), source);
});

test('current GTFS service date is formatted in an explicit time zone', () => {
  assert.equal(currentGtfsDate('Asia/Kolkata', new Date('2026-10-15T20:00:00Z')), '20261016');
});

test('calendar weekday flags and calendar_dates exceptions determine service today', () => {
  const calendarRows = [{
    service_id: 'weekday', start_date: '20261001', end_date: '20261031',
    monday:'1', tuesday:'1', wednesday:'1', thursday:'1', friday:'1', saturday:'0', sunday:'0'
  }];
  assert.equal(inspectGtfsServiceCoverage({calendarRows,today:'20261016'}).hasServiceToday, true);
  const removed = [{service_id:'weekday', date:'20261016', exception_type:'2'}];
  assert.equal(inspectGtfsServiceCoverage({calendarRows,calendarDateRows:removed,today:'20261016'}).hasServiceToday, false);
  const added = [{service_id:'sunday-only', date:'20261016', exception_type:'1'}];
  assert.equal(inspectGtfsServiceCoverage({calendarRows:[],calendarDateRows:added,today:'20261016'}).hasServiceToday, true);
});

test('expired calendars are reported, not silently interpreted as current schedules', () => {
  const result = inspectGtfsServiceCoverage({
    calendarRows:[{
      service_id:'old', start_date:'20230101', end_date:'20251231',
      monday:'1', tuesday:'1', wednesday:'1', thursday:'1', friday:'1', saturday:'1', sunday:'1'
    }],
    today:'20261016'
  });
  assert.equal(result.status,'expired');
  assert.equal(result.hasServiceToday,false);
  assert.equal(result.calendarEndDate,'20251231');
});

test('invalid and inverted calendar rows are reported and excluded', () => {
  const result = inspectGtfsServiceCoverage({
    calendarRows:[
      {service_id:'bad-date', start_date:'20260230', end_date:'20261231', monday:'1'},
      {service_id:'inverted', start_date:'20261231', end_date:'20260101', monday:'1'}
    ],
    calendarDateRows:[{service_id:'bad-exception',date:'20261399',exception_type:'1'}],
    today:'20261016'
  });
  assert.equal(result.status,'unknown');
  assert.equal(result.invalidBaseRows,2);
  assert.equal(result.invalidExceptionRows,1);
});
