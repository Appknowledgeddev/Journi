import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies) {
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports: compiledModule.exports, module: compiledModule, require: name => {
    if (name === "@/lib/stripe/environment") return load("src/lib/stripe/environment.ts", {});
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, process: { env: { STRIPE_SECRET_KEY: 'sk_test_fixture', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_fixture' } }, URL, console });
  return compiledModule.exports;
}
const user = { id: 'owner', email: 'owner@example.test', user_metadata: { plan: 'pro_organiser', subscription_status: 'active' } };
function accessFixture({ freeUsed = true, usedPass = false, session = {}, subscriptions = [] } = {}) {
  const builder = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: usedPass ? { trip_id: 'already-used' } : null, error: null }), then(resolve) { return Promise.resolve({ count: freeUsed ? 1 : 0, error: null }).then(resolve); } };
  const stripe = {
    checkout: { sessions: { retrieve: async () => session } },
    customers: { list: async function* () { yield { id: 'customer' }; } },
    subscriptions: { list: async function* () { yield* subscriptions; }, retrieve: async () => ({ livemode: false, status: 'active', metadata: {product:'pro_organiser',user_id:user.id} }) },
    products: { retrieve: async () => ({name:'Unrelated product'}) },
  };
  return load('src/lib/trip-creation-access.ts', { '@/lib/supabase/server': { supabaseAdmin: { from: () => builder } }, '@/lib/stripe/server': { stripe } });
}
const paidSession = { livemode: false, id: 'paid-session', client_reference_id: user.id, metadata: { user_id: user.id, product: 'trip_pass' }, status: 'complete', mode: 'payment', payment_status: 'paid', currency: 'gbp', amount_total: 3900 };

test('one free allowance; editable Pro metadata cannot authorise the second trip', async () => {
  assert.equal((await accessFixture({ freeUsed: false }).getTripCreationAccess(user)).canCreate, true);
  assert.equal((await accessFixture().getTripCreationAccess(user)).canCreate, false);
});
test('paid Trip Pass is bound to the verified account and can only be used once', async () => {
  assert.equal((await accessFixture({ session: paidSession }).getTripCreationAccess(user, 'paid-session')).hasTripPass, true);
  assert.equal((await accessFixture({ session: paidSession, usedPass: true }).getTripCreationAccess(user, 'paid-session')).canCreate, false);
  assert.equal((await accessFixture({ session: { ...paidSession, client_reference_id: 'another-user' } }).getTripCreationAccess(user, 'paid-session')).canCreate, false);
  assert.equal((await accessFixture({ session: { ...paidSession, payment_status: 'unpaid' } }).getTripCreationAccess(user, 'paid-session')).canCreate, false);
});
test('Stripe subscription state, rather than browser metadata, permits additional trips', async () => {
  assert.equal((await accessFixture({ subscriptions: [{ livemode: false, status: 'active', metadata: {product:'pro_organiser',user_id:user.id} }] }).getTripCreationAccess(user)).canCreate, true);
  assert.equal((await accessFixture({ subscriptions: [{livemode:false,status:'active',metadata:{},items:{data:[{price:{product:'unrelated'}}]}}] }).getTripCreationAccess(user)).canCreate, false);
  assert.equal((await accessFixture({ subscriptions: [{ livemode: false, status: 'canceled', metadata: {product:'pro_organiser',user_id:user.id} }] }).getTripCreationAccess(user)).canCreate, false);
});
test('checkout requires login and binds payment identity to authenticated user', async () => {
  let checkout;
  const route = load('src/app/api/stripe/checkout-session/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase/server': { supabaseServerPublic: { auth: { getUser: async () => ({ data: { user }, error: null }) } } },
    '@/lib/stripe/server': { stripe: { checkout: { sessions: { create: async data => { checkout = data; return { client_secret: 'secret' }; } } } } },
  });
  const request = { headers: { get: () => null }, nextUrl: new URL('https://journi.example/api/stripe/checkout-session'), json: async () => ({ publishableMode: 'test', product: 'trip_pass', email: 'victim@example.test', origin: 'https://attacker.example', returnPath: '/trip-organiser?resume=1' }) };
  assert.equal((await route.POST(request)).status, 401);
  assert.equal(checkout, undefined);
  request.headers.get = () => 'Bearer verified-token';
  const originalJson = request.json;
  request.json = async () => ({ product: 'trip_pass', publishableMode: 'live' });
  assert.equal((await route.POST(request)).status, 503);
  assert.equal(checkout, undefined);
  request.json = async () => ({ product: 'trip_pass' });
  assert.equal((await route.POST(request)).status, 503);
  assert.equal(checkout, undefined);
  request.json = originalJson;
  assert.equal((await route.POST(request)).status, 200);
  assert.equal(checkout.customer_email, user.email);
  assert.equal(checkout.client_reference_id, user.id);
  assert.equal(checkout.metadata.user_id, user.id);
  assert.ok(checkout.return_url.startsWith('https://journi.example/'));
  assert.ok(checkout.return_url.includes('{CHECKOUT_SESSION_ID}'));
});
test('finalise denies exhausted allowance and handles a concurrent quota loss as an upgrade', async () => {
  let granted = false;
  let rpcCalls = 0;
  const route = load('src/app/api/trip-organiser/finalise/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/api/errors': {},
    '@/lib/trip-creation-access': { freeTripLimitMessage: 'Upgrade required', getTripCreationAccess: async () => ({ canCreate: granted, freeTripAvailable: granted }) },
    '@/lib/supabase/server': { missingSupabaseServerVariables: [], supabaseServerPublic: { auth: { getUser: async () => ({ data: { user }, error: null }) } }, supabaseAdmin: { rpc: async () => { rpcCalls++; return { data: null, error: { message: 'FREE_TRIP_LIMIT' } }; } } },
  });
  const request = { headers: { get: () => 'Bearer verified-token' }, json: async () => ({ draft: { tripForm: { title: 'Second trip' } } }) };
  assert.equal((await route.POST(request)).status, 402);
  assert.equal(rpcCalls, 0);
  granted = true;
  const result = await route.POST(request);
  assert.equal(result.status, 402);
  assert.equal(result.body.code, 'TRIP_LIMIT_REACHED');
  assert.equal(rpcCalls, 1);
});


test('billing mode rejects mismatched keys, stale browser modes and cross-mode Stripe records', () => {
  const env = load('src/lib/stripe/environment.ts', {});
  assert.equal(env.billingEnvironment('sk_test_fixture', 'pk_test_fixture').ready, true);
  assert.equal(env.billingEnvironment('sk_live_fixture', 'pk_live_fixture').ready, true);
  assert.equal(env.billingEnvironment('rk_test_fixture', 'pk_test_fixture').ready, true);
  assert.equal(env.billingEnvironment('sk_test_fixture', 'pk_live_fixture').ready, false);
  assert.equal(env.billingEnvironment(undefined, 'pk_test_fixture').ready, false);
  assert.equal(env.billingEnvironment('unknown', 'pk_test_fixture').ready, false);
  assert.equal(env.requireBillingEnvironment('test'), 'test');
  assert.throws(() => env.requireBillingEnvironment('live'));
  assert.throws(() => env.requireBillingEnvironment(null));
  assert.doesNotThrow(() => env.requireStripeObjectMode(false));
  assert.throws(() => env.requireStripeObjectMode(true));
});

test('a live checkout session cannot grant access in a test deployment', async () => {
  await assert.rejects(() => accessFixture({session: {...paidSession, livemode: true}}).getTripCreationAccess(user, 'paid-session'));
});
