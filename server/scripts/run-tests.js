const path = require('path');
const fs = require('fs');

const testsDir = path.join(__dirname, '..', 'tests');
const requestedSuite = process.argv[2] || '';
const suites = fs.readdirSync(testsDir)
  .filter(fileName => fileName.endsWith('.test.js'))
  .filter(fileName => !requestedSuite || fileName === requestedSuite)
  .sort((a, b) => a.localeCompare(b, 'en'))
  .map(fileName => require(path.join(testsDir, fileName)));

async function run() {
  let failures = 0;
  let total = 0;

  for (const suite of suites) {
    for (const testCase of suite) {
      total += 1;
      try {
        await testCase.fn();
        process.stdout.write(`PASS ${testCase.name}\n`);
      } catch (error) {
        failures += 1;
        process.stderr.write(`FAIL ${testCase.name}\n`);
        process.stderr.write(`${error.stack || error.message || String(error)}\n`);
      }
    }
  }

  if (failures) {
    process.stderr.write(`\n${failures} of ${total} tests failed.\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\nAll ${total} tests passed.\n`);
}

run().catch(error => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
