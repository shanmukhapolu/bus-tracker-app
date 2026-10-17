import {beforeAll,beforeEach,afterAll,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import * as db from 'firebase/database';
import {sparkGpsUpdate} from '../../src/services/sparkGps';
import {emulatorOnly} from './guard';
const shared=vi.hoisted(()=>({runtime:null as any}));
vi.mock('../../src/config/firebase',()=>({getFirebaseRuntime:async()=>shared.runtime}));
vi.mock('../../src/services/telemetryClient',()=>({trustedTelemetryEnabled:()=>false,createBackendTelemetryClient:vi.fn()}));
import {startDriverTracking as optimized} from '../../src/services/driverTrackingService';
// @ts-expect-error frozen and reviewed legacy compatibility service loaded by test-only plugin
import {startDriverTracking as compatibility} from 'virtual:legacy-compat';
let env:RulesTestEnvironment,session:any,watch:any;const bus={busId:'SYN-T',busNumber:'T',route:'Synthetic'};
const p=(t=Date.now())=>({capturedAt:t,latitude:39.95,longitude:-86.12,accuracyMeters:8,speedMps:10,headingDeg:90});
const write=(d:any,point=p())=>db.update(db.ref(d),sparkGpsUpdate(bus,'driver',point,db.serverTimestamp()));
const value=async(path:string)=>{let v:any;await env.withSecurityRulesDisabled(async c=>{v=(await db.get(db.ref(c.database(),path))).val()});return v;};
const until=async(f:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for transition');};
beforeAll(async()=>{emulatorOnly();env=await initializeTestEnvironment({projectId:'demo-ccs-staging',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('scripts/spark/fixtures/database.rules.json','utf8')}})});
beforeEach(async()=>{await env.clearDatabase();await env.withSecurityRulesDisabled(c=>db.set(db.ref(c.database()),{drivers:{driver:{enabled:true,assignedBus:'SYN-T',approvalStatus:'approved'},other:{enabled:true,assignedBus:'SYN-T'}},admins:{admin:{enabled:true,role:'admin'}},buses:{'SYN-T':{busNumber:'T',route:'Synthetic',enabled:true}},activeDrivers:{'SYN-T':'driver'},tripHistory:{preserved:true},safetyEvents:{preserved:true},auditLogs:{preserved:true}}));});
afterEach(async()=>{if(session){await session.stop().catch(()=>{});session=null;}vi.unstubAllGlobals()});
afterAll(async()=>{await env?.cleanup()});
it('rejects timestamp-free cached clients before any upgraded client has connected',async()=>{
 const d=env.authenticatedContext('driver').database(),update:any=sparkGpsUpdate(bus,'driver',p(),db.serverTimestamp());
 for(const v of Object.values(update) as any[])delete v.capturedAt;
 await assertFails(db.update(db.ref(d),update));expect(await value('liveBuses/SYN-T')).toBeNull();
});
it.each(['delete-private','delete-public','delete-capture','downgrade','inactive-replay','partial-location','private-public-mismatch'])('blocks cached-client replay bypass: %s',async attack=>{
 const d=env.authenticatedContext('driver').database();const point=p();await write(d,point);let payload:any;
 if(attack==='delete-private')payload={'liveBuses/SYN-T':null};
 if(attack==='delete-public')payload={'publicBuses/SYN-T':null};
 if(attack==='delete-capture')payload={'liveBuses/SYN-T/capturedAt':null,'publicBuses/SYN-T/capturedAt':null};
 if(attack==='partial-location')payload={'liveBuses/SYN-T/latitude':40};
 if(attack==='private-public-mismatch')payload={'publicBuses/SYN-T':{...(await value('publicBuses/SYN-T')),latitude:40,capturedAt:point.capturedAt+1,lastUpdated:db.serverTimestamp()}};
 if(attack==='downgrade'||attack==='inactive-replay'){payload=sparkGpsUpdate(bus,'driver',{...point,latitude:40},db.serverTimestamp());for(const v of Object.values(payload) as any[]){delete v.capturedAt;if(attack==='inactive-replay')v.active=false;}}
 await assertFails(db.update(db.ref(d),payload));expect((await value('liveBuses/SYN-T')).capturedAt).toBe(point.capturedAt);expect((await value('publicBuses/SYN-T')).latitude).toBe(point.latitude);
});
it.each([{capturedAt:'today'},{accuracyMeters:-1},{accuracyMeters:10001},{speedMps:91},{headingDeg:360},{longitude:181}])('rejects malformed telemetry %j',async change=>{
 const d=env.authenticatedContext('driver').database();await assertFails(write(d,{...p(),...change} as any));
});
it('rejects forged identity, missing session and a replaced session',async()=>{
 const d=env.authenticatedContext('driver').database();await assertFails(db.update(db.ref(d),sparkGpsUpdate(bus,'other',p(),db.serverTimestamp())));
 await env.withSecurityRulesDisabled(c=>db.remove(db.ref(c.database(),'activeDrivers/SYN-T')));await assertFails(write(d));
 await env.withSecurityRulesDisabled(c=>db.set(db.ref(c.database(),'activeDrivers/SYN-T'),'other'));await assertFails(write(d));
});
it('retains private replay watermark when an administrator removes the public projection',async()=>{
 const d=env.authenticatedContext('driver').database(),point=p();await write(d,point);
 const admin=env.authenticatedContext('admin').database();await assertSucceeds(db.remove(db.ref(admin,'publicBuses/SYN-T')));
 await assertFails(write(d,{...point,capturedAt:point.capturedAt-1}));await new Promise(r=>setTimeout(r,3));await assertSucceeds(write(d,p()));
});
it('lets a pre-upgrade stored session stop without inventing a capture time',async()=>{
 const d=env.authenticatedContext('driver').database();const legacy:any=sparkGpsUpdate(bus,'driver',p(),Date.now());for(const v of Object.values(legacy) as any[])delete v.capturedAt;
 await env.withSecurityRulesDisabled(c=>db.update(db.ref(c.database()),legacy));
 await assertFails(db.update(db.ref(d),{'liveBuses/SYN-T/latitude':40,'liveBuses/SYN-T/active':false}));
 await assertSucceeds(db.update(db.ref(d),{'liveBuses/SYN-T/active':false,'publicBuses/SYN-T/active':false,'activeDrivers/SYN-T':null}));
 expect(await value('activeDrivers/SYN-T')).toBeNull();
 await db.set(db.ref(d,'activeDrivers/SYN-T'),'driver');await assertSucceeds(write(d));
});
it('preserves the watermark across driver handover and rejects the previous capture',async()=>{
 const d=env.authenticatedContext('driver').database(),point=p();await write(d,point);
 await db.update(db.ref(d),{'liveBuses/SYN-T/active':false,'publicBuses/SYN-T/active':false,'activeDrivers/SYN-T':null});
 const replacement=env.authenticatedContext('other').database();await db.set(db.ref(replacement,'activeDrivers/SYN-T'),'other');
 await assertFails(db.update(db.ref(replacement),sparkGpsUpdate(bus,'other',{...point,capturedAt:point.capturedAt-1},db.serverTimestamp())));
 await new Promise(r=>setTimeout(r,5));await assertSucceeds(db.update(db.ref(replacement),sparkGpsUpdate(bus,'other',p(),db.serverTimestamp())));
 await assertFails(write(d));
});
it.each([['compatibility',compatibility],['optimized',optimized]] as const)('%s service sends capture time, fails closed after disconnect and restarts safely',async(_name,start)=>{
 const d=env.authenticatedContext('driver').database();shared.runtime={...db,db:d,auth:{currentUser:{uid:'driver'}}};const errors:string[]=[];
 const pos=()=>({timestamp:Date.now(),coords:{latitude:39.95,longitude:-86.12,accuracy:8,speed:10,heading:90}});
 vi.stubGlobal('window',{isSecureContext:true});vi.stubGlobal('document',{visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}});
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(cb:any)=>cb(pos()),watchPosition:(cb:any)=>{watch=cb;return 1;},clearWatch:()=>{}}});
 const options={...bus,onPosition:()=>{},onError:(e:string)=>errors.push(e)};
 session=await start(options);expect((await value('liveBuses/SYN-T')).capturedAt).toBeTypeOf('number');await new Promise(r=>setTimeout(r,150));
 const fix=pos();watch(fix);await until(async()=>(await value('publicBuses/SYN-T')).capturedAt===fix.timestamp);
 db.goOffline(d);await until(async()=>await value('activeDrivers/SYN-T')===null);expect((await value('publicBuses/SYN-T')).active).toBe(false);
 db.goOnline(d);await until(async()=>errors.some(s=>/connection ended/.test(s)));await session.stop();session=null;
 // A queued old capture cannot resume without a new session.
 await assertFails(write(d,p(fix.timestamp)));await new Promise(r=>setTimeout(r,10));
 session=await start(options);await session.stop();session=null;expect(await value('activeDrivers/SYN-T')).toBeNull();
 for(const path of ['tripHistory','safetyEvents','auditLogs'])expect(await value(path)).toEqual({preserved:true});
});
