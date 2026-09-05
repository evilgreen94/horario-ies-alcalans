const assert = require('node:assert/strict');

const {
  buildCanonicalSchedule,
  buildPayload,
  cleanText,
  parseAnnualXml,
  validateAndNormalizeAnnualSource
} = require('../annual-source');

function teacher(sourceCode, displayName, sessions = []) {
  return { source_code: sourceCode, display_name: displayName, sessions };
}

module.exports = [
  {
    name: 'cleanText collapses repeated whitespace',
    fn() {
      assert.equal(cleanText('  Aula   B12 \n '), 'Aula B12');
    }
  },
  {
    name: 'buildPayload keeps guardia rows separated and generates a stable dataset id for the same source',
    fn() {
      const source = {
        fuente: 'Importacion anual',
        teachers: [teacher('ANPR', 'Ana Perez', [
          { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'Guardia', asignatura: '', grupo: '', aula: '' },
          { dia: 'Lunes', inicio: '09:10', fin: '10:05', tipo: 'Clase', asignatura: 'Matematicas', grupo: '1ESO A', aula: 'A1' }
        ])]
      };

      const first = buildPayload(source);
      const second = buildPayload(source);

      assert.equal(first.formato, 'js_desde_json_limpio');
      assert.equal(first.datasetId, second.datasetId);
      assert.equal(first.teachers.length, 1);
      assert.deepEqual(first.teachers[0].guardias, [
        { dia: 'Lunes', franja: '08:15-09:10', texto: 'GUARDIA', aula: '' }
      ]);
      assert.deepEqual(first.teachers[0].horario[1], {
        dia: 'Lunes',
        franja: '09:10-10:05',
        texto: 'Matematicas | 1ESO A | A1',
        aula: 'A1'
      });
    }
  },
  {
    name: 'parseAnnualXml returns source-code-keyed teacher records and normalizes guardia sessions',
    fn() {
      const parsed = parseAnnualXml(`
        <?xml version="1.0" encoding="UTF-8"?>
        <horarios fuente="Horarios exportados" academic_year="2026/27" source_system="Peñalara Software">
          <teacher nombre="Ana Perez" source_code="ANPR">
            <session dia="Lunes" inicio="08:15" fin="09:10" tipo="Guardia" />
            <session dia="Martes" inicio="09:10" fin="10:05" tipo="Clase" asignatura="Matematicas" grupo="2ESO B" aula="B4" />
          </teacher>
        </horarios>
      `, 'demo.xml');

      assert.equal(parsed.fuente, 'Horarios exportados');
      assert.equal(parsed.formato, 'xml_importado');
      assert.equal(parsed.academicYear, '2026/27');
      assert.deepEqual(parsed.teachers, [teacher('ANPR', 'Ana Perez', [
        { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'guardia', asignatura: '', grupo: '', aula: '' },
        { dia: 'Martes', inicio: '09:10', fin: '10:05', tipo: 'clase', asignatura: 'Matematicas', grupo: '2ESO B', aula: 'B4' }
      ])]);
    }
  },
  {
    name: 'annual XML converts to a canonical shape with explicit breaks and P7 teaching',
    fn() {
      const parsed = parseAnnualXml(`
        <horarios fuente="Horario XML" academic_year="2026/27">
          <teacher nombre="Ana Perez" source_code="ANPR">
            <session dia="Lunes" inicio="11:00" fin="11:25" tipo="Guardia" />
            <session dia="Viernes" inicio="14:25" fin="15:20" tipo="Clase" asignatura="Proyecto" grupo="2ESO" aula="A1" />
          </teacher>
          <teacher nombre="Docente sin sesiones" source_code="SNSS"></teacher>
        </horarios>
      `);

      const canonical = buildCanonicalSchedule(parsed);

      assert.equal(canonical.academic_year, '2026/27');
      assert.deepEqual(canonical.teacher_source_codes, ['ANPR', 'SNSS']);
      assert.equal(canonical.periods.filter(period => period.type === 'break').length, 2);
      assert.equal(canonical.periods.find(period => period.key === 'P7').type, 'teaching');
      assert.ok(canonical.anomalies.includes('Docente sin sesiones: SNSS'));
      assert.deepEqual(canonical.sessions.map(row => [row.period_key, row.type]), [
        ['BREAK1', 'guardia'],
        ['P7', 'class']
      ]);
    }
  },
  {
    name: 'canonical XML import rejects a teacher without source_code',
    fn() {
      assert.throws(() => parseAnnualXml(`
        <horarios academic_year="2026/27">
          <teacher nombre="Ana Perez">
            <session dia="Lunes" inicio="08:15" fin="09:10" tipo="Clase" />
          </teacher>
        </horarios>
      `), /no tiene source_code/);
    }
  },
  {
    name: 'parseAnnualXml rejects files without recognizable teacher nodes',
    fn() {
      assert.throws(
        () => parseAnnualXml('<root><row /></root>', 'sin-profes.xml'),
        /El XML no contiene nodos de profesorado reconocibles/
      );
    }
  },
  {
    name: 'validateAndNormalizeAnnualSource preserves a sourced teacher without sessions',
    fn() {
      const normalized = validateAndNormalizeAnnualSource({
        fuente: 'Importacion anual',
        teachers: [teacher('ORIE', 'ORIENTACIÓ')]
      });

      assert.deepEqual(normalized.teachers, [teacher('ORIE', 'ORIENTACIÓ')]);
      assert.deepEqual(normalized.metadata.teachersWithoutSessions, ['ORIE']);
    }
  },
  {
    name: 'validateAndNormalizeAnnualSource rejects a malformed teacher session collection',
    fn() {
      assert.throws(
        () => validateAndNormalizeAnnualSource({
          teachers: [{ source_code: 'ANPR', display_name: 'Ana Perez', sessions: { dia: 'Lunes' } }]
        }),
        /sesiones del profesor ANPR .* deben ser una lista/
      );
    }
  },
  {
    name: 'validateAndNormalizeAnnualSource rejects unsupported 2026/27 adapter slots',
    fn() {
      assert.throws(
        () => validateAndNormalizeAnnualSource({
          teachers: [teacher('ANPR', 'Ana Perez', [
            { dia: 'Lunes', inicio: '08:00', fin: '08:55', tipo: 'Clase', asignatura: 'Matematicas', grupo: '1ESO A', aula: 'A1' }
          ])]
        }),
        /franja no soportada/
      );
    }
  },
  {
    name: 'validateAndNormalizeAnnualSource merges repeated compatible source_code blocks and sorts sessions',
    fn() {
      const normalized = validateAndNormalizeAnnualSource({
        teachers: [
          teacher('ANPR', 'Ana Perez', [
            { dia: 'Martes', inicio: '09:10', fin: '10:05', tipo: 'Clase', asignatura: 'Matematicas', grupo: '2ESO B', aula: 'B4' }
          ]),
          teacher('ANPR', 'Ana Perez', [
            { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'Guardia', asignatura: '', grupo: '', aula: '' }
          ])
        ]
      });

      assert.equal(normalized.teachers.length, 1);
      assert.deepEqual(normalized.metadata.duplicateSourceCodes, ['ANPR']);
      assert.deepEqual(normalized.teachers[0].sessions.map(row => [row.dia, row.tipo]), [
        ['Lunes', 'guardia'],
        ['Martes', 'clase']
      ]);
    }
  },
  {
    name: 'same source_code cannot resolve to contradictory display_name metadata',
    fn() {
      assert.throws(
        () => validateAndNormalizeAnnualSource({
          teachers: [teacher('ANPR', 'Ana Perez'), teacher('ANPR', 'Bea Perez')]
        }),
        /identidades docentes contradictorias/
      );
    }
  },
  {
    name: 'conflicting slots are rejected within one source_code identity',
    fn() {
      assert.throws(
        () => validateAndNormalizeAnnualSource({
          teachers: [teacher('ANPR', 'Ana Perez', [
            { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'Clase', asignatura: 'Matematicas', grupo: '1ESO A', aula: 'A1' },
            { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'Clase', asignatura: 'Lengua', grupo: '1ESO B', aula: 'A2' }
          ])]
        }),
        /Conflicto de importación/
      );
    }
  },
  {
    name: 'duplicate display_name values remain independent source_code identities',
    fn() {
      const canonical = buildCanonicalSchedule({
        academicYear: '2026/27',
        teachers: [
          teacher('JGP1', 'JOSE GARCIA PEREZ', [
            { dia: 'Lunes', inicio: '08:15', fin: '09:10', tipo: 'Clase', asignatura: 'Matematicas', grupo: '1A', aula: 'A1' }
          ]),
          teacher('JGP2', 'JOSE GARCIA PEREZ', [
            { dia: 'Martes', inicio: '09:10', fin: '10:05', tipo: 'Clase', asignatura: 'Lengua', grupo: '2B', aula: 'B2' }
          ])
        ]
      });

      assert.deepEqual(canonical.teacher_source_codes, ['JGP1', 'JGP2']);
      assert.deepEqual(canonical.sessions.map(row => [row.teacher_source_code, row.weekday, row.period_key]), [
        ['JGP1', 0, 'P1'],
        ['JGP2', 1, 'P2']
      ]);
    }
  },
  {
    name: 'parseAnnualXml rejects contradictory display names for one source_code',
    fn() {
      assert.throws(() => parseAnnualXml(`
        <horarios academic_year="2026/27">
          <teacher nombre="Ana Perez" source_code="ANPR"></teacher>
          <teacher nombre="Bea Perez" source_code="ANPR">
            <session dia="Lunes" inicio="08:15" fin="09:10" tipo="Clase" />
          </teacher>
        </horarios>
      `), /identidades docentes contradictorias/);
    }
  },
  {
    name: 'the provisional period adapter refuses academic years other than 2026/27',
    fn() {
      assert.throws(
        () => buildCanonicalSchedule({
          academicYear: '2027/28',
          teachers: [teacher('ANPR', 'Ana Perez')]
        }),
        /solo define periodos para 2026\/27/
      );
    }
  }
];
