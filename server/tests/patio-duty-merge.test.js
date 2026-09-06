const assert = require('assert');

const { mergePatioSlot } = require('../../js/app/patio-duty-merge');

const positionsById = {
  '0.1': { id: '0.1', label: '0.1 · Biblioteca (dins)', isPhysical: true, order: 1 }
};

function configuredSlot() {
  return {
    positions: [
      { id: '1', label: 'Puesto 1', isPhysical: true, order: 0 },
      { id: 'extra', label: 'Apoyo', isPhysical: false, order: 1 }
    ],
    rotation: [
      { positionId: '1', teachers: ['DOCENTE CONFIGURADO'], teacherSourceCodes: ['CFG1'], responsable: 'DOCENTE CONFIGURADO' },
      { positionId: 'extra', teachers: ['DOCENTE MANUAL'], teacherSourceCodes: ['MAN1'], responsable: 'DOCENTE MANUAL' }
    ],
    duties: []
  };
}

function duty(overrides = {}) {
  return {
    sourceCode: 'SRC1',
    teacherName: 'DOCENTE PDF',
    kind: 'patio',
    label: 'GUÀRDIES PATI',
    positionId: '',
    ...overrides
  };
}

module.exports = [
  {
    name: 'patio PDF duties merge without overwriting configured posts or rotations',
    fn() {
      const base = configuredSlot();
      const result = mergePatioSlot(base, [
        duty({ sourceCode: 'CFG1', teacherName: 'DOCENTE CONFIGURADO' }),
        duty()
      ], positionsById);

      assert.deepEqual(result.positions, base.positions);
      assert.deepEqual(result.rotation[1], base.rotation[1]);
      assert.equal(result.duties.find(row => row.sourceCode === 'CFG1').positionId, '1');
      assert.equal(result.duties.find(row => row.sourceCode === 'SRC1').positionId, '');
      assert.deepEqual(result.positionIds, ['1', 'extra']);
    }
  },
  {
    name: 'legacy display-name collisions never reconcile distinct canonical source codes',
    fn() {
      const base = configuredSlot();
      base.rotation[0] = {
        positionId: '1',
        teachers: ['MISMO NOMBRE'],
        teacherSourceCodes: ['JGP1'],
        responsable: 'MISMO NOMBRE'
      };
      const result = mergePatioSlot(base, [
        duty({ sourceCode: 'JGP1', teacherName: 'MISMO NOMBRE' }),
        duty({ sourceCode: 'JGP2', teacherName: 'MISMO NOMBRE' })
      ], positionsById);

      assert.equal(result.duties.find(row => row.sourceCode === 'JGP1').positionId, '1');
      assert.equal(result.duties.find(row => row.sourceCode === 'JGP2').positionId, '');
    }
  },
  {
    name: 'library break duty remains unallocated despite an existing library post definition',
    fn() {
      const base = configuredSlot();
      const library = duty({
        sourceCode: 'LIB1',
        teacherName: 'DOCENTE BIBLIOTECA',
        kind: 'library',
        label: 'BIBLIOTECA PATI',
        positionId: ''
      });
      const result = mergePatioSlot(base, [library], positionsById);

      assert.ok(!result.positions.some(row => row.id === '0.1'));
      assert.deepEqual(result.physicalPositionIds, ['1']);
      assert.ok(!result.rotation.some(row => row.positionId === '0.1'));
      assert.equal(result.duties[0].sourceCode, 'LIB1');
      assert.equal(result.duties[0].label, 'BIBLIOTECA PATI');
      assert.equal(result.duties[0].positionId, '');
      assert.deepEqual(result.rotation.slice(0, 2), base.rotation);
    }
  },
  {
    name: 'an explicit future patio assignment can map a library break duty to a post',
    fn() {
      const base = configuredSlot();
      base.positions.push(positionsById['0.1']);
      base.rotation.push({
        positionId: '0.1',
        teachers: ['DOCENTE BIBLIOTECA'],
        teacherSourceCodes: ['LIB1'],
        responsable: 'DOCENTE BIBLIOTECA'
      });
      const result = mergePatioSlot(base, [duty({
        sourceCode: 'LIB1',
        teacherName: 'DOCENTE BIBLIOTECA',
        kind: 'library',
        label: 'BIBLIOTECA PATI'
      })], positionsById);

      assert.equal(result.duties[0].positionId, '0.1');
      assert.equal(result.rotation.filter(row => row.positionId === '0.1').length, 1);
    }
  },
  {
    name: 'all expected PDF break duties remain independent and repeated merge is idempotent',
    fn() {
      const patioDuties = Array.from({ length: 57 }, (_, index) => duty({
        sourceCode: `PATIO${index + 1}`,
        teacherName: `DOCENTE PATIO ${index + 1}`
      }));
      const libraryDuties = Array.from({ length: 5 }, (_, index) => duty({
        sourceCode: `BIB${index + 1}`,
        teacherName: `DOCENTE BIBLIOTECA ${index + 1}`,
        kind: 'library',
        label: 'BIBLIOTECA PATI',
        positionId: ''
      }));
      const once = mergePatioSlot({ positions: [], rotation: [], duties: [] }, [...patioDuties, ...libraryDuties], positionsById);
      const twice = mergePatioSlot(once, [...patioDuties, ...libraryDuties], positionsById);

      assert.equal(once.duties.filter(row => row.kind === 'patio').length, 57);
      assert.equal(once.duties.filter(row => row.kind === 'library').length, 5);
      assert.equal(once.duties.filter(row => row.kind === 'patio' && !row.positionId).length, 57);
      assert.equal(once.duties.filter(row => row.kind === 'library' && !row.positionId).length, 5);
      assert.ok(once.duties.every(row => row.sourceCode));
      assert.equal(twice.duties.length, 62);
      assert.ok(!twice.rotation.some(row => row.positionId === '0.1'));
      assert.ok(!twice.positions.some(row => row.id === '0.1'));
    }
  }
];
