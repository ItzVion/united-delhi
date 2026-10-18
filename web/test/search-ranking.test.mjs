import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSearchResults } from '../src/lib.ts';

test('exact route-number matches rank above partial route-name matches', () => {
  const apiResults = [
    { id: '770ASTLUP2', label: '770ASTLUP2', type: 'route', fromStop: 'Dwarka Sec 22 Depot', toStop: 'Madhu Vihar' },
    { id: '258', label: '258', type: 'route', fromStop: 'Mori Gate Terminal', toStop: 'Chauhan Patti' },
    { id: '772ASTL-A', label: '772ASTL', type: 'route', fromStop: 'Dwarka Sec 22 Depot', toStop: 'Dwarka Sec 8 Metro Station' },
    { id: 'dtc-772-1', label: '772', type: 'route', fromStop: 'IGI Airport Terminal 2', toStop: 'Uttam Nagar Terminal' },
    { id: 'dtc-772-2', label: '772', type: 'route', fromStop: 'Uttam Nagar Terminal', toStop: 'IGI Airport Terminal 2' }
  ];

  const ranked = rankSearchResults(apiResults, '772');
  assert.deepEqual(ranked.slice(0, 2).map(item => item.label), ['772', '772']);
  assert.deepEqual(ranked.slice(2, 3).map(item => item.label), ['772ASTL']);
});

test('search ranking preserves API order among equal-relevance matches', () => {
  const results = [
    { id: '772-1', label: '772', type: 'route' },
    { id: '772-2', label: '772', type: 'route' }
  ];
  assert.deepEqual(rankSearchResults(results, '772').map(item => item.id), ['772-1', '772-2']);
});

test('search ranking is case-insensitive and accent-insensitive for text', () => {
  const results = [
    { id: 'x', label: 'Inderlok Metro', type: 'route', fromStop: 'IGI Airport' },
    { id: 'y', label: 'IND' , type: 'stop' }
  ];
  assert.equal(rankSearchResults(results, 'ind').at(-1).id, 'x');
});
