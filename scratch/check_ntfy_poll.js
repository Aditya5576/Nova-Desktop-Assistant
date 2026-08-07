const https = require('https');

const topic = 'nova-my-tasks';
const url = `https://ntfy.sh/${topic}/json?poll=1`;

console.log(`Polling recent messages from ntfy.sh/${topic}...`);

https.get(url, (res) => {
  let body = '';
  res.on('data', (d) => body += d.toString('utf-8'));
  res.on('end', () => {
    console.log('--- RECENT NTFY MESSAGES ---');
    const lines = body.trim().split('\n');
    lines.forEach(l => {
      try {
        const json = JSON.parse(l);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('RAW LINE:', l);
      }
    });
  });
}).on('error', (e) => {
  console.error('Error polling ntfy:', e.message);
});
