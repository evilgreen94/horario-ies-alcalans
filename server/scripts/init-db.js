const { DB_PATH, initializeDatabase } = require('../db');

initializeDatabase()
  .then(() => {
    console.log(`Database initialized at ${DB_PATH}`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
