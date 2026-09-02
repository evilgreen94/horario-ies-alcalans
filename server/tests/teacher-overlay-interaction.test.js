const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.join(__dirname, '..', '..');

function getBackdropHandler() {
  const html = fs.readFileSync(path.join(projectRoot, 'guardias.html'), 'utf8');
  const overlay = html.match(/<div class="overlay" id="teacherOverlay" onclick="([^"]+)">/);
  assert.ok(overlay, 'teacherOverlay must declare a backdrop click handler');
  return overlay[1];
}

function getProductionHandlerSource() {
  const source = fs.readFileSync(path.join(projectRoot, 'js', 'app', 'guardias.js'), 'utf8');
  const handler = source.match(/function bgTeacherClose\(event\)\{[^{}]+\}/);
  assert.ok(handler, 'guardias.js must define bgTeacherClose');
  return handler[0];
}

function runClick(targetId) {
  let closeCalls = 0;
  const context = {
    event: { target: { id: targetId } },
    closeTeacherPanel() {
      closeCalls += 1;
    }
  };
  vm.runInNewContext(`${getProductionHandlerSource()}; ${getBackdropHandler()}`, context);
  return closeCalls;
}

module.exports = [
  {
    name: 'teacher panel closes only when clicking its backdrop',
    fn() {
      assert.strictEqual(runClick('teacherOverlay'), 1);
      assert.strictEqual(runClick('teacherSessions'), 0);
    }
  }
];
