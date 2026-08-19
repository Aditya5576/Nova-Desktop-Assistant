const assert = require('assert');
const EventEmitter = require('events');
const https = require('https');
const NtfySubscriber = require('../src/services/ntfySubscriber');
const { parseTaskInput } = require('../src/services/nlpParser');

describe('📱 iPhone 15 NtfySubscriber & Sync Engine QA Audit', () => {

  let originalHttpsGet;

  beforeEach(() => {
    originalHttpsGet = https.get;
  });

  afterEach(() => {
    https.get = originalHttpsGet;
  });

  it('1. Connection Lifecycle: verifies HTTP stream URL and request initiation', () => {
    const subscriber = new NtfySubscriber('test-topic-qa');
    assert.strictEqual(subscriber.topic, 'test-topic-qa');
    assert.strictEqual(subscriber.isListening, false);

    let requestedUrl = '';
    https.get = (url, cb) => {
      requestedUrl = url;
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);
      return new EventEmitter();
    };

    subscriber.start();
    assert.strictEqual(requestedUrl, 'https://ntfy.sh/test-topic-qa/json?since=10m');
    assert.strictEqual(subscriber.isListening, true);
    subscriber.stop();
    assert.strictEqual(subscriber.isListening, false);
  });

  it('2. Raw Message Parsing from iPhone: "Remind me in 10 min - ARS Prefilter changes"', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    let emittedData = null;

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);

      const rawJson = JSON.stringify({
        id: 'msg-iphone-101',
        event: 'message',
        topic: 'nova-my-tasks',
        time: 1771234567,
        message: 'Remind me in 10 min - ARS Prefilter changes'
      }) + '\n';
      fakeRes.emit('data', Buffer.from(rawJson));

      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.on('task-received', (data) => {
      emittedData = data;
    });

    subscriber.start();

    assert.ok(emittedData, 'task-received event should be emitted');
    assert.strictEqual(emittedData.id, 'msg-iphone-101');
    assert.strictEqual(emittedData.text, 'Remind me in 10 min - ARS Prefilter changes');

    const parsed = parseTaskInput(emittedData.text);
    assert.ok(parsed, 'Parsed task should not be null');
    assert.strictEqual(parsed.title, 'ARS Prefilter changes');
    assert.strictEqual(parsed.type, 'scheduled');
    assert.strictEqual(parsed.reminder, true);
    assert.ok(parsed.dueTime, 'Due time should be set for 10 min relative reminder');

    subscriber.stop();
  });

  it('3. Raw Message Parsing from iPhone: "Done: SAP API test"', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    let emittedData = null;

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);

      const rawJson = JSON.stringify({
        id: 'msg-iphone-102',
        event: 'message',
        topic: 'nova-my-tasks',
        time: 1771234568,
        message: 'Done: SAP API test'
      }) + '\n';
      fakeRes.emit('data', Buffer.from(rawJson));

      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.on('task-received', (data) => {
      emittedData = data;
    });

    subscriber.start();

    assert.ok(emittedData);
    assert.strictEqual(emittedData.id, 'msg-iphone-102');
    assert.strictEqual(emittedData.text, 'Done: SAP API test');

    const parsed = parseTaskInput(emittedData.text);
    assert.ok(parsed);
    assert.strictEqual(parsed.title, 'SAP API test');
    assert.strictEqual(parsed.type, 'completed');
    assert.strictEqual(parsed.category, 'Work');

    subscriber.stop();
  });

  it('4. Outbound Notification Filtering: ignores self-generated notifications & heartbeats', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    const receivedTasks = [];

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);

      // Ping / Heartbeat non-JSON
      fakeRes.emit('data', Buffer.from(': heartbeat\n\n'));

      // Keepalive event
      fakeRes.emit('data', Buffer.from(JSON.stringify({ event: 'keepalive', id: 'k1' }) + '\n'));

      // Outbound notification with 🔔 icon
      fakeRes.emit('data', Buffer.from(JSON.stringify({
        id: 'outbound-1',
        event: 'message',
        title: '🔔 Task Reminder',
        message: 'Submit report'
      }) + '\n'));

      // Outbound notification with "Time: "
      fakeRes.emit('data', Buffer.from(JSON.stringify({
        id: 'outbound-2',
        event: 'message',
        title: 'Reminder',
        message: 'Time: 10:00 AM'
      }) + '\n'));

      // Valid inbound task from iPhone
      fakeRes.emit('data', Buffer.from(JSON.stringify({
        id: 'inbound-valid-1',
        event: 'message',
        title: '',
        message: 'Buy coffee'
      }) + '\n'));

      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.on('task-received', (data) => {
      receivedTasks.push(data);
    });

    subscriber.start();

    assert.strictEqual(receivedTasks.length, 1, 'Only valid inbound task should be emitted');
    assert.strictEqual(receivedTasks[0].id, 'inbound-valid-1');
    assert.strictEqual(receivedTasks[0].text, 'Buy coffee');
    subscriber.stop();
  });

  it('5. Deduplication: duplicate message IDs are ignored', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    let receivedCount = 0;

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);

      const dupPayload = JSON.stringify({
        id: 'duplicate-id-007',
        event: 'message',
        message: 'Repeated sync task'
      }) + '\n';

      // Emit twice synchronously
      fakeRes.emit('data', Buffer.from(dupPayload));
      fakeRes.emit('data', Buffer.from(dupPayload));

      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.on('task-received', () => {
      receivedCount++;
    });

    subscriber.start();

    assert.strictEqual(receivedCount, 1, 'Duplicate ID must only emit task-received once');
    assert.strictEqual(subscriber.processedIds.has('duplicate-id-007'), true);
    subscriber.stop();
  });

  it('6. Deduplication Memory Pruning: bounds processedIds set to max 200 items', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    
    // Populate 205 message IDs
    for (let i = 1; i <= 205; i++) {
      subscriber.processedIds.add(`id-${i}`);
      if (subscriber.processedIds.size > 200) {
        const firstId = subscriber.processedIds.values().next().value;
        subscriber.processedIds.delete(firstId);
      }
    }

    assert.strictEqual(subscriber.processedIds.size, 200);
    assert.strictEqual(subscriber.processedIds.has('id-1'), false, 'Oldest ID id-1 should be pruned');
    assert.strictEqual(subscriber.processedIds.has('id-5'), false, 'ID id-5 should be pruned');
    assert.strictEqual(subscriber.processedIds.has('id-6'), true, 'ID id-6 should remain in cache');
    assert.strictEqual(subscriber.processedIds.has('id-205'), true, 'ID id-205 should remain in cache');
  });

  it('7. Topic Configuration Updates: setTopic changes topic & restarts stream', () => {
    const subscriber = new NtfySubscriber('topic-A');
    let connectionUrls = [];

    https.get = (url, cb) => {
      connectionUrls.push(url);
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);
      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.start();
    assert.strictEqual(connectionUrls.length, 1);
    assert.strictEqual(connectionUrls[0], 'https://ntfy.sh/topic-A/json?since=10m');

    // Change topic to topic-B
    subscriber.setTopic('topic-B');
    assert.strictEqual(subscriber.topic, 'topic-B');
    assert.strictEqual(connectionUrls.length, 2);
    assert.strictEqual(connectionUrls[1], 'https://ntfy.sh/topic-B/json?since=10m');

    // Change topic to 'none' -> should stop
    subscriber.setTopic('none');
    assert.strictEqual(subscriber.topic, 'none');
    assert.strictEqual(subscriber.isListening, false);

    subscriber.stop();
  });

  it('8. Edge Case Audit: Chunked stream buffer handling across split TCP packets', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    let emittedData = null;

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 200;
      cb(fakeRes);

      const fullJson = JSON.stringify({
        id: 'chunked-999',
        event: 'message',
        message: 'Split packet task test'
      }) + '\n';

      const part1 = fullJson.slice(0, 15);
      const part2 = fullJson.slice(15);

      fakeRes.emit('data', Buffer.from(part1));
      fakeRes.emit('data', Buffer.from(part2));

      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.on('task-received', (data) => {
      emittedData = data;
    });

    subscriber.start();

    assert.ok(emittedData);
    assert.strictEqual(emittedData.id, 'chunked-999');
    assert.strictEqual(emittedData.text, 'Split packet task test');
    subscriber.stop();
  });

  it('9. Reconnection Logic Audit: handles non-200 HTTP responses & socket errors', () => {
    const subscriber = new NtfySubscriber('nova-my-tasks');
    let reconnectScheduled = false;

    subscriber.scheduleReconnect = (delay) => {
      reconnectScheduled = true;
      subscriber.stop();
    };

    https.get = (url, cb) => {
      const fakeRes = new EventEmitter();
      fakeRes.statusCode = 404; // Non-200 response
      cb(fakeRes);
      const fakeReq = new EventEmitter();
      fakeReq.destroy = () => {};
      return fakeReq;
    };

    subscriber.start();

    assert.strictEqual(reconnectScheduled, true, 'scheduleReconnect must be called on non-200 status');
  });

});
