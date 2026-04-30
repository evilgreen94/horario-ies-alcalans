const assert = require('node:assert/strict');

const {
  buildPayload,
  cleanText,
  parseAnnualXml
} = require('../annual-source');

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
        teachers: {
          'Ana Perez': [
            { dia: 'Lunes', inicio: '08:00', fin: '08:55', tipo: 'Guardia', asignatura: '', grupo: '', aula: '' },
            { dia: 'Lunes', inicio: '09:00', fin: '09:55', tipo: 'Clase', asignatura: 'Matematicas', grupo: '1ESO A', aula: 'A1' }
          ]
        }
      };

      const first = buildPayload(source);
      const second = buildPayload(source);

      assert.equal(first.formato, 'js_desde_json_limpio');
      assert.equal(first.datasetId, second.datasetId);
      assert.equal(first.teachers.length, 1);
      assert.deepEqual(first.teachers[0].guardias, [
        {
          dia: 'Lunes',
          franja: '08:00-08:55',
          texto: 'GUARDIA',
          aula: ''
        }
      ]);
      assert.deepEqual(first.teachers[0].horario[1], {
        dia: 'Lunes',
        franja: '09:00-09:55',
        texto: 'Matematicas | 1ESO A | A1',
        aula: 'A1'
      });
    }
  },
  {
    name: 'parseAnnualXml accepts teacher/session nodes and normalizes guardia sessions',
    fn() {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <horarios fuente="Horarios exportados">
          <teacher nombre="Ana Perez">
            <session dia="Lunes" inicio="08:00" fin="08:55" tipo="Guardia" />
            <session dia="Martes" inicio="09:00" fin="09:55" tipo="Clase" asignatura="Matematicas" grupo="2ESO B" aula="B4" />
          </teacher>
        </horarios>
      `;

      const parsed = parseAnnualXml(xml, 'demo.xml');

      assert.equal(parsed.fuente, 'Horarios exportados');
      assert.equal(parsed.formato, 'xml_importado');
      assert.deepEqual(parsed.teachers['Ana Perez'], [
        {
          dia: 'Lunes',
          inicio: '08:00',
          fin: '08:55',
          tipo: 'guardia',
          asignatura: '',
          grupo: '',
          aula: ''
        },
        {
          dia: 'Martes',
          inicio: '09:00',
          fin: '09:55',
          tipo: 'clase',
          asignatura: 'Matematicas',
          grupo: '2ESO B',
          aula: 'B4'
        }
      ]);
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
  }
];
