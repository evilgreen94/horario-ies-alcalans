const assert = require('assert');

const {
  buildEffectiveGuardiaDayStateFromSources
} = require('../guardia-slot-state');

function session(weekday, periodKey, type, extra = {}) {
  return {
    weekday,
    periodKey,
    type,
    subject: '',
    group: '',
    room: '',
    label: '',
    ...extra
  };
}

function teacher(profileId, sourceCode, displayName, sessions) {
  return {
    profileId,
    sourceCode,
    displayName,
    active: true,
    sessions
  };
}

function canonical(teachers) {
  return {
    periods: [
      {
        key: 'H6',
        position: 6,
        type: 'teaching',
        label: '6ª hora',
        startsAt: '13:15',
        endsAt: '14:10'
      }
    ],
    teachers
  };
}

module.exports = [
  {
    name: 'server read model preserves persisted class coverage before support posts',
    fn() {
      const result = buildEffectiveGuardiaDayStateFromSources({
        date: '2026-09-17',
        canonical: canonical([
          teacher(1, 'G1', 'Guardia Uno', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(2, 'G2', 'Guardia Dos', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(3, 'G3', 'Guardia Tres', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(4, 'ABS', 'Docente Ausente', [
            session(3, 'H6', 'class', {
              subject: 'Matemáticas',
              group: '2 ESO A',
              room: 'A10'
            })
          ])
        ]),
        absenceRows: [
          {
            id: 100,
            dia: 3,
            hora: 6,
            ausente: 'Docente Ausente',
            guardia: 'Guardia Uno',
            aula: 'A10'
          }
        ],
        bibliotecaRows: [
          {
            dia: 3,
            hora: 6,
            profesor: 'Guardia Dos'
          }
        ],
        banosRows: [
          {
            dia: 3,
            hora: 6,
            profesor: 'Guardia Tres'
          }
        ]
      });

      const slot = result.slots[0];

      assert.equal(slot.coverage.length, 1);
      assert.equal(slot.coverage[0].status, 'covered');
      assert.equal(slot.coverage[0].teacher, 'Guardia Uno');
      assert.equal(slot.biblioteca.teacher, 'Guardia Dos');
      assert.equal(slot.banos.teacher, 'Guardia Tres');
    }
  },

  {
    name: 'server read model displays active substitute using titular schedule profile',
    fn() {
      const result = buildEffectiveGuardiaDayStateFromSources({
        date: '2026-09-17',
        canonical: canonical([
          teacher(10, 'EMP', 'Eva Montero Peiró', [
            session(3, 'H6', 'guardia')
          ])
        ]),
        effectiveSubstitutions: [
          {
            titular: {
              profileId: 10,
              displayName: 'Eva Montero Peiró',
              sourceCode: 'EMP'
            },
            substitute: {
              userId: 89,
              username: 'ejp',
              displayName: 'Elena Jurado Pamblanco'
            }
          }
        ]
      });

      const slot = result.slots[0];

      assert.equal(slot.biblioteca.teacher, 'Elena Jurado Pamblanco');
      assert.equal(slot.biblioteca.profileId, 10);
    }
  },

  {
    name: 'automatic practicas release enters the effective guard pool',
    fn() {
      const result = buildEffectiveGuardiaDayStateFromSources({
        date: '2026-09-17',
        canonical: canonical([
          teacher(20, 'PRA', 'Docente Prácticas', [
            session(3, 'H6', 'class', {
              subject: 'Proyecto Intermodular',
              group: '2 FPB'
            })
          ])
        ]),
        practiceRows: [
          { profesor: 'Docente Prácticas' }
        ]
      });

      const slot = result.slots[0];

      assert.equal(slot.biblioteca.teacher, 'Docente Prácticas');
    }
  },

  {
    name: 'manual practicas slot enters pool even when class is not auto classified as practicas',
    fn() {
      const result = buildEffectiveGuardiaDayStateFromSources({
        date: '2026-09-17',
        canonical: canonical([
          teacher(30, 'MAN', 'Docente Manual', [
            session(3, 'H6', 'class', {
              subject: 'Materia ordinaria',
              group: '1 ESO A'
            })
          ])
        ]),
        practiceSlotRows: [
          {
            profesor: 'Docente Manual',
            dia: 3,
            hora: 6
          }
        ]
      });

      const slot = result.slots[0];

      assert.equal(slot.biblioteca.teacher, 'Docente Manual');
    }
  },

  {
    name: 'absence outside automatic class coverage does not consume guard capacity',
    fn() {
      const result = buildEffectiveGuardiaDayStateFromSources({
        date: '2026-09-17',
        canonical: canonical([
          teacher(40, 'G40', 'Guardia Disponible', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(41, 'NOC', 'Ausencia No Cubrible', [
            session(3, 'H6', 'guardia')
          ])
        ]),
        absenceRows: [
          {
            id: 3512,
            dia: 3,
            hora: 6,
            ausente: 'Ausencia No Cubrible',
            guardia: 'Guardia Disponible'
          }
        ]
      });

      const slot = result.slots[0];

      assert.equal(slot.coverage.length, 0);
      assert.equal(slot.biblioteca.teacher, 'Guardia Disponible');
    }
  },

  {
    name: 'same source data always produces identical effective state for every client',
    fn() {
      const input = {
        date: '2026-09-17',
        canonical: canonical([
          teacher(50, 'A', 'Ana', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(51, 'B', 'Beatriz', [
            session(3, 'H6', 'guardia')
          ]),
          teacher(52, 'C', 'Carmen', [
            session(3, 'H6', 'guardia')
          ])
        ])
      };

      const pc = buildEffectiveGuardiaDayStateFromSources(input);
      const raspberry = buildEffectiveGuardiaDayStateFromSources(input);
      const movil = buildEffectiveGuardiaDayStateFromSources(input);

      assert.deepStrictEqual(raspberry, pc);
      assert.deepStrictEqual(movil, pc);
    }
  }
];
