const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDiscoveryHarness() {
  const runtime = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app', 'guardias.js'), 'utf8');
  const start = runtime.indexOf("const SUPERADMIN_DISCOVERY_STORAGE_KEY=");
  const end = runtime.indexOf('const teacherState=', start);
  assert.ok(start >= 0 && end > start, 'ARGOS discovery runtime block is missing');

  let now = 1000;
  const values = new Map();
  const context = {
    Date: { now: () => now },
    window: {
      sessionStorage: {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
      }
    },
    refreshCount: 0
  };
  vm.createContext(context);
  vm.runInContext(`
    let currentAuthSession=null;
    let canSuperAdmin=false;
    function refreshAccessUi(){refreshCount+=1;}
    ${runtime.slice(start, end)}
    globalThis.discoveryTestApi={
      setSession(session,allowed){currentAuthSession=session;canSuperAdmin=allowed;},
      activate:recordArgosDiscoveryActivation,
      restore:restoreSuperAdminDiscovery,
      clear:clearSuperAdminDiscovery,
      discovered:()=>superAdminAccessDiscovered,
      count:()=>superAdminDiscoveryCount
    };
  `, context);

  return {
    api: context.discoveryTestApi,
    values,
    refreshCount: () => context.refreshCount,
    setNow: value => { now = value; }
  };
}

module.exports = [{
  name: 'ARGOS discovery requires seven timely activations by the authenticated superadmin and clears safely',
  fn() {
    const harness = createDiscoveryHarness();
    const { api } = harness;

    api.setSession({ authenticated: true, userId: 10, roles: ['teacher'] }, false);
    for (let index = 0; index < 7; index += 1) assert.equal(api.activate(), false);
    assert.equal(api.discovered(), false);
    assert.equal(harness.values.size, 0);

    api.setSession({ authenticated: true, userId: 20, roles: ['admin'] }, false);
    for (let index = 0; index < 7; index += 1) assert.equal(api.activate(), false);
    assert.equal(api.discovered(), false);

    api.setSession({ authenticated: true, userId: 30, roles: ['superadmin'] }, true);
    for (let index = 0; index < 6; index += 1) assert.equal(api.activate(), false);
    assert.equal(api.count(), 6);
    assert.equal(api.activate(), true);
    assert.equal(api.discovered(), true);
    assert.equal(harness.refreshCount(), 1);
    assert.equal([...harness.values.values()][0], '30');

    api.setSession({ authenticated: true, userId: 30, roles: ['teacher', 'superadmin'] }, true);
    api.restore();
    assert.equal(api.discovered(), true);

    api.setSession({ authenticated: true, userId: 31, roles: ['superadmin'] }, true);
    api.restore();
    assert.equal(api.discovered(), false);
    assert.equal(harness.values.size, 0);

    api.setSession({ authenticated: true, userId: 31, roles: ['admin', 'superadmin'] }, true);
    harness.setNow(2000);
    for (let index = 0; index < 3; index += 1) api.activate();
    harness.setNow(8001);
    assert.equal(api.activate(), false);
    assert.equal(api.count(), 1);

    api.clear();
    assert.equal(api.discovered(), false);
    assert.equal(api.count(), 0);
    assert.equal(harness.values.size, 0);
  }
}];
