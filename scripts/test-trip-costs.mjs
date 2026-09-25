// Run with: node scripts/test-trip-costs.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, console, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
const shared = load('src/lib/expenses/shared.ts');
const option = { id: 'option-1', title: 'Dinner', category: 'dining', amount: 45.5, currency: 'GBP', location: 'Rio', notes: 'Group booking' };
const prefill = shared.planningExpensePrefill(option);
assert.equal(prefill.amount, '45.50');
assert.equal(prefill.title, 'Dinner');
assert.ok(prefill.notes.includes('dining/option-1'));
assert.ok(prefill.notes.includes('Group booking'));
assert.equal(shared.planningExpensePrefill({ ...option, currency: 'BRL' }).amount, '');
assert.equal(shared.planningExpensePrefill({ ...option, currency: null }).amount, '');
assert.equal(shared.planningExpensePrefill({ ...option, amount: null }).amount, '');
assert.equal(shared.planningExpensePrefill({ ...option, category: 'hotel' }).amount, '');
assert.ok(shared.planningExpensePrefill({ ...option, category: 'hotel' }).notes.includes('per night'));
const people = [{ id: 'user:owner', name: 'Organiser' }, { id: 'user:member', name: 'Traveller' }, { id: 'user:third', name: 'Third' }];
const tripId = '11111111-1111-4111-8111-111111111111';
const costId = '22222222-2222-4222-8222-222222222222';
const input = { id: costId, title: 'Dinner', amount: '10.00', category: 'dining', kind: 'bill', notes: '', paidById: people[0].id, splitMethod: 'equal', shares: people.map(person => ({ personId: person.id })) };
assert.equal(shared.validateCost({ ...input, dueDate: '2026-09-30', paymentInstructions: ' Bank transfer ' }, people).due_date, '2026-09-30');
for (const dueDate of ['2026-02-30', 'not-a-date', '2026-9-1']) assert.throws(() => shared.validateCost({ ...input, dueDate }, people));
assert.equal(shared.parseAmount('0.01'), 1);
assert.equal(shared.parseAmount('12.30'), 1230);
for (const value of ['-1', '1.001', 'Infinity', '1e3', '', 'NaN', 2, null]) assert.throws(() => shared.parseAmount(value));
for (let total = 1; total <= 120; total++) for (let count = 1; count <= 12; count++) {
  const shares = shared.splitEqually(total, count);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), total);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
}
const equal = shared.validateCost(input, people);
const noPayer = shared.validateCost({ ...input, paidById: '' }, people);
assert.equal(noPayer.paid_by, null);
assert.equal(noPayer.shares.reduce((sum, share) => sum + share.amountMinor, 0), 1000);
assert.equal(JSON.stringify(equal.shares.map(s => s.amountMinor)), '[334,333,333]');
assert.equal(equal.shares[0].name, 'Organiser');
const custom = { ...input, splitMethod: 'custom', shares: [{ personId: people[0].id, amount: '4' }, { personId: people[1].id, amount: '6' }] };
assert.equal(shared.validateCost(custom, people).shares.length, 2);
for (const invalid of [
  { ...custom, shares: [{ personId: people[0].id, amount: '9.99' }] },
  { ...input, paidById: 'stranger' }, { ...input, shares: [] },
  { ...input, shares: [{ personId: 'stranger' }] },
  { ...input, shares: [input.shares[0], input.shares[0]] },
  { ...input, amount: '0' }, { ...input, category: '__proto__' }, { ...input, kind: 'paid' },
  { ...input, title: ' ' }, { ...input, splitMethod: 'invalid' },
]) assert.throws(() => shared.validateCost(invalid, people));
assert.equal(shared.validateCost({ ...input, kind: 'planned' }, people).shares.length, 0);

