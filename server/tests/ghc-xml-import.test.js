const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { parseGhcXml } = require('../ghc-xml-import');
const { applyMigrations } = require('../db');
const { importScheduleDataset, importTeacherProfiles } = require('../schedule-model');

function fixtureBytes() {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<datosGHC>
 <marcosDeHorario><marcoHorario id="A"><tramo><dia>0</dia><indice>0</indice><horaEntrada>08:15:00</horaEntrada><horaSalida>09:10:00</horaSalida><Tipo>lectivo</Tipo></tramo><tramo><dia>0</dia><indice>1</indice><horaEntrada>09:10:00</horaEntrada><horaSalida>10:05:00</horaSalida><Tipo>lectivo</Tipo></tramo><tramo><dia>0</dia><indice>2</indice><horaEntrada>10:05:00</horaEntrada><horaSalida>11:00:00</horaSalida><Tipo>lectivo</Tipo></tramo><tramo><dia>0</dia><indice>3</indice><horaEntrada>11:00:00</horaEntrada><horaSalida>11:25:00</horaSalida><Tipo>recreo</Tipo></tramo><tramo><dia>0</dia><indice>4</indice><horaEntrada>11:25:00</horaEntrada><horaSalida>12:20:00</horaSalida><Tipo>lectivo</Tipo></tramo><tramo><dia>0</dia><indice>5</indice><horaEntrada>12:20:00</horaEntrada><horaSalida>13:15:00</horaSalida><Tipo>lectivo</Tipo></tramo></marcoHorario></marcosDeHorario>
 <profesores><profesor><nombre>JGP1</nombre><abreviatura>JGP1</abreviatura><nombreCompleto>JOSÉ GARCÍA PÉREZ</nombreCompleto></profesor><profesor><nombre>JGP2</nombre><abreviatura>JGP2</abreviatura><nombreCompleto>JOSÉ GARCÍA PÉREZ</nombreCompleto></profesor></profesores>
 <materias><materia><nombre>MAT1</nombre><nombreCompleto>Valencià</nombreCompleto></materia></materias>
 <grupos><grupo><nombre>G1</nombre><abreviatura>1 ESO A</abreviatura></grupo></grupos>
 <sesionesLectivas><sesion id="S1"><materia>MAT1</materia><grupo>G1</grupo><profesor>JGP1</profesor></sesion></sesionesLectivas>
 <tareas><tarea><nombre>PATISINC</nombre><nombreCompleto>PATIS INCLUSIUS</nombreCompleto></tarea><tarea><nombre>ALT</nombre><nombreCompleto>ATENCIÓ A FAMÍLIES</nombreCompleto></tarea></tareas>
 <complementarias><complementaria><identificador>C1</identificador><tarea>PATISINC</tarea><profesor>JGP2</profesor></complementaria><complementaria><identificador>C2</identificador><tarea>ALT</tarea><profesor>JGP2</profesor></complementaria></complementarias>
 <reuniones><reunion><nombre>COORDINACIÓ</nombre><integrantes><integrante>JGP1</integrante></integrantes></reunion></reuniones>
 <horario>
  <tramo dia="0" indice="0" marco="A"><aula id="A01"><sesion>S1</sesion><profesor>JGP1</profesor></aula></tramo>
  <tramo dia="0" indice="1" marco="A"><guardia><nombre>GUÀRDIES</nombre><profesor>JGP2</profesor></guardia></tramo>
  <tramo dia="0" indice="2" marco="A"><complementaria>C1</complementaria></tramo>
  <tramo dia="0" indice="3" marco="A"><guardia><nombre>GUÀRDIES PATI</nombre><profesor>JGP1</profesor></guardia></tramo>
  <tramo dia="1" indice="3" marco="A"><guardia><nombre>BIBLIOTECA PATI</nombre><profesor>JGP2</profesor></guardia></tramo>
  <tramo dia="0" indice="4" marco="A"><reunion>COORDINACIÓ</reunion></tramo>
  <tramo dia="0" indice="5" marco="A"><complementaria>C2</complementaria></tramo>
 </horario>
</datosGHC>`;
  return Buffer.from(xml, 'latin1');
}

module.exports = [
  {
    name: 'real GHC adapter decodes ISO-8859-1, keeps duplicate names separate, and maps final business types',
    fn() {
      const parsed = parseGhcXml(fixtureBytes(), { academicYear: '2026/27', sourceLabel: 'Horario.xml' });
      assert.strictEqual(parsed.audit.encoding, 'ISO-8859-1');
      assert.deepStrictEqual(parsed.audit.duplicateDisplayNames, [['JGP1', 'JGP2']]);
      assert.strictEqual(parsed.audit.unresolvedReferences, 0);
      assert.strictEqual(parsed.census.teachers[0].display_name, 'JOSÉ GARCÍA PÉREZ');
      assert.deepStrictEqual(parsed.audit.countsByType, {
        class: 1, guardia_patio: 1, meeting: 1, guardia: 1,
        patio_inclusivo: 1, other: 1, biblioteca_patio: 1
      });
      const library = parsed.canonical.sessions.find(row => row.type === 'biblioteca_patio');
      assert.strictEqual(library.room, 'Biblioteca');
      assert.strictEqual(parsed.canonical.periods.find(row => row.key === 'B1').type, 'break');
      assert.strictEqual(parsed.canonical.periods[0].position, 1);
    }
  },
  {
    name: 'GHC adapter requires an explicit academic year and rejects unknown teacher references',
    fn() {
      assert.throws(() => parseGhcXml(fixtureBytes(), {}), /academic_year explícito/);
      const bad = Buffer.from(fixtureBytes().toString('latin1').replace('<profesor>JGP1</profesor></aula>', '<profesor>ZZZ</profesor></aula>'), 'latin1');
      assert.throws(() => parseGhcXml(bad, { academicYear: '2026/27' }), /ZZZ/);
      const withDoctype = Buffer.from(fixtureBytes().toString('latin1').replace(
        '<datosGHC>',
        '<!DOCTYPE datosGHC [<!ENTITY x "blocked">]><datosGHC>'
      ), 'latin1');
      assert.throws(() => parseGhcXml(withDoctype, { academicYear: '2026/27' }), /DTD.*entidades/);
    }
  },
  {
    name: 'GHC SQLite import is repeatable and remains validated rather than active',
    async fn() {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guardias-ghc-'));
      const databasePath = path.join(directory, 'ghc.test.sqlite');
      const db = await open({ filename: databasePath, driver: sqlite3.Database });
      try {
        await db.exec('PRAGMA foreign_keys = ON');
        await db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
        await applyMigrations(db);
        const parsed = parseGhcXml(fixtureBytes(), { academicYear: '2026/27' });
        await importTeacherProfiles(db, parsed.census, { sourceFormat: 'xml' });
        const first = await importScheduleDataset(db, parsed.canonical);
        const second = await importScheduleDataset(db, parsed.canonical);
        assert.strictEqual(first.status, 'validated');
        assert.strictEqual(second.status, 'validated');
        assert.strictEqual(second.reused, false);
        assert.strictEqual(first.datasetId, second.datasetId);
        assert.strictEqual((await db.get("SELECT COUNT(*) AS total FROM schedule_datasets WHERE status = 'active'")).total, 0);
        assert.strictEqual((await db.get('SELECT COUNT(*) AS total FROM teacher_schedule_sessions')).total, 7);
      } finally {
        await db.close();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  }
];
