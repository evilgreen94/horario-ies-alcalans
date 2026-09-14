const assert = require('node:assert/strict');
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

const PASSWORD = 'Suggestions-http-2026!';

module.exports = [{
  name: 'suggestions HTTP flow enforces ownership, reviewer roles, safe history and restart persistence',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const teacherId = await seedIndividualUser(environment.dbPath, {
        username: 'suggest.teacher', password: PASSWORD, displayName: 'Teacher Suggest', roles: ['teacher']
      });
      await seedIndividualUser(environment.dbPath, {
        username: 'suggest.other', password: PASSWORD, displayName: 'Other Teacher', roles: ['teacher']
      });
      const adminId = await seedIndividualUser(environment.dbPath, {
        username: 'suggest.admin', password: PASSWORD, displayName: 'Admin Suggest', roles: ['admin']
      });
      const superadminId = await seedIndividualUser(environment.dbPath, {
        username: 'suggest.super', password: PASSWORD, displayName: 'Super Suggest', roles: ['superadmin']
      });
      const teacher = await loginIndividual(server.baseUrl, 'suggest.teacher', PASSWORD);
      const other = await loginIndividual(server.baseUrl, 'suggest.other', PASSWORD);
      const admin = await loginIndividual(server.baseUrl, 'suggest.admin', PASSWORD);
      const superadmin = await loginIndividual(server.baseUrl, 'suggest.super', PASSWORD);
      const write = { Origin: server.baseUrl };
      const valid = { title: 'Mejorar acceso móvil', description: 'Hacer más clara la consulta diaria.', category: 'movil' };

      assert.equal((await request(server.baseUrl, '/api/suggestions', {
        method: 'POST', headers: write, body: valid
      })).response.status, 401);
      assert.equal((await request(server.baseUrl, '/api/suggestions', {
        method: 'POST', headers: write, body: valid
      }, admin.jar)).response.status, 403);
      for (const body of [
        { ...valid, title: '   ' },
        { ...valid, description: '' },
        { ...valid, category: 'inventada' },
        { ...valid, title: 'x'.repeat(121) },
        { ...valid, description: 'x'.repeat(3001) },
        { ...valid, created_by_user_id: adminId },
        { ...valid, status: 'implemented' },
        { ...valid, createdAt: '2000-01-01T00:00:00Z' }
      ]) {
        assert.equal((await request(server.baseUrl, '/api/suggestions', {
          method: 'POST', headers: write, body
        }, teacher.jar)).response.status, 400);
      }

      const createdAtStart = Date.now() - 2000;
      const created = await request(server.baseUrl, '/api/suggestions', {
        method: 'POST', headers: write, body: valid
      }, teacher.jar);
      assert.equal(created.response.status, 201);
      assert.equal(created.body.suggestion.status, 'new');
      assert.equal(created.body.suggestion.title, valid.title);
      assert.ok(Date.parse(`${created.body.suggestion.createdAt}Z`) >= createdAtStart);
      const suggestionId = created.body.suggestion.id;

      const otherCreated = await request(server.baseUrl, '/api/suggestions', {
        method: 'POST', headers: write,
        body: { title: 'Sugerencia ajena', description: 'Solo debe verla su autora.', category: 'otro' }
      }, other.jar);
      assert.equal(otherCreated.response.status, 201);
      const own = await request(server.baseUrl, '/api/suggestions/me', {}, teacher.jar);
      assert.equal(own.response.status, 200);
      assert.deepEqual(own.body.suggestions.map(item => item.id), [suggestionId]);
      assert.equal(Object.hasOwn(own.body.suggestions[0], 'adminNote'), false);
      assert.equal(Object.hasOwn(own.body.suggestions[0], 'author'), false);
      assert.equal((await request(server.baseUrl, `/api/suggestions/${otherCreated.body.suggestion.id}`, {}, teacher.jar)).response.status, 404);
      assert.equal((await request(server.baseUrl, '/api/suggestions', {}, teacher.jar)).response.status, 403);
      assert.equal((await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {
        method: 'PATCH', headers: write, body: { status: 'reviewing' }
      }, teacher.jar)).response.status, 403);

      const adminList = await request(server.baseUrl, '/api/suggestions?status=new', {}, admin.jar);
      assert.equal(adminList.response.status, 200);
      assert.equal(adminList.body.suggestions.length, 2);
      const adminItem = adminList.body.suggestions.find(item => item.id === suggestionId);
      assert.deepEqual(adminItem.author, {
        userId: teacherId, username: 'suggest.teacher', displayName: 'Teacher Suggest', sourceCode: null
      });
      assert.equal((await request(server.baseUrl, '/api/suggestions?q=Teacher%20Suggest', {}, superadmin.jar)).body.suggestions.length, 1);
      assert.equal((await request(server.baseUrl, '/api/suggestions?status=arbitrary', {}, admin.jar)).response.status, 400);
      assert.equal((await request(server.baseUrl, '/api/suggestions?status=new&status=planned', {}, admin.jar)).response.status, 400);
      assert.equal((await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {
        method: 'PATCH', headers: write, body: { status: 'arbitrary' }
      }, admin.jar)).response.status, 400);
      assert.equal((await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {
        method: 'PATCH', headers: write, body: { status: 'reviewing', reviewed_by_user_id: superadminId }
      }, admin.jar)).response.status, 400);

      const reviewed = await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {
        method: 'PATCH', headers: write,
        body: { status: 'reviewing', adminNote: 'Revisar con coordinación.', implementedVersion: '' }
      }, admin.jar);
      assert.equal(reviewed.response.status, 200);
      assert.equal(reviewed.body.suggestion.status, 'reviewing');
      assert.equal(reviewed.body.suggestion.adminNote, 'Revisar con coordinación.');
      assert.equal(reviewed.body.suggestion.reviewer.userId, adminId);
      assert.ok(reviewed.body.suggestion.reviewedAt);

      const teacherDetail = await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {}, teacher.jar);
      assert.equal(teacherDetail.response.status, 200);
      assert.equal(teacherDetail.body.suggestion.status, 'reviewing');
      assert.equal(Object.hasOwn(teacherDetail.body.suggestion, 'adminNote'), false);
      assert.equal(Object.hasOwn(teacherDetail.body.suggestion, 'reviewer'), false);

      const history = await request(server.baseUrl, '/api/historial', {}, admin.jar);
      assert.equal(history.response.status, 200);
      const createdEvent = history.body.find(item => item.action === 'suggestion.created' && item.target.id === String(suggestionId));
      const reviewedEvent = history.body.find(item => item.action === 'suggestion.status_changed' && item.target.id === String(suggestionId));
      assert.equal(createdEvent.actorIdentity.userId, teacherId);
      assert.ok(createdEvent.timestamp);
      assert.equal(reviewedEvent.actorIdentity.userId, adminId);
      assert.equal(reviewedEvent.before.status, 'new');
      assert.equal(reviewedEvent.after.status, 'reviewing');
      assert.equal(JSON.stringify(reviewedEvent).includes('Revisar con coordinación.'), false);

      const implemented = await request(server.baseUrl, `/api/suggestions/${suggestionId}`, {
        method: 'PATCH', headers: write,
        body: { status: 'implemented', implementedVersion: '1.1.0-test' }
      }, superadmin.jar);
      assert.equal(implemented.response.status, 200);
      assert.equal(implemented.body.suggestion.implementedVersion, '1.1.0-test');
      assert.equal(implemented.body.suggestion.reviewer.userId, superadminId);

      const db = await openDatabase(environment.dbPath);
      const stored = await db.get('SELECT * FROM suggestions WHERE id = ?', [suggestionId]);
      assert.equal(stored.created_by_user_id, teacherId);
      assert.equal(stored.reviewed_by_user_id, superadminId);
      assert.equal(stored.status, 'implemented');
      assert.equal(stored.implemented_version, '1.1.0-test');
      assert.ok(stored.created_at);
      assert.ok(stored.updated_at);
      await db.close();

      await stopServer(server);
      server = await startServer({ dbPath: environment.dbPath });
      const teacherAgain = await loginIndividual(server.baseUrl, 'suggest.teacher', PASSWORD);
      const afterRestart = await request(server.baseUrl, '/api/suggestions/me', {}, teacherAgain.jar);
      assert.equal(afterRestart.body.suggestions[0].status, 'implemented');
      assert.equal(afterRestart.body.suggestions[0].implementedVersion, '1.1.0-test');
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
