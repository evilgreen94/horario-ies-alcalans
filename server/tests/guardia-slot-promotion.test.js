const assert = require('assert');
const {
  deriveEffectiveGuardiaSlotState
} = require('../guardia-slot-policy');

module.exports = [
  {
    name: 'planned banos teacher is promoted to biblioteca when planned biblioteca covers class',
    fn() {
      const result = deriveEffectiveGuardiaSlotState({
        dia: 3,
        hora: 6,
        candidates: [
          { profileId: 1, displayName: 'Ana', sourceCode: 'ANA', order: 0 },
          { profileId: 2, displayName: 'Pedro', sourceCode: 'PED', order: 1 },
          { profileId: 3, displayName: 'Marta', sourceCode: 'MAR', order: 2 }
        ],
        coverageRows: [
          {
            id: 1,
            absentTeacher: 'Ausente',
            assignedProfileId: 1
          }
        ],
        plannedBibliotecaProfileId: 1,
        plannedBanosProfileId: 2
      });

      assert.equal(result.coverage[0].teacher, 'Ana');
      assert.equal(result.biblioteca.teacher, 'Pedro');
      assert.equal(result.banos.teacher, 'Marta');
    }
  }
];
