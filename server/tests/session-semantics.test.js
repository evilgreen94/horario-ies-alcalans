const assert = require('assert');
const {
  absenceRequiresAutomaticCoverage,
  describeSession,
  resolveScheduleState
} = require('../session-semantics');

module.exports = [
  {
    name: 'all canonical session types are occupied and only class requires automatic coverage',
    fn() {
      for (const type of ['class', 'guardia', 'meeting', 'other', 'guardia_patio', 'biblioteca_patio', 'patio_inclusivo']) {
        assert.strictEqual(describeSession({ type }).occupied, true, type);
      }
      assert.strictEqual(absenceRequiresAutomaticCoverage({ type: 'class' }), true);
      for (const type of ['guardia_patio', 'biblioteca_patio', 'patio_inclusivo']) {
        assert.strictEqual(absenceRequiresAutomaticCoverage({ type }), false, type);
      }
    }
  },
  {
    name: 'runtime state distinguishes occupied sessions, break, free, and outside',
    fn() {
      assert.strictEqual(resolveScheduleState({ type: 'teaching' }, { type: 'meeting' }), 'meeting');
      assert.strictEqual(resolveScheduleState({ type: 'break' }, { type: 'guardia_patio' }), 'guardia_patio');
      assert.strictEqual(resolveScheduleState({ type: 'break' }, null), 'break');
      assert.strictEqual(resolveScheduleState({ type: 'teaching' }, null), 'free');
      assert.strictEqual(resolveScheduleState(null, null), 'outside');
    }
  }
];
