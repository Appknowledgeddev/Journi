import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
function load(path, imports={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,console,require:name=>imports[name]});
  return exports;
}
const schema=load('src/lib/trips/invite-schema.ts');
const profiles=load('src/lib/connection-profile.ts');
assert.equal(profiles.connectionProfile({id:'incomplete',user_metadata:{full_name:'Name'}}),null);
assert.equal(profiles.connectionProfile({id:'complete',user_metadata:{full_name:'Name',bio:'Bio',avatar_position_x:500}}).avatarPositionX,100);
assert.equal(schema.isMissingTripDateMode({code:'42703',message:'column trips.date_mode does not exist'}),true);
assert.equal(schema.isMissingTripDateMode({code:'PGRST204',message:"Could not find the 'date_mode' column"}),true);
assert.equal(schema.isMissingTripDateMode({code:'42703',message:'column trips.voting_deadline does not exist'}),false);
assert.equal(schema.isMissingTripDateMode({code:'42501',message:'date_mode permission denied'}),false);
async function run({detail=false,missing=true,expired=false,auth=true,withProfiles=false}={}) {
  const queries=[];
  const trip={id:'trip',owner_id:'organiser',title:'Test trip',starts_at:'2026-10-01',ends_at:'2026-10-05',voting_deadline:expired?'2020-01-01':null};
  const invite={id:'invite',trip_id:'trip',email:'member@example.com',status:'invited',invited_at:'2026-01-01'};
  const admin={auth:{getUser:async()=>({data:{user:{id:'member',email:'member@example.com'}}}),admin:{listUsers:async()=>({data:{users:[{id:'organiser',email:'owner@example.com',user_metadata:{full_name:'Organiser',bio:'Travel bio',private_setting:'secret'}},{id:'stranger',email:'stranger@example.com',user_metadata:{full_name:'Stranger',bio:'Not connected'}}]}})}},from(table){
    let columns='',single=false;const filters=[];
    const q={select(value){columns=value;return q;},eq(...args){filters.push(args);return q;},in(...args){filters.push(args);return q;},or(){return q;},order(){return q;},single(){single=true;return q;},then(resolve){
      queries.push({table,columns,filters});
      if(table==='trips'&&missing&&columns.includes('date_mode'))return Promise.resolve({data:null,error:{code:'42703',message:'column trips.date_mode does not exist'}}).then(resolve);
      const row=table==='trips'?{...trip,...(columns.includes('date_mode')?{date_mode:'flexible'}:{})}:table==='trip_participants'?invite:null;
      return Promise.resolve({data:single?row:row?[row]:[],error:null}).then(resolve);
    }};return q;
  }};
  const route=load(`src/app/api/travellers/${detail?'invite-detail':'invites'}/route.ts`,{'next/server':{NextResponse},'@/lib/supabase/server':{supabaseAdmin:admin},'@/lib/trips/invite-schema':schema,'@/lib/connection-profile':profiles});
  const response=await route.GET(new NextRequest(`http://localhost/api?inviteId=invite${withProfiles?'&profiles=1':''}`,{headers:auth?{authorization:'Bearer test'}:{}}));
  return {status:response.status,body:await response.json(),queries};
}
for(const detail of [false,true]) {
  const legacy=await run({detail});assert.equal(legacy.status,200);
  const tripQueries=legacy.queries.filter(q=>q.table==='trips');
  assert.ok(tripQueries.some(q=>!q.columns.includes('date_mode')));
  assert.ok(tripQueries.every(q=>q.columns.includes('voting_deadline')));
  assert.ok(tripQueries.every(q=>q.filters.length>0));
  assert.equal(detail?legacy.body.trip.date_mode:legacy.body.receivedTrips[0].date_mode,null);
  const modern=await run({detail,missing:false});assert.equal(modern.status,200);
  assert.ok(modern.queries.filter(q=>q.table==='trips').every(q=>q.columns.includes('date_mode')));
  assert.equal((await run({detail,auth:false})).status,401);
}
assert.equal((await run({detail:true,expired:true})).status,410);
assert.equal((await run({expired:true})).body.receivedInvites.length,0);
const directory=await run({withProfiles:true});
assert.equal(directory.body.connectionProfiles.length,1);
assert.equal(directory.body.connectionProfiles[0].id,'organiser');
assert.equal(directory.body.connectionProfiles[0].bio,'Travel bio');
assert.ok(!JSON.stringify(directory.body.connectionProfiles).includes('secret'));
console.log('PASS: legacy and modern invite schemas, scoped queries, authentication and expired-invite protection.');
