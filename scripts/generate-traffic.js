'use strict';

const assert = require('node:assert/strict');

async function request(method, path, expectedStatus, body) {
  const response = await fetch(`http://localhost:3000${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  console.log(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  assert.equal(response.status, expectedStatus, `${method} ${path}: unexpected HTTP status`);
  return JSON.parse(text);
}

async function main() {
  const health = await request('GET', '/health', 200);
  assert.equal(health.status, 'ok');
  const before = await request('GET', '/todo', 200);
  assert.ok(Array.isArray(before));
  const first = await request('GET', '/todo/1', 200);
  assert.equal(first.id, 1);
  await request('GET', '/todo/999', 404);
  await request('GET', '/todo/invalid', 400);
  await request('POST', '/todo', 400, { task: '' });
  const created = await request('POST', '/todo', 201, { task: 'Capture Jaeger screenshots' });
  const after = await request('GET', '/todo', 200);
  assert.equal(after.length, before.length + 1);
  assert.ok(after.some((row) => row.id === created.id && row.task === created.task));
  await request('GET', '/error-demo', 500);
  // Allow batching to send trace data. The app server must still be running.
  console.log('\nAll 9 real HTTP checks passed. Wait 5-10 seconds, then open http://localhost:16686 and select todo-service.');
}

main().catch((error) => {
  console.error('Traffic generation failed. Is the Node app running?', error);
  process.exitCode = 1;
});
