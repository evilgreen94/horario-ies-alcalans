const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../js/app/guardias.js'),
  'utf8'
);

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);

  let brace = source.indexOf('{', start);
  let depth = 0;

  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract ${name}`);
}

function buildPolicy(activeGroups = []) {
  const context = {
    cleanText: value => String(value == null ? '' : value).trim(),
    isGroupCurrentlyActive: group => activeGroups.includes(String(group).trim())
  };

  vm.createContext(context);
  vm.runInContext(extract('sessionNeedsAutomaticCoverage'), context);

  return session => context.sessionNeedsAutomaticCoverage(session);
}

module.exports = [
  {
    name: 'automatic coverage is restricted to real active classes with a group',
    fn() {
      const needsCoverage = buildPolicy(['1ESO A', '2ESO D']);

      assert.equal(needsCoverage(null), false);

      assert.equal(needsCoverage({
        tipo: 'guardia',
        grupo: '',
        automaticCoverageRequired: false
      }), false);

      assert.equal(needsCoverage({
        tipo: 'meeting',
        grupo: '1ESO A',
        automaticCoverageRequired: true
      }), false);

      assert.equal(needsCoverage({
        tipo: 'other',
        materia: 'COMPLEMENTARIAS AUTORIZADAS',
        grupo: '',
        automaticCoverageRequired: true
      }), false);

      assert.equal(needsCoverage({
        tipo: 'clase',
        materia: 'COMPLEMENTARIAS AUTORIZADAS',
        grupo: '',
        automaticCoverageRequired: true
      }), false);

      assert.equal(needsCoverage({
        tipo: 'clase',
        materia: 'Física y Química',
        grupo: 'GRUPO INACTIVO',
        automaticCoverageRequired: true
      }), false);

      assert.equal(needsCoverage({
        tipo: 'clase',
        materia: 'Física y Química',
        grupo: '2ESO D',
        automaticCoverageRequired: true
      }), true);
    }
  }
];
