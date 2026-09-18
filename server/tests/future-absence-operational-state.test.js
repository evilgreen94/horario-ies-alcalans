const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  importTeacherProfiles,
  importScheduleDataset,
  activateScheduleDataset
} = require('../schedule-model');

const {
  cleanupTestEnvironment,
  createTestEnvironment,
  loginIndividual,
  openDatabase,
  request,
  seedIndividualUser,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

const ADMIN_USER = 'future.apply.admin';
const ADMIN_PASSWORD = 'Future-apply-fixture-2026!';

async function fixture() {
  const environment = createTestEnvironment();
  const server = await startServer({ dbPath: environment.dbPath });

  try {
    const db = await openDatabase(environment.dbPath);

    try {
      const teachers = [
        'ABS',
        'LEGACY',
        'G1',
        'G2',
        'G3',
        'G4'
      ].map(code => ({
        source_code: code,
        display_name: `Teacher ${code}`,
        active: true
      }));

      await importTeacherProfiles(db, {
        academic_year: '2026/27',
        source_system: 'test',
        teachers,
        teacher_count: teachers.length
      });

      const imported = await importScheduleDataset(db, {
        academic_year: '2026/27',
        label: 'Future absence operational state',
        source: {
          system: 'test',
          format: 'test'
        },
        teacher_source_codes: teachers.map(row => row.source_code),
        periods: [
          {
            key: 'P1',
            position: 1,
            type: 'teaching',
            starts_at: '08:15',
            ends_at: '09:10'
          },
          {
            key: 'P2',
            position: 2,
            type: 'teaching',
            starts_at: '09:10',
            ends_at: '10:05'
          },
          {
            key: 'B1',
            position: 3,
            type: 'break',
            starts_at: '10:05',
            ends_at: '10:25'
          }
        ],
        sessions: [
          {
            teacher_source_code: 'ABS',
            weekday: 0,
            period_key: 'P1',
            type: 'class',
            subject: 'Matemáticas',
            group: '1ESO',
            room: 'A-101'
          },
          {
            teacher_source_code: 'ABS',
            weekday: 0,
            period_key: 'P2',
            type: 'class',
            subject: 'Matemáticas',
            group: '1ESO',
            room: 'A-102'
          },
          {
            teacher_source_code: 'LEGACY',
            weekday: 0,
            period_key: 'P1',
            type: 'class',
            subject: 'Lengua',
            group: '2ESO',
            room: 'L-101'
          },
          {
            teacher_source_code: 'LEGACY',
            weekday: 0,
            period_key: 'P2',
            type: 'class',
            subject: 'Lengua',
            group: '2ESO',
            room: 'L-102'
          },
          ...['G1', 'G2', 'G3', 'G4'].flatMap(code => [
            {
              teacher_source_code: code,
              weekday: 0,
              period_key: 'P1',
              type: 'guardia'
            },
            {
              teacher_source_code: code,
              weekday: 0,
              period_key: 'P2',
              type: 'guardia'
            }
          ])
        ]
      });

      await activateScheduleDataset(db, imported.datasetId);
    } finally {
      await db.close();
    }

    await seedIndividualUser(environment.dbPath, {
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      roles: ['admin']
    });

    const admin = await loginIndividual(
      server.baseUrl,
      ADMIN_USER,
      ADMIN_PASSWORD
    );

    assert.equal(admin.response.status, 200);

    return {
      environment,
      server,
      admin
    };
  } catch (error) {
    await stopServer(server);
    cleanupTestEnvironment(environment);
    throw error;
  }
}

function futureEntry({
  id,
  profesor = 'Teacher ABS',
  sourceCode = 'ABS',
  status = 'pending',
  date = '2026-09-14',
  hours = [1, 2]
}) {
  return {
    id,
    profesor,
    sourceCode,
    date,
    note: 'Prueba automática',
    hours,
    status,
    reviewedAt:
      status === 'pending'
        ? ''
        : '2026-09-13T10:00:00.000Z',
    reviewerNote: '',
    appliedAt:
      status === 'applied'
        ? '2026-09-13T10:05:00.000Z'
        : '',
    createdAt: '2026-09-13T09:00:00.000Z'
  };
}

function coverageRows(
  profesor = 'Teacher ABS',
  guards = ['Teacher G1', 'Teacher G2'],
  rooms = ['A-101', 'A-102']
) {
  return [
    {
      dia: 0,
      hora: 1,
      ausente: profesor,
      guardia: guards[0],
      aula: rooms[0],
      faena: false,
      obs: ''
    },
    {
      dia: 0,
      hora: 2,
      ausente: profesor,
      guardia: guards[1],
      aula: rooms[1],
      faena: false,
      obs: ''
    }
  ];
}

async function writeFutureRows(dbPath, rows) {
  const db = await openDatabase(dbPath);

  try {
    await db.run(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ('teacher_future_absences', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE
       SET value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(rows)]
    );
  } finally {
    await db.close();
  }
}

async function readFutureRows(dbPath) {
  const db = await openDatabase(dbPath);

  try {
    const row = await db.get(
      `SELECT value
       FROM app_state
       WHERE key = 'teacher_future_absences'`
    );

    return row?.value ? JSON.parse(row.value) : [];
  } finally {
    await db.close();
  }
}

async function readOperationalAbsences(dbPath, profesor) {
  const db = await openDatabase(dbPath);

  try {
    return db.all(
      `SELECT *
       FROM ausencias
       WHERE ausente = ?
       ORDER BY hora, id`,
      [profesor]
    );
  } finally {
    await db.close();
  }
}

function adminWrite(f, pathname, method, body) {
  return request(
    f.server.baseUrl,
    pathname,
    {
      method,
      body,
      headers: {
        origin: f.server.baseUrl
      }
    },
    f.admin.jar
  );
}

function createFutureProjectionDomain() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../../js/app/guardias-future-absences.js'
    ),
    'utf8'
  );

  const document = {
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  const window = { document };

  vm.runInNewContext(source, {
    window,
    document,
    console,
    URL,
    Date,
    Math,
    Set,
    Map
  });

  const domain = window.GuardiasFutureAbsences;

  const storage = {
    readJson(_key, fallback) {
      return fallback;
    },
    writeJson() {},
    hasBackend() {
      return false;
    }
  };

  domain.init({
    storage,
    getAulaProfesor: (_profesor, _dia, hora) =>
      hora === 1 ? 'A-101' : 'A-102',
    assignGuardiasForRows: rows =>
      rows.map((row, index) => ({
        ...row,
        guardia:
          index === 0
            ? 'Teacher G1'
            : 'Teacher G2'
      })),
    getHorasLectivasProfesorDia: () => [1, 2],
    getVisibleTeacherName: value => value,
    resolveTeacherCanonicalName: value => value,
    clearSuperAdminError() {},
    setSuperAdminError() {},
    pushSuperAdminEvent() {},
    renderSuperAdminMonitor() {}
  }, {
    loadFromLocalCache: false,
    renderOnInit: false,
    bindDom: false
  });

  return {
    domain,
    source
  };
}

