const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const { checkDatabaseConnection } = require('./src/config/db');
const port = Number(process.env.PORT) || 5000;

app.listen(port, '0.0.0.0', () => {
  console.log(`ResearchMind backend listening on port ${port}`);
});

checkDatabaseConnection()
  .then(() => console.log('Database connection available'))
  .catch(() => console.error('Database unavailable. Check MySQL and DB_* settings.'));
