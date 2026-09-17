const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = [
  {
    name: 'TV renders authoritative server slot and ignores conflicting local calculation',
    fn() {
      const source = fs.readFileSync(
        path.join(__dirname, '../../js/app/guardias-aux-panels.js'),
        'utf8'
      );

      const document = {};
      const window = {
        document,
        location: {
          search: '',
          protocol: 'http:',
          href: 'http://localhost/'
        }
      };

      vm.runInNewContext(source, {
        window,
        console,
        URL,
        URLSearchParams,
        Date,
        Math,
        Set,
        Map,
        performance
      });

      const domain = window.GuardiasAuxPanels.createTvPanelDomain({
        document,
        window,
        storage: {
          hasBackend: () => true
        },
        horaMap: {
          6: { label: '6a', rango: '12:20-13:15' }
        },
        horasPatio: new Set(),
        dias: ['Lunes','Martes','Miércoles','Jueves','Viernes'],
        getRowsForWeekOffset: () => [{
          id: 99,
          dia: 3,
          hora: 6,
          ausente: 'LOCAL AUSENTE',
          guardia: 'LOCAL ERRÓNEO'
        }],
        getVisibleTeacherName: value => value,
        buildTvAbsenceAssignment: row => ({
          teacher: row.guardia,
          location: 'LOCAL',
          meta: '',
          tone: 'general'
        }),
        getEffectiveSpecialAssignments: () => ({
          biblioteca: 'LOCAL BIBLIOTECA',
          banos: 'LOCAL BAÑOS'
        }),
        rowNeedsCoverage: () => true,
        getEffectiveGuardiaSlot: () => ({
          dia: 3,
          hora: 6,
          coverage: [{
            status: 'covered',
            teacher: 'SERVER COBERTURA',
            absentTeacher: 'SERVER AUSENTE',
            group: '2 ESO A',
            room: 'A10',
            subject: 'Matemáticas'
          }],
          biblioteca: {
            teacher: 'SERVER BIBLIOTECA'
          },
          banos: {
            teacher: 'SERVER BAÑOS'
          },
          unassignedGuards: [{
            teacher: 'SERVER LIBRE',
            reason: 'sin-asignacion'
          }]
        })
      });

      const assignments = domain.getTvSlotAssignments(
        { dia: 3, hora: 6 },
        []
      );

      assert.deepStrictEqual(
        Array.from(assignments, item => item.teacher),
        [
          'SERVER COBERTURA',
          'SERVER BIBLIOTECA',
          'SERVER BAÑOS',
          'SERVER LIBRE'
        ]
      );

      assert.equal(
        assignments.find(item => item.teacher === 'SERVER LIBRE').location,
        'Guardia disponible'
      );

      assert.equal(
        assignments.some(item => item.teacher.includes('LOCAL')),
        false
      );
    }
  }
];
