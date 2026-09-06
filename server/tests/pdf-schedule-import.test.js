const assert = require('node:assert/strict');

const {
  classifyBreakCell,
  classifyCell,
  reconcileSplitTeachingCells
} = require('../pdf-schedule-import');

module.exports = [
  {
    name: 'PDF adapter reconstructs split two-period classes without semantic guesses',
    fn() {
      const sessions = [
        {
          teacher_source_code: 'TEST', weekday: 0, period_key: 'P1', type: 'other',
          subject: '', group: '', room: '', label: 'MODULE'
        },
        {
          teacher_source_code: 'TEST', weekday: 0, period_key: 'P2', type: 'class',
          subject: '', group: '1 CFM INF', room: 'E24', label: '1 CFM INF | E24'
        },
        {
          teacher_source_code: 'TEST', weekday: 1, period_key: 'P3', type: 'other',
          subject: '', group: '', room: '', label: 'NOT A CONTINUATION'
        },
        {
          teacher_source_code: 'TEST', weekday: 1, period_key: 'P4', type: 'class',
          subject: '', group: '2 ESO A', room: 'A01', label: '2 ESO A | A01'
        }
      ];

      reconcileSplitTeachingCells(sessions);

      assert.deepEqual(
        sessions.slice(0, 2).map(session => ({
          type: session.type,
          subject: session.subject,
          group: session.group,
          room: session.room,
          label: session.label
        })),
        [
          { type: 'class', subject: 'MODULE', group: '1 CFM INF', room: 'E24', label: 'MODULE | 1 CFM INF | E24' },
          { type: 'class', subject: 'MODULE', group: '1 CFM INF', room: 'E24', label: 'MODULE | 1 CFM INF | E24' }
        ]
      );
      assert.equal(sessions[2].type, 'other', 'P3 and P4 are separated by an explicit break');
      assert.equal(sessions[3].subject, '');
    }
  },
  {
    name: 'PDF adapter recognizes accented and plural guard-duty terminology',
    fn() {
      for (const label of ['GUARDIA', 'GUÀRDIA', 'GUARDIES', 'GUÀRDIES']) {
        assert.equal(classifyCell([{ text: label }]).type, 'guardia');
      }
    }
  },
  {
    name: 'PDF adapter preserves patio and library duties while ignoring the printed break label',
    fn() {
      assert.deepEqual(
        classifyBreakCell([{ text: 'GUÀRDIES PATI' }, { text: 'Recreo' }]),
        { type: 'guardia', subject: '', group: '', room: '', label: 'GUÀRDIES PATI' }
      );
      assert.deepEqual(
        classifyBreakCell([{ text: 'BIBLIOTECA PATI' }]),
        { type: 'other', subject: '', group: '', room: '', label: 'BIBLIOTECA PATI' }
      );
      assert.equal(classifyBreakCell([{ text: 'Recreo' }]), null);
    }
  }
];
