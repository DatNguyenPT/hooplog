import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ask = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ask.mjs');

function sandbox(extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ask-'));
  fs.mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'agents', 'demo.md'),
    '---\nname: demo\n---\nYou are a terse demo role.\n\n## Scope\nMUST-NOT-LEAK\n');
  const env = { ...process.env, HARNESS_ROOT: root, ANTHROPIC_API_KEY: 'test-key', HARNESS_MAX_RETRIES: '0', ...extraEnv };
  const run = async (args) => {
    try {
      return { code: 0, ...(await exec(process.execPath, [ask, ...args], { env, cwd: root })) };
    } catch (e) {
      return { code: e.code, stdout: e.stdout, stderr: e.stderr };
    }
  };
  return { root, env, run };
}

function mockApi(reply) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

const message = (over = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content: [{ type: 'text', text: '<result>hello' }],
  stop_reason: 'stop_sequence', stop_sequence: '</result>',
  usage: { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ...over,
});

test('dry run builds a capped, cacheable request with a stop sequence and the persona only', async () => {
  const sb = sandbox();
  const r = await sb.run(['--dry-run', '--role', 'demo', '--prompt', 'hi', '--max-tokens', '300']);
  const req = JSON.parse(r.stdout);
  assert.equal(req.max_tokens, 300);
  assert.deepEqual(req.stop_sequences, ['</result>']);
  assert.equal(req.system[0].cache_control.type, 'ephemeral');
  assert.match(req.system[0].text, /terse demo role/);
  assert.doesNotMatch(req.system[0].text, /MUST-NOT-LEAK/);
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
});

test('fallbacks are only requested for models that support them', async () => {
  const sb = sandbox();
  const req = JSON.parse((await sb.run(['--dry-run', '--prompt', 'hi', '--model', 'claude-haiku-5-5'])).stdout);
  assert.equal(req.fallbacks, undefined);
  assert.equal(req.betas, undefined);
});

test('response cache: the second identical call costs no API request', async () => {
  const api = await mockApi(message());
  try {
    const sb = sandbox({ ANTHROPIC_BASE_URL: api.url });
    const first = await sb.run(['--role', 'demo', '--prompt', 'say hello']);
    assert.equal(first.code, 0);
    assert.equal(first.stdout, 'hello\n');
    assert.equal(api.calls.length, 1);
    const call = api.calls[0];
    assert.ok(call.url.startsWith('/v1/messages'));
    assert.match(call.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.deepEqual(call.body.stop_sequences, ['</result>']);
    assert.equal(call.body.max_tokens, 2048);

    const second = await sb.run(['--role', 'demo', '--prompt', 'say hello']);
    assert.equal(second.stdout, 'hello\n');
    assert.match(second.stderr, /cache hit/);
    assert.equal(api.calls.length, 1);

    await sb.run(['--role', 'demo', '--prompt', 'say hello', '--no-cache']);
    assert.equal(api.calls.length, 2);
  } finally {
    api.server.close();
  }
});

test('a response cut off by max_tokens exits 4 and is not cached', async () => {
  const api = await mockApi(message({ stop_reason: 'max_tokens', stop_sequence: null }));
  try {
    const sb = sandbox({ ANTHROPIC_BASE_URL: api.url });
    const r = await sb.run(['--prompt', 'long answer', '--max-tokens', '5']);
    assert.equal(r.code, 4);
    assert.match(r.stderr, /truncated/);
    await sb.run(['--prompt', 'long answer', '--max-tokens', '5']);
    assert.equal(api.calls.length, 2);
  } finally {
    api.server.close();
  }
});
