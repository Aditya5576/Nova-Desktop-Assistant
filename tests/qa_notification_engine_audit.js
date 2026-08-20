const assert = require('assert');
const EventEmitter = require('events');
const https = require('https');
const NotificationService = require('../src/services/notificationService');
const NtfySubscriber = require('../src/services/ntfySubscriber');
const DatabaseService = require('../src/services/database');

describe('🔔 Nova Notification Engine & Loop Suppression QA Audit', () => {

  describe('1. iOS Push Header Verification (nova_outbound tag)', () => {
    let originalHttpsRequest;

    beforeEach(() => {
      originalHttpsRequest = https.request;
    });

    afterEach(() => {
      https.request = originalHttpsRequest;
    });

    it('should include nova_outbound,bell,alarm_clock tags in iOS push alert headers', (done) => {
      const notifService = new NotificationService();
      // Temporarily override test env check for unit test assertion
      notifService.isTestEnv = false;

      let capturedOptions = null;

      https.request = (options, cb) => {
        capturedOptions = options;
        const fakeReq = new EventEmitter();
        fakeReq.write = () => {};
        fakeReq.end = () => {
          assert.ok(capturedOptions, 'https.request should be called');
          assert.strictEqual(capturedOptions.hostname, 'ntfy.sh');
          assert.strictEqual(capturedOptions.method, 'POST');
          assert.strictEqual(capturedOptions.path, '/test-custom-topic');
          assert.ok(capturedOptions.headers, 'Headers should be defined');
          assert.strictEqual(capturedOptions.headers['Tags'], 'nova_outbound,bell,alarm_clock');
          assert.strictEqual(capturedOptions.headers['Title'], 'QA Test Title');
          assert.strictEqual(capturedOptions.headers['Priority'], 'high');
          done();
        };
        return fakeReq;
      };

      notifService.sendIosPushNotification('QA Test Title', 'QA Test Body', 'test-custom-topic');
    });
  });

  describe('2. Loop Circuit Breaker - ntfySubscriber.js', () => {
    let originalHttpsGet;

    beforeEach(() => {
      originalHttpsGet = https.get;
    });

    afterEach(() => {
      https.get = originalHttpsGet;
    });

    it('should suppress messages containing Test alert, Nova Desktop Assistant, and nested quotes', () => {
      const subscriber = new NtfySubscriber('qa-loop-test');
      const receivedMessages = [];

      const testPayloads = [
        { id: 'm1', event: 'message', message: 'Test alert: reminder trigger' },
        { id: 'm2', event: 'message', message: 'Nova Desktop Assistant system message' },
        { id: 'm3', event: 'message', message: 'Task with ""double quotes"" inside' },
        { id: 'm4', event: 'message', message: 'Task with """triple quotes""" inside' },
        { id: 'm5', event: 'message', message: 'Outbound tag msg', tags: ['nova_outbound'] },
        { id: 'm6', event: 'message', message: 'Buy milk at 5pm' } // Valid inbound task
      ];

      https.get = (url, cb) => {
        const fakeRes = new EventEmitter();
        fakeRes.statusCode = 200;
        cb(fakeRes);

        for (const payload of testPayloads) {
          fakeRes.emit('data', Buffer.from(JSON.stringify(payload) + '\n'));
        }

        const fakeReq = new EventEmitter();
        fakeReq.destroy = () => {};
        return fakeReq;
      };

      subscriber.on('task-received', (data) => {
        receivedMessages.push(data);
      });

      subscriber.start();

      assert.strictEqual(receivedMessages.length, 1, 'Only 1 valid task should pass loop circuit breaker');
      assert.strictEqual(receivedMessages[0].id, 'm6');
      assert.strictEqual(receivedMessages[0].text, 'Buy milk at 5pm');

      subscriber.stop();
    });
  });

  describe('3. Loop Circuit Breaker - main.js Event Handler Level', () => {
    function isCircuitBreakerTriggered(text) {
      if (!text || text === 'triggered' || text === 'OK' || text.length < 2) return true;
      if (text.includes('Test alert') || text.includes('"""') || text.includes('""') || text.includes('Nova Desktop Assistant')) {
        return true;
      }
      return false;
    }

    it('should correctly block invalid/loop strings and pass clean tasks', () => {
      assert.strictEqual(isCircuitBreakerTriggered('Test alert'), true);
      assert.strictEqual(isCircuitBreakerTriggered('Something with Test alert here'), true);
      assert.strictEqual(isCircuitBreakerTriggered('Nova Desktop Assistant status'), true);
      assert.strictEqual(isCircuitBreakerTriggered('Note: ""quoted text""'), true);
      assert.strictEqual(isCircuitBreakerTriggered('Note: """triple quoted"""'), true);
      assert.strictEqual(isCircuitBreakerTriggered('triggered'), true);
      assert.strictEqual(isCircuitBreakerTriggered('a'), true);

      assert.strictEqual(isCircuitBreakerTriggered('Prepare quarterly presentation'), false);
      assert.strictEqual(isCircuitBreakerTriggered('Call doctor tomorrow at 10am'), false);
    });
  });

  describe('4. Inbound Task Rate Limiter (5-second window)', () => {
    it('should suppress messages received within 5 seconds of previous task', () => {
      let lastInboundTaskTime = 0;
      const processedTasks = [];

      function handleInboundTask(text, timestamp) {
        const nowTime = timestamp;
        if (nowTime - lastInboundTaskTime < 5000) {
          return { status: 'rate-limited' };
        }
        lastInboundTaskTime = nowTime;
        processedTasks.push(text);
        return { status: 'accepted' };
      }

      const baseTime = 1000000;

      // Msg 1 @ t=0s -> accepted
      const r1 = handleInboundTask('Task 1', baseTime);
      assert.strictEqual(r1.status, 'accepted');

      // Msg 2 @ t=1s -> rate limited
      const r2 = handleInboundTask('Task 2', baseTime + 1000);
      assert.strictEqual(r2.status, 'rate-limited');

      // Msg 3 @ t=4.9s -> rate limited
      const r3 = handleInboundTask('Task 3', baseTime + 4900);
      assert.strictEqual(r3.status, 'rate-limited');

      // Msg 4 @ t=5.0s -> accepted
      const r4 = handleInboundTask('Task 4', baseTime + 5000);
      assert.strictEqual(r4.status, 'accepted');

      // Msg 5 @ t=6.0s -> rate limited (< 5s after Msg 4 at t=5.0s)
      const r5 = handleInboundTask('Task 5', baseTime + 6000);
      assert.strictEqual(r5.status, 'rate-limited');

      // Msg 6 @ t=10.1s -> accepted (>= 5s after Msg 4 at t=5.0s)
      const r6 = handleInboundTask('Task 6', baseTime + 10100);
      assert.strictEqual(r6.status, 'accepted');

      assert.strictEqual(processedTasks.length, 3);
      assert.deepStrictEqual(processedTasks, ['Task 1', 'Task 4', 'Task 6']);
    });
  });

  describe('5. Default Public Topic Disconnection Audit', () => {
    function computeActiveTopic(ntfyTopicSetting) {
      const topic = ntfyTopicSetting;
      const activeTopic = (topic && topic.trim() && topic.trim() !== 'nova-my-tasks') ? topic.trim() : '';
      return activeTopic;
    }

    it('should evaluate activeTopic to empty string when ntfyTopic is nova-my-tasks', () => {
      assert.strictEqual(computeActiveTopic('nova-my-tasks'), '');
      assert.strictEqual(computeActiveTopic('  nova-my-tasks  '), '');
      assert.strictEqual(computeActiveTopic('none'), 'none');
      assert.strictEqual(computeActiveTopic(''), '');
      assert.strictEqual(computeActiveTopic(null), '');
    });

    it('should allow valid custom private topic names', () => {
      assert.strictEqual(computeActiveTopic('my-secure-private-topic-9921'), 'my-secure-private-topic-9921');
    });

    it('should ensure subscriber stops listening when topic is set to empty or none', () => {
      const subscriber = new NtfySubscriber('temp-topic');
      subscriber.setTopic('none');
      assert.strictEqual(subscriber.topic, 'none');
      assert.strictEqual(subscriber.isListening, false);

      const activeTopic = computeActiveTopic('nova-my-tasks');
      if (!activeTopic || activeTopic === 'none') {
        subscriber.stop();
      }
      assert.strictEqual(subscriber.isListening, false);
    });
  });

});
