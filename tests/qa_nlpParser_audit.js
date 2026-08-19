const { parseTaskInput } = require('../src/services/nlpParser');

console.log('====================================================');
console.log('      NOVA NLP PARSER COMPREHENSIVE QA AUDIT        ');
console.log('====================================================\n');

const currentLocalTime = new Date();
console.log(`Current Local Execution Time: ${currentLocalTime.toISOString()} (${currentLocalTime.toString()})\n`);

const testGroups = [
  {
    name: '1. Relative Times',
    cases: [
      'in 10 sec',
      'in 5 min',
      'in 1.5 hours',
      '3 sec',
      'Remind me in 10 sec to check oven',
      'Call mom in 1.5 hours'
    ]
  },
  {
    name: '2. Absolute Times & Dates',
    cases: [
      'at 4:30pm',
      'tomorrow at 10am',
      'day after tomorrow at 3pm',
      'next Monday at 11am',
      'Doctor appointment tomorrow at 10am',
      'Team sync next Monday at 11am'
    ]
  },
  {
    name: '3. Conversational Phrasing',
    cases: [
      'can you add a task to buy groceries',
      'hey please add a task to call Sathwik',
      'what is quantum computing?',
      'explain artificial intelligence',
      'please remind me to pay electric bill'
    ]
  },
  {
    name: '4. Categories & Priorities & Recurring',
    cases: [
      '#Work',
      '#Personal',
      '🔴 Urgent',
      'P1',
      'every day',
      'Finish quarterly presentation #Work',
      'Buy groceries #Personal',
      'Server outage 🔴 Urgent',
      'Fix security patch P1',
      'Drink 8 glasses of water every day'
    ]
  }
];

const results = [];

testGroups.forEach(group => {
  console.log(`--- ${group.name} ---`);
  group.cases.forEach(input => {
    const res = parseTaskInput(input);
    results.push({ group: group.name, input, res });
    if (res === null) {
      console.log(`Input : "${input}"`);
      console.log(`Result: [NULL] (Routed to Conversational AI / Non-Task)`);
    } else {
      console.log(`Input : "${input}"`);
      console.log(`Parsed: Title="${res.title}" | Type=${res.type} | Cat=${res.category} | Prio=${res.priority} | Rec=${res.recurring} | Date=${res.dueDate} | Time=${res.dueTime}`);
    }
    console.log('');
  });
});

console.log('====================================================');
console.log('               AUDIT SUMMARY COMPLETE               ');
console.log('====================================================');
