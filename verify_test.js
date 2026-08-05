const DatabaseService = require('./src/services/database');
const { parseTaskInput } = require('./src/services/nlpParser');

const db = new DatabaseService();

const inputs = [
  'remind me in 15 min',
  'remind me tomorrow at 10:00',
  'remind me next Monday at 09:00'
];

async function runTest() {
  console.log('Testing NLP Parsing and Database/Scheduler integration...');
  for (const input of inputs) {
    const parsed = parseTaskInput(input);
    console.log(`\nInput: "${input}"`);
    console.log(`Parsed:`, parsed);
    const addedTask = db.addTask(parsed);
    console.log(`Added Task ID: ${addedTask.id}`);
  }
}

runTest();