module.exports = [
  {
    name: 'future absence applied state cannot be forged and pending rows cannot be applied',
    async fn() {
      const f = await fixture();

      try {
        const pending = futureEntry({
          id: 'future-pending'
        });

        await writeFutureRows(
          f.environment.dbPath,
          [pending]
        );

        const forged = await adminWrite(
          f,
          `/api/profesorado/future-absences/${pending.id}`,
          'PUT',
          {
            ...pending,
            status: 'applied',
            appliedAt: '2026-09-14T07:00:00.000Z'
          }
        );

        assert.equal(forged.response.status, 409);

        let futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(futureRows.length, 1);
        assert.equal(futureRows[0].status, 'pending');
        assert.equal(futureRows[0].appliedAt, '');

        const prematureApply = await adminWrite(
          f,
          `/api/profesorado/future-absences/${pending.id}/apply`,
          'POST',
          { rows: coverageRows() }
        );

        assert.equal(prematureApply.response.status, 409);

        const operational = await readOperationalAbsences(
          f.environment.dbPath,
          'Teacher ABS'
        );

        assert.equal(operational.length, 0);

        futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(futureRows[0].status, 'pending');
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'approved future absence materializes before applied state and retries are idempotent including legacy repair',
    async fn() {
      const f = await fixture();

      try {
        const approved = futureEntry({
          id: 'future-approved',
          status: 'approved'
        });

        await writeFutureRows(
          f.environment.dbPath,
          [approved]
        );

        const rows = coverageRows();

        const first = await adminWrite(
          f,
          `/api/profesorado/future-absences/${approved.id}/apply`,
          'POST',
          { rows }
        );

        assert.equal(first.response.status, 200);
        assert.equal(first.body.ok, true);
        assert.equal(first.body.repaired, false);
        assert.equal(first.body.entry.status, 'applied');
        assert.ok(first.body.entry.appliedAt);
        assert.equal(first.body.rows.length, 2);

        let operational = await readOperationalAbsences(
          f.environment.dbPath,
          'Teacher ABS'
        );

        assert.equal(operational.length, 2);

        assert.deepEqual(
          operational.map(row => [
            Number(row.hora),
            row.guardia
          ]),
          [
            [1, 'Teacher G1'],
            [2, 'Teacher G2']
          ]
        );

        let futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(futureRows[0].status, 'applied');
        assert.ok(futureRows[0].appliedAt);

        const appliedAt = futureRows[0].appliedAt;

        const retry = await adminWrite(
          f,
          `/api/profesorado/future-absences/${approved.id}/apply`,
          'POST',
          { rows }
        );

        assert.equal(retry.response.status, 200);
        assert.equal(retry.body.ok, true);
        assert.equal(retry.body.repaired, true);

        operational = await readOperationalAbsences(
          f.environment.dbPath,
          'Teacher ABS'
        );

        assert.equal(operational.length, 2);

        futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(futureRows[0].appliedAt, appliedAt);

        const legacyBroken = futureEntry({
          id: 'future-legacy-broken',
          profesor: 'Teacher LEGACY',
          sourceCode: 'LEGACY',
          status: 'applied'
        });

        await writeFutureRows(
          f.environment.dbPath,
          [
            ...futureRows,
            legacyBroken
          ]
        );

        assert.equal(
          (
            await readOperationalAbsences(
              f.environment.dbPath,
              'Teacher LEGACY'
            )
          ).length,
          0
        );

        const repaired = await adminWrite(
          f,
          `/api/profesorado/future-absences/${legacyBroken.id}/apply`,
          'POST',
          {
            rows: coverageRows(
              'Teacher LEGACY',
              ['Teacher G3', 'Teacher G4'],
              ['L-101', 'L-102']
            )
          }
        );

        assert.equal(repaired.response.status, 200);
        assert.equal(repaired.body.ok, true);
        assert.equal(repaired.body.repaired, true);
        assert.equal(repaired.body.entry.status, 'applied');

        const repairedRows =
          await readOperationalAbsences(
            f.environment.dbPath,
            'Teacher LEGACY'
          );

        assert.equal(repairedRows.length, 2);

        assert.deepEqual(
          repairedRows.map(row => [
            Number(row.hora),
            row.guardia
          ]),
          [
            [1, 'Teacher G3'],
            [2, 'Teacher G4']
          ]
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'future absence apply rolls back partial materialization on operational conflict',
    async fn() {
      const f = await fixture();

      try {
        const approved = futureEntry({
          id: 'future-rollback',
          status: 'approved'
        });

        await writeFutureRows(
          f.environment.dbPath,
          [approved]
        );

        const db = await openDatabase(
          f.environment.dbPath
        );

        try {
          await db.run(
            `INSERT INTO ausencias
              (dia, hora, ausente, guardia, aula, faena, obs)
             VALUES (?, ?, ?, ?, ?, 0, '')`,
            [
              0,
              2,
              'Teacher ABS',
              'Teacher G2',
              'A-CONFLICT'
            ]
          );
        } finally {
          await db.close();
        }

        const result = await adminWrite(
          f,
          `/api/profesorado/future-absences/${approved.id}/apply`,
          'POST',
          {}
        );

        assert.equal(result.response.status, 409);

        const operational =
          await readOperationalAbsences(
            f.environment.dbPath,
            'Teacher ABS'
          );

        assert.equal(
          operational.length,
          1,
          'La inserción de la hora 1 debe haberse revertido'
        );

        assert.equal(Number(operational[0].hora), 2);
        assert.equal(
          operational[0].guardia,
          'Teacher G2'
        );

        const futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(futureRows.length, 1);
        assert.equal(
          futureRows[0].status,
          'approved'
        );
        assert.equal(
          futureRows[0].appliedAt,
          ''
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'future absence apply shares inactive-group policy with ordinary absences',
    async fn() {
      const f = await fixture();

      try {
        const approved = futureEntry({
          id: 'future-inactive-group',
          status: 'approved'
        });

        await writeFutureRows(
          f.environment.dbPath,
          [approved]
        );

        const db = await openDatabase(
          f.environment.dbPath
        );

        try {
          await db.run(
            `INSERT INTO grupos_estado
              (grupo, activo, updated_at)
             VALUES ('1ESO', 0, CURRENT_TIMESTAMP)
             ON CONFLICT(grupo) DO UPDATE
             SET activo = 0,
                 updated_at = CURRENT_TIMESTAMP`
          );
        } finally {
          await db.close();
        }

        const result = await adminWrite(
          f,
          `/api/profesorado/future-absences/${approved.id}/apply`,
          'POST',
          { rows: coverageRows() }
        );

        assert.equal(result.response.status, 409);

        assert.equal(
          (
            await readOperationalAbsences(
              f.environment.dbPath,
              'Teacher ABS'
            )
          ).length,
          0
        );

        const futureRows = await readFutureRows(
          f.environment.dbPath
        );

        assert.equal(
          futureRows[0].status,
          'approved'
        );
        assert.equal(
          futureRows[0].appliedAt,
          ''
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  },

  {
    name: 'applied future absences are not projected and frontend apply no longer invokes legacy global reassignment',
    async fn() {
      const {
        domain,
        source
      } = createFutureProjectionDomain();

      const applied = futureEntry({
        id: 'future-projection-applied',
        status: 'applied'
      });

      const weekInfo =
        domain.getSchoolWeekInfoFromDate(
          applied.date
        );

      assert.ok(weekInfo?.weekKey);

      domain.setRows(
        [applied],
        {
          persist: false,
          render: false
        }
      );

      const appliedProjection =
        domain.buildProjectedRowsForWeek(
          weekInfo.weekKey
        );

      assert.equal(
        appliedProjection.length,
        0,
        'Una futura aplicada debe desaparecer de las proyecciones'
      );

      const approved = futureEntry({
        id: 'future-projection-approved',
        status: 'approved'
      });

      domain.setRows(
        [approved],
        {
          persist: false,
          render: false
        }
      );

      const approvedProjection =
        domain.buildProjectedRowsForWeek(
          weekInfo.weekKey
        );

      assert.equal(
        approvedProjection.length,
        2,
        'Una futura validada aún puede mostrar propuesta antes de materializarse'
      );

      assert.doesNotMatch(
        source,
        /callHost\(['"]reassignAllGuardias/
      );

      assert.doesNotMatch(
        source,
        /callHost\(['"]persistGuardias/
      );

      assert.doesNotMatch(
        source,
        /callHost\(['"]syncAdminState/
      );

      const appSource = fs.readFileSync(
        path.join(__dirname, '../../js/app/guardias.js'),
        'utf8'
      );

      const earlyProjectionBinding = appSource.indexOf(
        'buildProjectedRowsForWeek=weekKey=>futureAbsencesDomain.buildProjectedRowsForWeek(weekKey)'
      );

      const earlyApplyBinding = appSource.indexOf(
        'applyApprovedFutureAbsencesForCurrentWeek=()=>futureAbsencesDomain.applyApprovedForCurrentWeek()'
      );

      const initialClockRun = appSource.indexOf(
        'updateClockUi();'
      );

      assert.ok(
        earlyProjectionBinding >= 0,
        'El dominio de futuras debe enlazar la proyección explícitamente'
      );

      assert.ok(
        earlyApplyBinding >= 0,
        'El dominio de futuras debe enlazar la aplicación explícitamente'
      );

      assert.ok(
        initialClockRun >= 0,
        'Debe existir la ejecución inicial de updateClockUi'
      );

      assert.ok(
        earlyProjectionBinding < initialClockRun,
        'La proyección de futuras debe enlazarse antes del primer render'
      );

      assert.ok(
        earlyApplyBinding < initialClockRun,
        'La aplicación de futuras debe enlazarse antes de la primera ejecución del reloj'
      );

      const forbiddenLegacyFutureImplementations = [
        /function\s+buildProjectedRowsForWeek\s*\(/,
        /function\s+isFutureAbsenceProjected\s*\(/,
        /async\s+function\s+applyApprovedFutureAbsencesForCurrentWeek\s*\(/,
        /async\s+function\s+updateTeacherFutureAbsenceEntry\s*\(/,
        /async\s+function\s+createTeacherFutureAbsenceEntry\s*\(/,
        /async\s+function\s+deleteTeacherFutureAbsenceEntry\s*\(/,
        /function\s+renderFutureAbsenceAdminList\s*\(/,
        /function\s+renderTeacherFutureAbsenceOwnList\s*\(/,
        /function\s+getTeacherFutureAbsenceStats\s*\(/
      ];

      forbiddenLegacyFutureImplementations.forEach(pattern => {
        assert.doesNotMatch(
          appSource,
          pattern,
          `guardias.js must not reintroduce legacy future-absence implementation: ${pattern}`
        );
      });
    }
  },

  {
    name: 'approved future absence outside current operational week cannot be materialized',
    async fn() {
      const f = await fixture();

      try {
        /*
         * Calculamos el lunes siguiente a la semana operacional real
         * para que el test no dependa de una fecha fija.
         */
        const {
          getCurrentSchoolWeekKey
        } = require('../db');

        const currentMonday = new Date(
          `${getCurrentSchoolWeekKey()}T00:00:00.000Z`
        );

        currentMonday.setUTCDate(
          currentMonday.getUTCDate() + 7
        );

        const nextMonday =
          currentMonday.toISOString().slice(0, 10);

        const approved = futureEntry({
          id: 'future-next-operational-week',
          status: 'approved',
          date: nextMonday,
          hours: [1, 2]
        });

        await writeFutureRows(
          f.environment.dbPath,
          [approved]
        );

        const result = await adminWrite(
          f,
          `/api/profesorado/future-absences/${approved.id}/apply`,
          'POST',
          {}
        );

        assert.equal(
          result.response.status,
          409,
          'Una ausencia de otra semana no puede materializarse todavía'
        );

        const operational =
          await readOperationalAbsences(
            f.environment.dbPath,
            'Teacher ABS'
          );

        assert.equal(
          operational.length,
          0,
          'Aplicar una ausencia futura no debe contaminar la semana operacional'
        );

        const futureRows =
          await readFutureRows(
            f.environment.dbPath
          );

        const stored = futureRows.find(
          row => row.id === approved.id
        );

        assert.ok(
          stored,
          'La ausencia futura debe seguir almacenada'
        );

        assert.equal(
          stored.status,
          'approved',
          'La ausencia debe seguir validada, no applied'
        );

        assert.equal(
          stored.appliedAt,
          '',
          'No debe registrarse appliedAt antes de su semana operacional'
        );
      } finally {
        await stopServer(f.server);
        cleanupTestEnvironment(f.environment);
      }
    }
  }

];
