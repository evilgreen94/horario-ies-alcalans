const assert = require('assert');

const {
  planCoverageMaterialization
} = require('../coverage-materialization');

const canonical = {
  teachers: [
    {
      profileId: 1,
      sourceCode: 'AAA',
      displayName: 'ANA TITULAR',
      active: true
    },
    {
      profileId: 2,
      sourceCode: 'BBB',
      displayName: 'BELEN TITULAR',
      active: true
    },
    {
      profileId: 3,
      sourceCode: 'CCC',
      displayName: 'CARLA TITULAR',
      active: true
    }
  ]
};

module.exports = [
  {
    name: 'materialization assigns reserved guard to uncovered class',
    fn() {
      const plan = planCoverageMaterialization({
        slots: [{
          dia: 3,
          hora: 6,
          coverage: [{
            id: 101,
            status: 'uncovered'
          }],
          unassignedGuards: [{
            profileId: 2,
            teacher: 'BELEN TITULAR',
            sourceCode: 'BBB',
            reason: 'cobertura-pendiente'
          }]
        }]
      }, canonical, {
        hours: [6]
      });

      assert.deepStrictEqual(plan, [{
        id: 101,
        dia: 3,
        hora: 6,
        guardia: 'BELEN TITULAR',
        sourceCode: 'BBB'
      }]);
    }
  },

  {
    name: 'materialization preserves already covered rows',
    fn() {
      const plan = planCoverageMaterialization({
        slots: [{
          dia: 3,
          hora: 6,
          coverage: [{
            id: 101,
            status: 'covered',
            teacher: 'ANA TITULAR'
          }],
          unassignedGuards: [{
            profileId: 2,
            teacher: 'BELEN TITULAR',
            sourceCode: 'BBB',
            reason: 'sin-asignacion'
          }]
        }]
      }, canonical, {
        hours: [6]
      });

      assert.deepStrictEqual(plan, []);
    }
  },

  {
    name: 'materialization persists canonical schedule identity for visible substitute',
    fn() {
      const plan = planCoverageMaterialization({
        slots: [{
          dia: 3,
          hora: 6,
          coverage: [{
            id: 101,
            status: 'uncovered'
          }],
          unassignedGuards: [{
            profileId: 2,
            teacher: 'SUSTITUTA VISIBLE',
            sourceCode: 'BBB',
            reason: 'cobertura-pendiente'
          }]
        }]
      }, canonical, {
        hours: [6]
      });

      assert.equal(
        plan[0].guardia,
        'BELEN TITULAR'
      );
    }
  },

  {
    name: 'materialization leaves shortage genuinely uncovered',
    fn() {
      const plan = planCoverageMaterialization({
        slots: [{
          dia: 3,
          hora: 6,
          coverage: [
            { id: 101, status: 'uncovered' },
            { id: 102, status: 'uncovered' }
          ],
          unassignedGuards: [{
            profileId: 1,
            teacher: 'ANA TITULAR',
            sourceCode: 'AAA',
            reason: 'cobertura-pendiente'
          }]
        }]
      }, canonical, {
        hours: [6]
      });

      assert.equal(plan.length, 1);
      assert.equal(plan[0].id, 101);
    }
  }
];
