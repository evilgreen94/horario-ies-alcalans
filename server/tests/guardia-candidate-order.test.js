const assert = require('assert');
const {
  rankGuardiaCandidates
} = require('../guardia-candidate-order');

module.exports = [
  {
    name: 'server candidate order prioritizes monthly then week then day load',
    fn() {
      const candidates = [
        {
          profileId: 1,
          displayName: 'Ana Uno',
          scheduleName: 'Ana Uno',
          sourceCode: 'AU'
        },
        {
          profileId: 2,
          displayName: 'Berta Dos',
          scheduleName: 'Berta Dos',
          sourceCode: 'BD'
        },
        {
          profileId: 3,
          displayName: 'Carmen Tres',
          scheduleName: 'Carmen Tres',
          sourceCode: 'CT'
        }
      ];

      const ordered = rankGuardiaCandidates(candidates, {
        date: '2026-09-17',
        dia: 3,
        hora: 6,
        monthlyLoadState: {
          monthKey: '2026-09',
          byDate: {
            '2026-09-10': {
              'Ana Uno': 2,
              'Berta Dos': 1,
              'Carmen Tres': 1
            }
          }
        },
        absenceRows: [
          {
            dia: 3,
            hora: 5,
            guardia: 'Berta Dos'
          }
        ]
      });

      assert.deepStrictEqual(
        ordered.map(item => item.profileId),
        [3, 2, 1]
      );
    }
  },

  {
    name: 'current slot does not penalize its persisted coverage in ordering',
    fn() {
      const candidates = [
        {
          profileId: 1,
          displayName: 'Ana Uno',
          scheduleName: 'Ana Uno'
        },
        {
          profileId: 2,
          displayName: 'Berta Dos',
          scheduleName: 'Berta Dos'
        }
      ];

      const ordered = rankGuardiaCandidates(candidates, {
        date: '2026-09-17',
        dia: 3,
        hora: 6,
        monthlyLoadState: {
          monthKey: '2026-09',
          byDate: {
            '2026-09-17': {
              'Ana Uno': 1
            }
          }
        },
        absenceRows: [
          {
            dia: 3,
            hora: 6,
            guardia: 'Ana Uno'
          }
        ]
      });

      assert.deepStrictEqual(
        ordered.map(item => item.profileId),
        [1, 2]
      );
    }
  }
];
