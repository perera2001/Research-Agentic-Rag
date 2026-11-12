const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./src/app');
const { checkDatabaseConnection } = require('./src/config/db');
const { resumeDocumentJobs } = require('./src/modules/documents/document.jobs');
const port = Number(process.env.PORT) || 5000;

app.listen(port, '0.0.0.0', () => {
  console.log(`ResearchMind backend listening on port ${port}`);
});

async function initializeDocuments() {
  try {
    await checkDatabaseConnection();
    console.log('Database connection available');
    await resumeDocumentJobs();
  } catch (_error) {
    console.error('Database or document recovery unavailable. Check MySQL and the schema.');
    const retry = setTimeout(initializeDocuments, 30000);
    retry.unref();
  }
}

initializeDocuments();
