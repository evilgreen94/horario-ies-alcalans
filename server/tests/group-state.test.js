const assert = require('node:assert/strict');

const { normalizeGroupKey } = require('../group-state');

module.exports = [
  {
    name: 'normalizeGroupKey preserves equivalent course labels across trivial formatting changes',
    fn() {
      assert.equal(normalizeGroupKey('2 BACH'), normalizeGroupKey('2º BACH'));
      assert.equal(normalizeGroupKey('2 BACH'), normalizeGroupKey('2BACH'));
      assert.equal(normalizeGroupKey('1 CFB INF'), normalizeGroupKey('1CFB INF'));
    }
  }
];
