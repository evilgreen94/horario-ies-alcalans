const path = require('path');
const {
  DEFAULT_SOURCE_PATH,
  OUTPUT_PATH,
  loadJsonSource,
  writeAnnualSourceArtifacts
} = require('../annual-source');

function getRequestedSourcePath() {
  const cliSourceArgIndex = process.argv.findIndex(arg => arg === '--source' || arg === '-s');
  if (cliSourceArgIndex !== -1) {
    const value = process.argv[cliSourceArgIndex + 1];
    if (!value || value.startsWith('-')) {
      throw new Error('Falta el valor de --source.');
    }
    return path.resolve(process.cwd(), value);
  }

  const inlineSourceArg = process.argv.find(arg => arg.startsWith('--source='));
  if (inlineSourceArg) {
    const value = inlineSourceArg.slice('--source='.length);
    if (!value) {
      throw new Error('Falta el valor de --source.');
    }
    return path.resolve(process.cwd(), value);
  }

  return path.resolve(process.cwd(), process.env.ANNUAL_SOURCE_PATH || DEFAULT_SOURCE_PATH);
}

function main() {
  const inputPath = getRequestedSourcePath();
  const parsed = loadJsonSource(inputPath);
  const { payload } = writeAnnualSourceArtifacts(parsed, {
    sourceLabel: path.basename(inputPath)
  });

  console.log('Plantilla anual regenerada correctamente.');
  console.log(`- Fuente anual: ${inputPath}`);
  console.log(`- Destino: ${OUTPUT_PATH}`);
  console.log(`- datasetId: ${payload.datasetId}`);
  console.log(`- Profesores: ${payload.teachers.length}`);
}

main();