async function request({ method = 'GET', who = 'owner', membership = 'active', existing = null, body = input, auth = true, missingTable = false, paymentRoute = false, existingPayment = null } = {}) {
  const writes = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: who, email: `${who}@example.com` } } }), admin: { getUserById: async () => ({ data: { user: { id: 'owner', email: 'owner@example.com', user_metadata: { full_name: 'Organiser' } } } }) } },
    async rpc(name, args) {
      assert.equal(name, 'update_trip_payment'); assert.equal(args.target_trip, tripId); assert.equal(args.actor, who);
      const value = who === 'owner' ? { status: args.paid ? 'paid' : 'due', paid_at: args.paid ? existingPayment.paid_at || new Date().toISOString() : null, confirmed_by: args.paid ? who : null, claimed_at: null } : { claimed_at: args.paid ? new Date().toISOString() : null };
      writes.push({ operation: 'rpc', value });
      return { data: { ...existingPayment, ...value }, error: null };
    },
    from(table) {
      const filters = []; let operation = 'select'; let value; let single = false;
      const query = {
        select() { return query; }, eq(...args) { filters.push(args); return query; }, order() { return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        insert(row) { operation = 'insert'; value = row; return query; }, update(row) { operation = 'update'; value = row; return query; },
        then(resolve) {
          let data;
          if (table === 'trips') data = { id: tripId, owner_id: 'owner' };
          if (table === 'trip_participants') data = [{ id: 'p1', user_id: 'member', full_name: 'Traveller', email: 'member@example.com', status: 'accepted', membership_status: membership }, { id: 'p2', user_id: 'third', full_name: 'Third', status: 'accepted', membership_status: 'active' }];
          if (table === 'trip_costs') {
            assert.ok(filters.some(([key, value]) => key === 'trip_id' && value === tripId) || (operation === 'insert' && value.trip_id === tripId));
            data = operation === 'select' ? single ? (existing && (!filters.some(([key, value]) => key === 'id' && value !== existing.id)) ? existing : null) : (existing ? [existing] : []) : { id: costId, ...value };
            if (operation !== 'select') writes.push({ operation, value });
          }
          if (table === 'trip_expense_payments') {
            assert.ok(filters.some(([key, value]) => key === 'trip_id' && value === tripId) || (operation === 'insert' && value.trip_id === tripId));
            data = operation === 'select' ? single ? existingPayment : (existingPayment ? [existingPayment] : []) : { ...existingPayment, ...value };
            if (operation !== 'select') writes.push({ operation, value });
          }
          return Promise.resolve({ data, error: table === 'trip_costs' && missingTable ? { code: '42P01', message: 'test missing table' } : null }).then(resolve);
        }
      }; return query;
    }
  };
  const imports = { 'next/server': { NextResponse }, '@/lib/supabase/server': { supabaseAdmin: admin }, '@/lib/expenses/shared': shared };
  const access = load('src/lib/expenses/access.ts', imports);
  const route = load(`src/app/api/trips/[id]/expenses/${paymentRoute ? 'payments/' : ''}route.ts`, { ...imports, '@/lib/expenses/access': access });
  const req = new NextRequest(`http://localhost/api/trips/${tripId}/expenses`, { method, headers: auth ? { authorization: 'Bearer test', 'Content-Type': 'application/json' } : {}, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
  const response = await route[method](req, { params: Promise.resolve({ id: tripId }) });
  return { status: response.status, data: await response.json(), writes };
}
(async () => {
  assert.equal((await request({ auth: false })).status, 401);
  assert.equal((await request({ who: 'outsider' })).status, 403);
  for (const membership of ['removed', 'declined', 'invited', 'pending_approval']) assert.equal((await request({ who: 'member', membership })).status, 403);
  assert.equal((await request({ who: 'member' })).status, 200);
  assert.equal((await request({ method: 'POST', who: 'member' })).status, 403);
  const created = await request({ method: 'POST' });
  assert.equal(created.status, 201);
  assert.equal(created.writes[0].value.created_by, 'owner');
  assert.equal(created.writes[0].value.amount_minor, 1000);
  assert.equal(created.writes[0].value.shares[0].name, 'Organiser');
  const existing = { id: costId, created_by: 'owner', trip_id: tripId };
  assert.equal((await request({ method: 'PATCH', who: 'member', existing })).status, 403);
  assert.equal((await request({ method: 'PATCH', existing })).status, 200);
  assert.equal((await request({ method: 'PATCH', who: 'member', existing: { ...existing, created_by: 'member' } })).status, 403);
  const retry = await request({ method: 'POST', existing });
  assert.equal(retry.status, 200); assert.equal(retry.writes.length, 0);
  assert.equal((await request({ method: 'POST', body: { ...input, shares: [{ personId: 'other' }] } })).status, 400);
  const fallback = await request({ missingTable: true }); assert.equal(fallback.status, 503);
  const splitCost = { ...existing, ...shared.validateCost(input, people), amount_minor: 1000 };
  const detailsOnly = await request({ method: 'PATCH', existing: splitCost, body: { ...input, section: 'details', title: 'Updated dinner', amount: '20.00', paidById: 'stranger', shares: [] } });
  assert.equal(detailsOnly.status, 200);
  assert.equal(detailsOnly.writes[0].value.title, 'Updated dinner');
  assert.equal(detailsOnly.writes[0].value.shares.reduce((sum, share) => sum + share.amountMinor, 0), 2000);
  assert.equal('paid_by' in detailsOnly.writes[0].value, false);
  assert.equal('kind' in detailsOnly.writes[0].value, false);
  const splitOnly = await request({ method: 'PATCH', existing: splitCost, body: { ...input, section: 'split', title: 'Must not overwrite', amount: '999.00' } });
  assert.equal(splitOnly.status, 200);
  assert.equal('title' in splitOnly.writes[0].value, false);
  assert.equal('amount_minor' in splitOnly.writes[0].value, false);
  assert.equal(splitOnly.writes[0].value.shares.reduce((sum, share) => sum + share.amountMinor, 0), 1000);
  const equallyWithoutPayer = await request({ method: 'PATCH', existing: splitCost, body: { ...input, section: 'split', paidById: '' } });
  assert.equal(equallyWithoutPayer.status, 200);
  assert.equal(equallyWithoutPayer.writes[0].value.paid_by, null);
  assert.equal(JSON.stringify(equallyWithoutPayer.writes[0].value.shares.map((share) => share.amountMinor)), '[334,333,333]');
  const weightedCost = { ...splitCost, split_method: 'custom', shares: [{id:'one', name:'One', amountMinor: 400}, {id:'two', name:'Two', amountMinor: 600}] };
  for (const total of [1, 11, 2000, 999999999]) {
    const shares = shared.resizeExpenseShares(weightedCost, total);
    assert.equal(shares.reduce((sum, share) => sum + share.amountMinor, 0), total);
    assert.ok(Math.abs(shares[0].amountMinor - total * 0.4) <= 1);
  }
  const paymentId = '33333333-3333-4333-8333-333333333333';
  const paymentInput = { id: paymentId, expenseId: costId, label: 'Deposit', amount: '25.50', payerId: 'user:member', status: 'due' };
  for (const invalid of [{ ...paymentInput, amount: '0' }, { ...paymentInput, amount: '-1' }, { ...paymentInput, amount: '1.001' }, { ...paymentInput, status: 'bogus' }, { ...paymentInput, payerId: 'stranger' }, { ...paymentInput, label: ' ' }]) assert.throws(() => shared.validatePayment(invalid, people));
  const paymentRequest = (options = {}) => request({ method: 'POST', paymentRoute: true, existing, body: paymentInput, ...options });
  assert.equal((await paymentRequest({ auth: false })).status, 401);
  assert.equal((await paymentRequest({ who: 'outsider' })).status, 403);
  assert.equal((await paymentRequest({ who: 'member', membership: 'removed' })).status, 403);
  assert.equal((await paymentRequest({ who: 'member' })).status, 403);
  assert.equal((await paymentRequest({ who: 'member', existing: { ...existing, created_by: 'member' } })).status, 403);
  assert.equal((await paymentRequest({ existing: null })).status, 404);
  assert.equal((await paymentRequest({ body: { ...paymentInput, expenseId: paymentId } })).status, 404);
  const unpaid = await paymentRequest();
  assert.equal(unpaid.status, 201);
  assert.equal(unpaid.writes[0].value.expense_id, costId);
  assert.equal(unpaid.writes[0].value.amount_minor, 2550);
  assert.equal(unpaid.writes[0].value.paid_at, null);
  const paid = await paymentRequest({ body: { ...paymentInput, status: 'paid' } });
  assert.ok(paid.writes[0].value.paid_at);
  const existingPayment = { payer: people[1], id: paymentId, expense_id: costId, created_by: 'owner', status: 'due', amount_minor: 2550, paid_at: null };
  const paymentRetry = await paymentRequest({ existingPayment });
  assert.equal(paymentRetry.status, 200); assert.equal(paymentRetry.writes.length, 0);
  const paidStatus = { method: 'PATCH', existingPayment, body: { id: paymentId, status: 'paid' } };
  assert.equal((await paymentRequest({ ...paidStatus, who: 'third' })).status, 403);
  assert.equal((await paymentRequest({ ...paidStatus, existingPayment: null })).status, 404);
  assert.equal((await paymentRequest({ ...paidStatus, body: { id: paymentId, status: 'wrong' } })).status, 400);
  const claim = await paymentRequest({ ...paidStatus, who: 'member' });
  assert.equal(claim.status, 200); assert.equal(claim.data.payment.status, 'due'); assert.ok(claim.data.payment.claimed_at); assert.equal(claim.data.payment.canEdit, false);
  assert.equal(claim.data.payment.canClaim, true);
  const changed = await paymentRequest(paidStatus);
  assert.equal(changed.status, 200); assert.ok(changed.writes[0].value.paid_at);
  const timestamp = '2026-09-16T10:00:00.000Z';
  const repeated = await paymentRequest({ ...paidStatus, existingPayment: { ...existingPayment, status: 'paid', paid_at: timestamp } });
  assert.equal(repeated.writes[0].value.paid_at, timestamp);
  const reverted = await paymentRequest({ ...paidStatus, body: { id: paymentId, status: 'due' } });
  assert.equal(reverted.writes[0].value.paid_at, null);
  const totals = shared.expensePaymentTotals(costId, [existingPayment, { ...existingPayment, id: 'second', amount_minor: 1000, status: 'paid' }, { ...existingPayment, expense_id: 'other', status: 'paid' }]);
  assert.equal(totals.paid, 1000); assert.equal(totals.unpaid, 2550); assert.equal(totals.count, 2);
  const memberList = await request({ who: 'member', existing: { ...existing, shares: equal.shares }, existingPayment: { ...existingPayment, payer: people[1] } });
  assert.equal(memberList.data.scope, 'personal');
  assert.equal(memberList.data.costs.length, 1);
  assert.equal(memberList.data.costs[0].canEdit, false);
  assert.equal(memberList.data.costs[0].shares.length, 1);
  assert.equal(memberList.data.costs[0].shares[0].id, people[1].id);
  assert.equal(memberList.data.people.length, 1);
  const otherPerson = await request({ who: 'member', existing, existingPayment: { ...existingPayment, payer: people[2] } });
  assert.equal(otherPerson.data.costs.length, 0);
  assert.equal(otherPerson.data.payments.length, 0);
  const historical = await request({ who: 'member', existing, existingPayment: { ...existingPayment, payer: { id: 'participant:p1', name: 'Traveller' }, status: 'paid' } });
  assert.equal(historical.data.payments.length, 1);
  assert.equal(historical.data.costs.length, 1);
  const unassigned = await request({ who: 'member', existing });
  assert.equal(unassigned.data.costs.length, 0);
  assert.equal(memberList.data.payments[0].canEdit, false);
  const ownerList = await request({ existing, existingPayment });
  assert.equal(ownerList.data.payments[0].canEdit, true);
  console.log('PASS: penny rounding, custom totals, validation, membership, trip scope, creator/organiser edits, retry handling missing-table state, linked payment permissions, paid/unpaid transitions, idempotency and totals.');
})().catch(error => { console.error(error); process.exit(1); });
