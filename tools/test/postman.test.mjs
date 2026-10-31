import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'postman-summary.mjs');

const collection = {
  info: { name: 'Shop API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  auth: { type: 'bearer' },
  variable: [{ key: 'baseUrl', value: 'https://api.example.com' }, { key: 'apiToken', value: 'abc123' }],
  item: [
    {
      name: 'Auth',
      item: [{
        name: 'Login',
        request: {
          method: 'POST',
          auth: { type: 'noauth' },
          url: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
          body: { mode: 'raw', raw: '{"email": "{{email}}", "password": "{{password}}"}', options: { raw: { language: 'json' } } },
        },
        event: [{ listen: 'test', script: { exec: ['pm.test("status is 200", function () {', '  pm.response.to.have.status(200);', '});'] } }],
        response: [{ name: 'ok', code: 200 }, { name: 'bad credentials', code: 401 }],
      }],
    },
    {
      name: 'Orders',
      item: [
        {
          name: 'List orders',
          request: {
            method: 'GET',
            url: {
              raw: '{{baseUrl}}/orders?page=1&api_key=SECRET',
              query: [{ key: 'page', value: '1' }, { key: 'api_key', value: 'SECRET' }, { key: 'old', value: 'x', disabled: true }],
            },
          },
        },
        { name: 'Get order', request: { method: 'GET', url: { raw: '{{baseUrl}}/orders/:id', variable: [{ key: 'id' }] } } },
        {
          name: 'Upload receipt',
          request: {
            method: 'POST',
            url: '{{baseUrl}}/orders/1/receipt', // v2.0 style: plain string URL
            body: { mode: 'formdata', formdata: [{ key: 'file', type: 'file' }, { key: 'note', type: 'text' }] },
          },
        },
      ],
    },
  ],
};

function setup(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-postman-'));
  const file = path.join(dir, 'collection.json');
  fs.writeFileSync(file, JSON.stringify(collection));
  for (const [name, data] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  const run = (...args) => spawnSync(process.execPath, [tool, file, ...args], { encoding: 'utf8', cwd: dir });
  return { dir, file, run };
}

test('summarizes folders, requests, tests and examples compactly', () => {
  const out = setup().run().stdout;
  assert.match(out, /Collection: Shop API \| requests: 4 \| folders: 2 \| POST 2, GET 2/);
  assert.match(out, /## Auth/);
  assert.match(out, /## Orders/);
  assert.match(out, /1\. POST \{\{baseUrl\}\}\/auth\/login \| auth:noauth \| body:json \{email,password\} \| tests:"status is 200" \| asserts:200 \| examples:200,401/);
  assert.match(out, /path:id/);
  assert.match(out, /body:formdata \{file\(file\),note\}/);
  assert.match(out, /Gaps: 3 request\(s\) without tests; 3 without a 4xx\/5xx assertion or example/);
});

test('masks secret-looking variables and query values, and skips disabled params', () => {
  const out = setup().run().stdout;
  assert.match(out, /apiToken=\*\*\*/);
  assert.doesNotMatch(out, /abc123|SECRET/);
  assert.match(out, /api_key=\*\*\*/);
  assert.match(out, /query:page,api_key(?!,old)/);
});

test('an environment file overrides collection variables', () => {
  const sb = setup({ 'env.json': { values: [{ key: 'baseUrl', value: 'https://staging.example.com', enabled: true }] } });
  assert.match(sb.run('--env', path.join(sb.dir, 'env.json')).stdout, /baseUrl=https:\/\/staging\.example\.com/);
});

test('--folder filters requests and --json is parseable with --samples text', () => {
  const sb = setup();
  const filtered = sb.run('--folder', 'orders').stdout;
  assert.match(filtered, /shown: 3/);
  assert.doesNotMatch(filtered, /auth\/login/);
  const json = JSON.parse(sb.run('--json').stdout);
  assert.equal(json.total, 4);
  assert.equal(json.requests[0].body.fields.join(), 'email,password');
  assert.match(sb.run('--samples').stdout, /sample:\{"email"/);
});

test('bad input fails with a clear message', () => {
  const sb = setup();
  const missing = spawnSync(process.execPath, [tool, path.join(sb.dir, 'nope.json')], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /cannot read/);
  fs.writeFileSync(path.join(sb.dir, 'not-postman.json'), '{"hello": 1}');
  const bad = spawnSync(process.execPath, [tool, path.join(sb.dir, 'not-postman.json')], { encoding: 'utf8' });
  assert.match(bad.stderr, /not a Postman collection/);
});
