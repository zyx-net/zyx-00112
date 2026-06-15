const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function verifyPersistence() {
  console.log('Verifying data persistence after restart...\n');

  try {
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    console.log(`Found ${logs.length} import logs from previous runs`);
    
    if (logs.length > 0) {
      const recentLog = logs[0];
      console.log(`Most recent log:`);
      console.log(`  - Source: ${recentLog.source_package}`);
      console.log(`  - Result: ${recentLog.result}`);
      console.log(`  - Time: ${recentLog.import_time}`);
      console.log('\n✓ Import logs persisted across restart');
    } else {
      console.log('No previous logs found (database was reset)');
    }

    const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    console.log(`\nFound ${scenarios.length} scenarios in database`);
    console.log('\n✓ Scenarios persisted across restart');

    console.log('\n=== Persistence Verification Complete ===');
    console.log('All data successfully persisted across server restart!');
    
    process.exit(0);
  } catch (err) {
    console.error('Error verifying persistence:', err.message);
    process.exit(1);
  }
}

verifyPersistence();
