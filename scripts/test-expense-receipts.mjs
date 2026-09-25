// Run with: node scripts/test-expense-receipts.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, console, File, Uint8Array, Response, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
const receipts = load('src/lib/expenses/receipts.ts');
assert.equal(receipts.receiptType(new Uint8Array([137,80,78,71,13,10,26,10])).mime, 'image/png');
assert.equal(receipts.receiptType(new Uint8Array([255,216,255])).mime, 'image/jpeg');
assert.equal(receipts.receiptType(new TextEncoder().encode('%PDF-1.7')).mime, 'application/pdf');
assert.equal(receipts.receiptType(new TextEncoder().encode('RIFF1234WEBP')).mime, 'image/webp');
assert.equal(receipts.receiptType(new TextEncoder().encode('<svg onload="alert(1)">')), null);
const tripId = '11111111-1111-4111-8111-111111111111';
const expenseId = '22222222-2222-4222-8222-222222222222';
const receiptId = '33333333-3333-4333-8333-333333333333';
async function run({method='POST', isOwner=true, who='owner', expenseOwner='creator', existing=null, absentExpense=false, absentReceipt=false, denied=false, badFile=false, large=false, dbFailure=false, assigned=false}={}) {
  const uploads=[]; const removed=[]; const writes=[];
  const stored = { id:receiptId,expense_id:expenseId,name:'receipt.pdf',size:8,mime_type:'application/pdf',storage_path:`${tripId}/${expenseId}/${receiptId}.pdf` };
  const admin = {
    from(table) {
      const filters=[]; let value; let operation='select';
      const q = { select(){return q;},eq(...args){filters.push(args);return q;},maybeSingle(){return q;},single(){return q;},insert(v){value=v;operation='insert';return q;},then(resolve){
        assert.ok(operation === 'insert' ? value.trip_id === tripId : filters.some(([key,val])=> key==='trip_id' && val===tripId));
        if (table === 'trip_expense_payments') return Promise.resolve({data:assigned ? [{payer:{id:`user:${who}`}}] : [],error:null}).then(resolve);
        if (table === 'trip_costs') return Promise.resolve({data:absentExpense ? null : {created_by:expenseOwner},error:null}).then(resolve);
        if (operation === 'insert') { writes.push(value); return Promise.resolve({data:value,error:dbFailure ? {message:'test failure'} : null}).then(resolve); }
        return Promise.resolve({data: method==='GET' ? absentReceipt ? null : stored : existing,error:null}).then(resolve);
      }}; return q;
    },
    storage:{from(bucket){assert.equal(bucket,'expense-receipts');return {
      upload:async(path,bytes,options)=>{uploads.push({path,bytes,options});return {error:null};},
      remove:async(paths)=>{removed.push(...paths);return {error:null};},
      download:async(path)=>{assert.equal(path,stored.storage_path);return {data:new Blob(['%PDF-1.7']),error:null};}
    };}}
  };
  const access = {getAccess:async()=>denied ? {error:NextResponse.json({error:'Denied'},{status:403})} : {user:{id:who},isOwner,people:[],personIds:[`user:${who}`]},isUuid:value=>typeof value==='string' && /^[0-9a-f-]{36}$/.test(value),databaseError:()=>NextResponse.json({error:'Database failure'},{status:500})};
  const route=load('src/app/api/trips/[id]/expenses/receipts/route.ts',{'next/server':{NextResponse},'@/lib/supabase/server':{supabaseAdmin:admin},'@/lib/expenses/access':access,'@/lib/expenses/receipts':receipts});
  const form=new FormData();form.set('expenseId',expenseId);form.set('receiptId',receiptId);form.set('file',new File([large ? new Uint8Array(receipts.receiptMaxBytes+1) : badFile ? '<html>fake PDF</html>' : '%PDF-1.7'],'receipt.pdf',{type:'application/pdf'}));
  const request=new NextRequest(`http://localhost/api/trips/${tripId}/expenses/receipts?receiptId=${receiptId}`,{method,...(method==='POST'?{body:form}:{})});
  const response=await route[method](request,{params:Promise.resolve({id:tripId})});
  return {response,uploads,removed,writes};
}
assert.equal((await run({denied:true})).response.status,403);
assert.equal((await run({isOwner:false,who:'other'})).response.status,403);
assert.equal((await run({isOwner:false,who:'creator'})).response.status,403);
assert.equal((await run({absentExpense:true})).response.status,404);
assert.equal((await run({badFile:true})).response.status,400);
assert.equal((await run({large:true})).response.status,400);
const saved=await run();assert.equal(saved.response.status,201);assert.equal(saved.uploads[0].options.upsert,false);assert.equal(saved.writes[0].expense_id,expenseId);
const retry=await run({existing:{id:receiptId,expense_id:expenseId}});assert.equal(retry.response.status,200);assert.equal(retry.uploads.length,0);
const failed=await run({dbFailure:true});assert.equal(failed.response.status,500);assert.equal(failed.removed.length,1);
const download=await run({method:'GET'});assert.equal(download.response.status,200);assert.equal(download.response.headers.get('Cache-Control'),'private, no-store');assert.ok(download.response.headers.get('Content-Disposition').startsWith('attachment;'));assert.equal(await download.response.text(),'%PDF-1.7');
assert.equal((await run({method:'GET',denied:true})).response.status,403);
assert.equal((await run({method:'GET',absentReceipt:true})).response.status,404);
assert.equal((await run({method:'GET',isOwner:false,who:'member'})).response.status,404);
assert.equal((await run({method:'GET',isOwner:false,who:'member',assigned:true})).response.status,200);
console.log('PASS: receipt types, size limits, trip-scoped permissions, private downloads, retries and upload cleanup.');
