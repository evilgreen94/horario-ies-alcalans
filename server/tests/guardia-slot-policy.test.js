const assert = require('assert');
const {
  deriveEffectiveGuardiaSlotState
} = require('../guardia-slot-policy');

function teacher(profileId, displayName, order = profileId) {
  return {
    profileId,
    displayName,
    sourceCode: `T${profileId}`,
    order
  };
}

module.exports = [
  {
    name: 'effective slot prioritizes class coverage then biblioteca banos and unassigned guards',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        date: '2026-09-17',
        candidates: [
          teacher(1, 'Guardia A'),
          teacher(2, 'Guardia B'),
          teacher(3, 'Guardia C'),
          teacher(4, 'Guardia D'),
          teacher(5, 'Guardia E'),
          teacher(6, 'Guardia F')
        ],
        coverageRows: [
          { id: 1, absentTeacher: 'Ausente A', assignedProfileId: 1 },
          { id: 2, absentTeacher: 'Ausente B', assignedProfileId: 2 },
          { id: 3, absentTeacher: 'Ausente C', assignedProfileId: 3 }
        ]
      });

      assert.deepStrictEqual(
        result.coverage.map(row => row.teacher),
        ['Guardia A', 'Guardia B', 'Guardia C']
      );

      assert.equal(result.biblioteca.teacher, 'Guardia D');
      assert.equal(result.banos.teacher, 'Guardia E');

      assert.deepStrictEqual(
        result.unassignedGuards.map(row => row.teacher),
        ['Guardia F']
      );
    }
  },

  {
    name: 'persisted special preferences are used only when the teacher remains free',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          teacher(1, 'Ana'),
          teacher(2, 'Pedro'),
          teacher(3, 'Marta'),
          teacher(4, 'Luis')
        ],
        coverageRows: [
          {
            id: 1,
            absentTeacher: 'Ausente',
            assignedProfileId: 1
          }
        ],
        plannedBibliotecaProfileId: 3,
        plannedBanosProfileId: 4
      });

      assert.equal(result.coverage[0].teacher, 'Ana');
      assert.equal(result.biblioteca.teacher, 'Marta');
      assert.equal(result.banos.teacher, 'Luis');
      assert.deepStrictEqual(
        result.unassignedGuards.map(row => row.teacher),
        ['Pedro']
      );
    }
  },

  {
    name: 'teacher covering a class cannot simultaneously remain in banos',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          teacher(1, 'Estefanía González Torres'),
          teacher(2, 'Trini Climent Minguez'),
          teacher(3, 'Concepción Cervantes Carrillo')
        ],
        coverageRows: [
          {
            id: 3510,
            absentTeacher: 'Alba Martínez Alarcón',
            assignedProfileId: 1
          }
        ],
        plannedBanosProfileId: 1
      });

      assert.equal(result.coverage[0].teacher, 'Estefanía González Torres');
      assert.equal(result.biblioteca.teacher, 'Trini Climent Minguez');
      assert.equal(result.banos.teacher, 'Concepción Cervantes Carrillo');

      assert.notEqual(result.biblioteca.profileId, 1);
      assert.notEqual(result.banos.profileId, 1);
    }
  },

  {
    name: 'uncovered classes reserve free guards before biblioteca and banos',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          teacher(1, 'Guardia A'),
          teacher(2, 'Guardia B'),
          teacher(3, 'Guardia C')
        ],
        coverageRows: [
          {
            id: 1,
            absentTeacher: 'Clase sin cubrir',
            assignedProfileId: null
          }
        ]
      });

      assert.equal(result.coverage[0].status, 'uncovered');

      assert.equal(result.biblioteca.teacher, 'Guardia B');
      assert.equal(result.banos.teacher, 'Guardia C');

      assert.deepStrictEqual(result.unassignedGuards, [
        {
          profileId: 1,
          teacher: 'Guardia A',
          sourceCode: 'T1',
          reason: 'cobertura-pendiente'
        }
      ]);

      assert.equal(result.diagnostics.assignmentGap, true);
    }
  },

  {
    name: 'one available guard with one uncovered class never becomes biblioteca',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          teacher(1, 'Única Guardia')
        ],
        coverageRows: [
          {
            id: 1,
            absentTeacher: 'Clase pendiente',
            assignedProfileId: null
          }
        ]
      });

      assert.equal(result.biblioteca, null);
      assert.equal(result.banos, null);
      assert.equal(result.unassignedGuards.length, 1);
      assert.equal(result.unassignedGuards[0].reason, 'cobertura-pendiente');
    }
  },

  {
    name: 'same teacher cannot occupy coverage biblioteca banos or free pool twice',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          teacher(1, 'Ana'),
          teacher(1, 'Ana duplicada'),
          teacher(2, 'Pedro'),
          teacher(3, 'Marta')
        ],
        coverageRows: [
          {
            id: 1,
            absentTeacher: 'Ausente',
            assignedProfileId: 1
          }
        ],
        plannedBibliotecaProfileId: 1,
        plannedBanosProfileId: 1
      });

      const occupied = [
        ...result.coverage
          .filter(row => row.status === 'covered')
          .map(row => row.assignedProfileId),
        result.biblioteca?.profileId,
        result.banos?.profileId,
        ...result.unassignedGuards.map(row => row.profileId)
      ].filter(Boolean);

      assert.equal(new Set(occupied).size, occupied.length);
    }
  }
];
