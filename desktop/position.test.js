const test = require('node:test');
const assert = require('node:assert/strict');

const { toIntegerPoint } = require('./position');

test('rounds valid desktop coordinates', () => {
  assert.deepEqual(toIntegerPoint({ x: 120.4, y: -31.6 }), { x: 120, y: -32 });
});

test('rejects coordinates Electron cannot convert', () => {
  assert.equal(toIntegerPoint({ x: 10, y: undefined }), null);
  assert.equal(toIntegerPoint({ x: Number.NaN, y: 10 }), null);
  assert.equal(toIntegerPoint({ x: 10, y: Number.POSITIVE_INFINITY }), null);
});
