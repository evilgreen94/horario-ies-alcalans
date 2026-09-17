const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../js/app/guardias.js'),
  'utf8'
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);

  const brace = source.indexOf('{', start);
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

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing section start: ${startMarker}`);
  assert.ok(end > start, `Missing section end: ${endMarker}`);
  return source.slice(start, end);
}

module.exports = [
  {
    name: 'effective support posts degrade biblioteca then banos without mutating the weekly preference',
    fn() {
      const context = {
        sameNormalizedText: (a, b) =>
          String(a || '').trim().toLowerCase() ===
          String(b || '').trim().toLowerCase()
      };

      vm.createContext(context);
      vm.runInContext(
        extractFunction('allocateEffectiveSpecialAssignments'),
        context
      );

      const allocate = context.allocateEffectiveSpecialAssignments;

      assert.deepEqual(
        JSON.parse(JSON.stringify(
          allocate(['Ana', 'Pedro'], 'Ana', 'Pedro')
        )),
        { biblioteca: 'Ana', banos: 'Pedro' }
      );

      assert.deepEqual(
        JSON.parse(JSON.stringify(
          allocate(['Pedro'], 'Ana', 'Pedro')
        )),
        { biblioteca: 'Pedro', banos: '' }
      );

      assert.deepEqual(
        JSON.parse(JSON.stringify(
          allocate([], 'Ana', 'Pedro')
        )),
        { biblioteca: '', banos: '' }
      );

      assert.deepEqual(
        JSON.parse(JSON.stringify(
          allocate(['Luis', 'Pedro'], 'Ana', 'Pedro')
        )),
        { biblioteca: 'Pedro', banos: 'Luis' }
      );
    }
  },

  {
    name: 'coverage engine never reserves biblioteca or banos before real classes',
    fn() {
      const reassign = section(
        'function reassignGuardiasForSlot(',
        'function reassignGuardiasForDayHours('
      );

      assert.doesNotMatch(
        reassign,
        /getBibliotecaAsignada|getBanosAsignado/
      );

      assert.doesNotMatch(
        reassign,
        /especiales\s*=\s*\[/
      );

      assert.match(
        reassign,
        /const principales=disponiblesOrdenados;/
      );

      const suggestion = section(
        'function getGuardiaSugerida(',
        'function isPracticasSessionEligible('
      );

      assert.doesNotMatch(
        suggestion,
        /getBibliotecaAsignada|getBanosAsignado/
      );
    }
  }
];
