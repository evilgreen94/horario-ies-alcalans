const assert = require('node:assert/strict');
const {
  cleanupTestEnvironment,
  createTestEnvironment,
  login,
  loginIndividual,
  openDatabase,
  request,
  startServer,
  stopServer
} = require('./helpers/integration-harness');

function fixedJar(cookie) {
  return { value: () => cookie, update() {} };
}

module.exports = [{
  name: 'Superadmin manages credentials securely while teacher escalation and stale sessions are rejected',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const superLogin = await login(server.baseUrl, 'superadmin', 'Super-integration-2026');
      assert.equal(superLogin.response.status, 200);
      const origin = { origin: server.baseUrl };

      const created = await request(server.baseUrl, '/api/users', {
        method: 'POST', headers: origin,
        body: { username: 'teacher.security', displayName: 'Teacher Security', roles: ['teacher'] }
      }, superLogin.jar);
      assert.equal(created.response.status, 201);
      const teacherId = created.body.user.id;
      const firstTemporaryPassword = created.body.temporaryPassword;
      assert.ok(firstTemporaryPassword.length >= 20);
      assert.equal('passwordHash' in created.body.user, false);
      assert.equal(created.body.shownOnce, true);

      const teacherLogin = await loginIndividual(server.baseUrl, 'teacher.security', firstTemporaryPassword, {
        roles: ['superadmin'], role: 'superadmin', sourceCode: 'RMLL', userId: 1
      });
      assert.equal(teacherLogin.response.status, 200);
      assert.equal(teacherLogin.body.role, 'teacher');
      assert.equal(teacherLogin.body.mustChangePassword, true);
      const initialCookie = teacherLogin.jar.value();

      const forced = await request(server.baseUrl, '/api/schedule/me', {}, teacherLogin.jar);
      assert.equal(forced.response.status, 403);
      assert.equal(forced.body.code, 'PASSWORD_CHANGE_REQUIRED');
      const teacherListAttempt = await request(server.baseUrl, '/api/users', {}, teacherLogin.jar);
      assert.equal(teacherListAttempt.response.status, 403);

      const changed = await request(server.baseUrl, '/api/auth/change-password', {
        method: 'POST', body: { currentPassword: firstTemporaryPassword, newPassword: 'Private-teacher-2026!' }
      }, teacherLogin.jar);
      assert.equal(changed.response.status, 200);
      assert.notEqual(teacherLogin.jar.value(), initialCookie);
      const staleAfterChange = await request(server.baseUrl, '/api/auth/session', {}, fixedJar(initialCookie));
      assert.equal(staleAfterChange.body.authenticated, false);

      const activationAttempt = await request(server.baseUrl, '/api/schedule/datasets/1/activate', {
        method: 'POST', headers: origin, body: { roles: ['superadmin'] }
      }, teacherLogin.jar);
      assert.equal(activationAttempt.response.status, 403);
      const resetAttempt = await request(server.baseUrl, `/api/users/${teacherId}/reset-password`, {
        method: 'POST', headers: origin, body: { confirm: true, roles: ['superadmin'] }
      }, teacherLogin.jar);
      assert.equal(resetAttempt.response.status, 403);

      const beforeResetCookie = teacherLogin.jar.value();
      const reset = await request(server.baseUrl, `/api/users/${teacherId}/reset-password`, {
        method: 'POST', headers: origin, body: { confirm: true }
      }, superLogin.jar);
      assert.equal(reset.response.status, 200);
      assert.equal(reset.body.shownOnce, true);
      assert.notEqual(reset.body.temporaryPassword, firstTemporaryPassword);
      const staleAfterReset = await request(server.baseUrl, '/api/auth/session', {}, fixedJar(beforeResetCookie));
      assert.equal(staleAfterReset.body.authenticated, false);

      const relogin = await loginIndividual(server.baseUrl, 'teacher.security', reset.body.temporaryPassword);
      assert.equal(relogin.body.mustChangePassword, true);
      const revokedCookie = relogin.jar.value();
      const revoked = await request(server.baseUrl, `/api/users/${teacherId}/revoke-sessions`, {
        method: 'POST', headers: origin, body: { confirm: true }
      }, superLogin.jar);
      assert.equal(revoked.response.status, 200);
      const staleAfterRevoke = await request(server.baseUrl, '/api/auth/session', {}, fixedJar(revokedCookie));
      assert.equal(staleAfterRevoke.body.authenticated, false);

      const createdSuper = await request(server.baseUrl, '/api/users', {
        method: 'POST', headers: origin,
        body: { username: 'only.individual.super', displayName: 'Only Individual Super', roles: ['superadmin'] }
      }, superLogin.jar);
      assert.equal(createdSuper.response.status, 201);
      const individualSuperLogin = await loginIndividual(
        server.baseUrl,
        'only.individual.super',
        createdSuper.body.temporaryPassword
      );
      assert.equal(individualSuperLogin.response.status, 200);
      const individualSuperChanged = await request(server.baseUrl, '/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: createdSuper.body.temporaryPassword,
          newPassword: 'Private-superadmin-2026!'
        }
      }, individualSuperLogin.jar);
      assert.equal(individualSuperChanged.response.status, 200);
      const timetableMutation = await request(server.baseUrl, '/api/guardias', {
        method: 'POST', headers: origin,
        body: { dia: 'Lunes', hora: 1, ausente: 'RMLL', roles: ['admin'] }
      }, individualSuperLogin.jar);
      assert.equal(timetableMutation.response.status, 403);
      const lastSuperGuard = await request(server.baseUrl, `/api/users/${createdSuper.body.user.id}/roles`, {
        method: 'PUT', headers: origin, body: { confirm: true, roles: ['teacher'] }
      }, superLogin.jar);
      assert.equal(lastSuperGuard.response.status, 409);

      const disabled = await request(server.baseUrl, `/api/users/${teacherId}/status`, {
        method: 'PUT', headers: origin, body: { confirm: true, active: false }
      }, superLogin.jar);
      assert.equal(disabled.response.status, 200);
      const disabledLogin = await loginIndividual(server.baseUrl, 'teacher.security', 'Private-teacher-2026!');
      assert.equal(disabledLogin.response.status, 401);

      const db = await openDatabase(environment.dbPath);
      try {
        const row = await db.get('SELECT password_hash, password_salt, must_change_password FROM users WHERE id = ?', [teacherId]);
        assert.notEqual(row.password_hash, firstTemporaryPassword);
        assert.notEqual(row.password_salt, firstTemporaryPassword);
        const audit = JSON.stringify(await db.all("SELECT action, details_json FROM audit_log WHERE action LIKE 'security.%'"));
        assert.equal(audit.includes(firstTemporaryPassword), false);
        assert.equal(audit.includes(reset.body.temporaryPassword), false);
      } finally { await db.close(); }
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
