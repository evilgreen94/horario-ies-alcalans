const assert = require('assert');
const {
  cleanupTestEnvironment, createTestEnvironment, startServer, stopServer
} = require('./helpers/integration-harness');

module.exports = [{
  name: 'malformed JSON never copies credential-bearing request bodies into server logs',
  async fn() {
    const environment = createTestEnvironment();
    let server;
    try {
      server = await startServer({ dbPath: environment.dbPath });
      const marker = 'DO_NOT_LOG_PASSWORD_MARKER_2026';
      const response = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"username":"test","password":"${marker}" broken`
      });
      assert.strictEqual(response.status, 400);
      assert.strictEqual((await response.json()).error, 'JSON inválido.');
      await new Promise(resolve => setTimeout(resolve, 25));
      assert.strictEqual(server.output.join('').includes(marker), false);
    } finally {
      await stopServer(server).catch(() => {});
      cleanupTestEnvironment(environment);
    }
  }
}];
