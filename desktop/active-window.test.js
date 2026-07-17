const test = require('node:test');
const assert = require('node:assert/strict');

const { parseWindowsResult } = require('./active-window');

test('normalizes a Windows foreground window with bounds', () => {
  const result = parseWindowsResult(JSON.stringify({
    name: 'Code',
    title: 'main.js - Visual Studio Code',
    x: 120,
    y: 80,
    width: 1440,
    height: 900
  }));

  assert.deepEqual(result, {
    name: 'Code',
    title: 'main.js - Visual Studio Code',
    x: 120,
    y: 80,
    width: 1440,
    height: 900,
    hasBounds: true
  });
});

test('keeps the process name when Windows cannot return usable bounds', () => {
  const result = parseWindowsResult('{"name":"SearchHost","x":0,"y":0,"width":0,"height":0}');

  assert.deepEqual(result, {
    name: 'SearchHost',
    title: '',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    hasBounds: false
  });
});

test('returns null for empty or invalid Windows output', () => {
  assert.equal(parseWindowsResult(''), null);
  assert.equal(parseWindowsResult('not json'), null);
  assert.equal(parseWindowsResult('{"x":1}'), null);
});
