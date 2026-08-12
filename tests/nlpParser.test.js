const assert = require('assert');
const { parseTaskInput, getLocalDateString, getLocalTimeStringSec } = require('../src/services/nlpParser');

describe('NLP Parser Unit Test Suite', () => {
  it('should parse relative time with title: "Remind me in 5 minutes to submit report"', () => {
    const res = parseTaskInput('Remind me in 5 minutes to submit report');
    assert(res !== null, 'Parsing result should not be null');
    assert.strictEqual(res.title, 'submit report');
    assert.strictEqual(res.type, 'scheduled');
    assert(res.dueDate, 'dueDate should be set');
    assert(res.dueTime, 'dueTime should be set');
  });

  it('should parse relative time without custom title falling back to "Task Reminder"', () => {
    const res = parseTaskInput('Remind me in 5 minutes');
    assert(res !== null);
    assert.strictEqual(res.title, 'Task Reminder');
    assert.strictEqual(res.type, 'scheduled');
    assert(res.dueTime);
  });

  it('should parse relative time: "Remind me after 30 seconds"', () => {
    const res = parseTaskInput('Remind me after 30 seconds');
    assert(res !== null);
    assert.strictEqual(res.type, 'scheduled');
    assert(res.dueTime);
  });

  it('should parse absolute time: "Remind me tomorrow at 4 PM"', () => {
    const res = parseTaskInput('Remind me tomorrow at 4 PM');
    assert(res !== null);
    assert.strictEqual(res.type, 'scheduled');
    assert(res.dueTime.startsWith('16:00'));
  });

  it('should parse recurring schedule: "Remind me every day at 9 AM"', () => {
    const res = parseTaskInput('Remind me every day at 9 AM');
    assert(res !== null);
    assert.strictEqual(res.recurring, 'daily');
    assert(res.dueTime.startsWith('09:00'));
  });

  it('should return null for conversational non-task queries', () => {
    const res1 = parseTaskInput('What can you do?');
    const res2 = parseTaskInput('Tell me something interesting');
    const res3 = parseTaskInput('Who created you?');

    assert.strictEqual(res1, null, '"What can you do?" should not trigger task creation');
    assert.strictEqual(res2, null, '"Tell me something" should not trigger task creation');
    assert.strictEqual(res3, null, '"Who created you?" should not trigger task creation');
  });

  it('should format local dates correctly', () => {
    const now = new Date();
    const dateStr = getLocalDateString(now);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dateStr), 'Date string should match YYYY-MM-DD');
  });

  it('should format local times with seconds correctly', () => {
    const now = new Date();
    const timeStr = getLocalTimeStringSec(now);
    assert(/^\d{2}:\d{2}:\d{2}$/.test(timeStr), 'Time string should match HH:MM:SS');
  });
});
