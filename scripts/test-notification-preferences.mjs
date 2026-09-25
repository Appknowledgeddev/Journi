import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server.js';
function load(path, imports, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, console, Buffer, URL, process: { env }, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
let stored = null;
const defaults = { in_app: true, email: true, invites: true, planning: true, payments: true };
const admin = {
  auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'current-user' } : null } }) },
  from(table) {
    assert.equal(table, 'notification_preferences'); let filter;
    const q = { select() { return q; }, eq(key, value) { assert.equal(key, 'user_id'); filter = value; return q; }, maybeSingle() { return q; }, single() { return q; }, upsert(value) { assert.equal(value.user_id, 'current-user'); stored = value; return q; }, then(resolve) { if (filter) assert.equal(filter, 'current-user'); return Promise.resolve({ data: stored, error: null }).then(resolve); } }; return q;
  }
};
const route = load('src/app/api/notifications/preferences/route.ts', { 'next/server': { NextResponse }, '@/lib/supabase/server': { supabaseAdmin: admin } });
function request(method, body, token = 'valid') { return new NextRequest('https://journi.example/api/notifications/preferences', { method, headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
assert.equal((await route.GET(request('GET', null, 'invalid'))).status, 401);
assert.deepEqual((await (await route.GET(request('GET'))).json()).preferences, defaults);
assert.equal((await route.PATCH(request('PATCH', { ...defaults, user_id: 'someone-else' }))).status, 400);
assert.equal((await route.PATCH(request('PATCH', { ...defaults, email: 'false' }))).status, 400);
assert.equal((await route.PATCH(request('PATCH', { email: false }))).status, 400);
assert.equal((await route.PATCH(request('PATCH', { ...defaults, payments: false, email: false }))).status, 200);
assert.equal((await (await route.GET(request('GET'))).json()).preferences.email, false);
let touched = false;
const cron = load('src/app/api/cron/notifications/route.ts', { 'next/server': { NextResponse }, 'node:crypto': crypto, '@/lib/supabase/server': { supabaseAdmin: { rpc: () => { touched = true; throw new Error('unauthorised DB access'); } } }, '@/lib/backoffice/email-webhook': { sendEmailWebhook: () => { touched = true; } } }, { CRON_SECRET: 'fixture-cron-secret', NEXT_PUBLIC_SITE_URL: 'https://journi.example' });
assert.equal((await cron.GET(request('GET'))).status, 401);
assert.equal(touched, false);
console.log('PASS: notification defaults, persistence, account isolation, validation and unauthorised scheduler protection.');
