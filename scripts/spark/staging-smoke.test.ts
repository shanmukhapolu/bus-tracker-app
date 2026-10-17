import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,signInWithEmailAndPassword} from 'firebase/auth';
import * as db from 'firebase/database';
import {resolveFirebaseEnvironment} from '../../src/config/deploymentEnvironment';
const shared=vi.hoisted(()=>({runtime:null as any}));
vi.mock('../../src/config/firebase',()=>({getFirebaseRuntime:async()=>shared.runtime}));
vi.mock('../../src/services/telemetryClient',()=>({trustedTelemetryEnabled:()=>false,createBackendTelemetryClient:vi.fn()}));
import {startDriverTracking as optimizedTracking} from '../../src/services/driverTrackingService';
// @ts-expect-error test-only frozen compatibility module
import {startDriverTracking as compatibilityTracking} from "virtual:legacy-compat";
const startDriverTracking=process.env.SPARK_COMPAT_CLIENT === "1" ? compatibilityTracking : optimizedTracking;
import {sparkGpsUpdate} from '../../src/services/sparkGps';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const report:any={client:process.env.SPARK_COMPAT_CLIENT === "1" ? "legacy-compatibility" : "optimized",project:'chsbustracker2-staging',checks:[],startedAt:new Date().toISOString()};
const pass=(s:string)=>{report.checks.push(s);console.log('PASS: '+s)};
const digest=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const until=async(fn:()=>Promise<boolean>,message:string)=>{for(let i=0;i<100;i++){if(await fn())return;await sleep(100)}throw Error(message)};
it.skipIf(process.env.CONFIRM_STAGING !== 'chsbustracker2-staging')('small synthetic hosted staging smoke test',async()=>{
 if(process.env.CONFIRM_STAGING!=='chsbustracker2-staging'||process.env.FIREBASE_DATABASE_EMULATOR_HOST||process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('Explicit staging-only confirmation required; no cloud admin credentials allowed');
 const settings=resolveFirebaseEnvironment(parseEnv(fs.readFileSync('.env.staging.local','utf8')),'staging','public');
 expect(settings.config.projectId).toBe(report.project);
 const journal=JSON.parse(fs.readFileSync('.staging.local/cloud-accounts.json','utf8'));expect(journal.projectId).toBe(report.project);
 const clients:any[]=[],unsubs:(()=>void)[]=[];let session:any=null;
 async function connect(id:string){const app=initializeApp(settings.config,'smoke-'+id+'-'+crypto.randomUUID());const auth=getAuth(app),database=db.getDatabase(app,settings.config.databaseURL);const c={app,auth,db:database};clients.push(c);if(id!=='anonymous'){const a=journal.accounts.find((a:any)=>a.id===id);expect(a.email.endsWith('@ccs-staging.example.test')).toBe(true);await signInWithEmailAndPassword(auth,a.email,a.password);expect((await auth.currentUser!.getIdTokenResult()).claims.aud).toBe(report.project)}return c}
 try{
 const admin=await connect('admin1'),driver=await connect('driver1'),disabled=await connect('driver9'),anon=await connect('anonymous');
 const value=async(c:any,p:string)=>(await db.get(db.ref(c.db,p))).val();
 const before:any={};for(const p of ['buses','drivers','geofences','geofenceAlerts','geofenceBusOrder','tripHistory','safetyEvents','incidentSensors','auditLogs','devices'])before[p]=digest(await value(admin,p));
 const bus=await value(admin,'buses/SYN-101');expect(bus).toBeTruthy();expect((await value(admin,'drivers/'+driver.auth.currentUser.uid)).enabled).toBe(true);expect(await value(admin,'activeDrivers/SYN-101')).toBe(null);
 expect((await value(admin,'drivers/'+disabled.auth.currentUser.uid)).enabled).not.toBe(true);
 pass('Staging project/token isolation and synthetic accounts validated');
 const denied=async(fn:()=>Promise<any>,s:string)=>{try{await fn()}catch(e){if(/permission.denied/i.test(String(e))){pass(s);return}throw e}throw Error('Unexpectedly allowed '+s)};
 for(const p of ['drivers','liveBuses','tripHistory','safetyEvents','auditLogs'])await denied(()=>value(anon,p),'Anonymous blocked from '+p);
 await denied(()=>db.set(db.ref(driver.db,'activeDrivers/SYN-102'),driver.auth.currentUser.uid),'Wrong-bus lock denied');
 await denied(()=>db.set(db.ref(disabled.db,'activeDrivers/SYN-101'),disabled.auth.currentUser.uid),'Disabled driver lock denied');
 let watch:any;const errors:string[]=[];let latest=0;
 const position=(n=0)=>({timestamp:Date.now(),coords:{latitude:39.975+n*.00005,longitude:-86.13+n*.00003,accuracy:8,speed:6+(n%6),heading:45}});
 vi.stubGlobal('window',{isSecureContext:true});vi.stubGlobal('document',{visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}});
 vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(cb:any)=>cb(position()),watchPosition:(cb:any)=>{watch=cb;return 1},clearWatch:()=>{watch=null}}});
 shared.runtime={...db,...driver};
 const options={busId:'SYN-101',busNumber:bus.busNumber,route:bus.route??'',onPosition:()=>{},onError:(e:string)=>errors.push(e)};
 const pub=new Set<number>(),priv=new Set<number>();
 unsubs.push(db.onValue(db.ref(anon.db,'publicBuses/SYN-101'),s=>{if(s.val()?.active)pub.add(s.val().capturedAt)}));
 unsubs.push(db.onValue(db.ref(admin.db,'liveBuses/SYN-101'),s=>{if(s.val()?.active)priv.add(s.val().capturedAt)}));
 session=await startDriverTracking(options);const offered:number[]=[];
 for(let n=1;n<=60;n++){await sleep(1000);const p=position(n);offered.push(p.timestamp);latest=p.timestamp;watch(p);}
 await until(async()=>pub.has(latest)&&priv.has(latest),'Last GPS missing from public/admin listeners');
 expect(offered.every(t=>pub.has(t)&&priv.has(t))).toBe(true);expect(errors).toEqual([]);
 const live=await value(admin,'liveBuses/SYN-101'),publicBus=await value(anon,'publicBuses/SYN-101');expect(live.speedMps).toBe(6);expect(publicBus.driverUid).toBeUndefined();expect(publicBus.speedMps).toBeUndefined();
 report.offered=60;report.publicDistinct=offered.filter(t=>pub.has(t)).length;report.adminDistinct=offered.filter(t=>priv.has(t)).length;pass('60 distinct one-second GPS fixes reached public/admin listeners with changing position and private speed');
 const stale={latitude:39.1,longitude:-86.1,accuracyMeters:8,speedMps:6,headingDeg:45,capturedAt:latest-1000};
 await denied(()=>db.update(db.ref(driver.db),sparkGpsUpdate(options,driver.auth.currentUser.uid,stale,db.serverTimestamp())),'Older GPS denied by deployed staging rules');
 await denied(()=>db.update(db.ref(driver.db),sparkGpsUpdate(options,driver.auth.currentUser.uid,{...stale,capturedAt:latest},db.serverTimestamp())),'Altered duplicate denied');
 await denied(()=>db.update(db.ref(disabled.db),sparkGpsUpdate(options,disabled.auth.currentUser.uid,{...stale,capturedAt:Date.now()},db.serverTimestamp())),'Disabled driver GPS denied');
 const same={latitude:live.latitude,longitude:live.longitude,accuracyMeters:live.accuracyMeters,speedMps:live.speedMps,headingDeg:live.headingDeg,capturedAt:live.capturedAt};
 await db.update(db.ref(driver.db),sparkGpsUpdate(options,driver.auth.currentUser.uid,same,db.serverTimestamp()));pass('Exact unchanged retry remains idempotent');
 for(const field of ['latitude','longitude','accuracyMeters','capturedAt','busNumber','route','active'])expect(publicBus[field],field+' projection mismatch').toEqual(live[field]);pass('Public/private GPS projections agree and public fields remain sanitized');
 for(const change of [{capturedAt:Date.now()+120000},{capturedAt:Date.now()-360000},{capturedAt:'invalid'},{latitude:91},{speedMps:91},{accuracyMeters:-1}])await denied(()=>db.update(db.ref(driver.db),sparkGpsUpdate(options,driver.auth.currentUser.uid,{...same,...change} as any,db.serverTimestamp())),'Malformed, future or expired telemetry denied: '+Object.keys(change)[0]);
 await denied(()=>db.update(db.ref(driver.db),sparkGpsUpdate(options,disabled.auth.currentUser.uid,{...same,capturedAt:Date.now()},db.serverTimestamp())),'Forged driver identity denied');
 const cached:any=sparkGpsUpdate(options,driver.auth.currentUser.uid,{...same,capturedAt:Date.now()},db.serverTimestamp());for(const entry of Object.values(cached) as any[])delete entry.capturedAt;
 await denied(()=>db.update(db.ref(driver.db),cached),'Unpatched cached-client timestamp-free upload denied');
 for(const attack of [{'liveBuses/SYN-101':null},{'publicBuses/SYN-101':null},{'liveBuses/SYN-101/capturedAt':null,'publicBuses/SYN-101/capturedAt':null},{'publicBuses/SYN-101/latitude':40}])await denied(()=>db.update(db.ref(driver.db),attack),'Cached-client deletion or projection bypass denied');
 expect((await value(admin,'liveBuses/SYN-101')).capturedAt).toBe(latest);pass('Rejected uploads preserve the authoritative capture watermark');
 db.goOffline(driver.db);
 await until(async()=>!(await value(admin,'liveBuses/SYN-101')).active&&(await value(admin,'activeDrivers/SYN-101'))===null,'Disconnect cleanup failed');pass('Disconnect atomically marked projections inactive and released own lock');
 db.goOnline(driver.db);await until(async()=>errors.length>0,'Lost session was not reported');expect(errors.some(e=>/connection ended|session ended/i.test(e))).toBe(true);await session.stop();session=null;errors.length=0;
 await denied(()=>db.update(db.ref(driver.db),cached),'Cached client cannot resume after disconnect without a valid lock');
 await denied(()=>db.update(db.ref(driver.db),sparkGpsUpdate(options,driver.auth.currentUser.uid,{...same,capturedAt:Date.now()},db.serverTimestamp())),'Missing-session GPS denied after reconnect');
 session=await startDriverTracking(options);await sleep(1100);const resumed=position(61);watch(resumed);await until(async()=>(await value(admin,'liveBuses/SYN-101')).capturedAt===resumed.timestamp,'Explicit reconnect/restart failed');pass('Reconnect fails closed, then explicit restart resumes authorized GPS');
 await session.stop();session=null;expect(await value(admin,'activeDrivers/SYN-101')).toBe(null);expect((await value(anon,'publicBuses/SYN-101')).active).toBe(false);pass('Stop marks both projections inactive and releases lock');
 for(const [p,h]of Object.entries(before))expect(digest(await value(admin,p)),p+' changed').toBe(h);pass('Buses, drivers, geofences, history, incidents, audit and device records unchanged');
 report.result='PASS';
 }catch(e){report.result='FAIL';report.error=e instanceof Error?e.message:String(e);throw e}finally{if(session){try{db.goOnline(shared.runtime.db);await session.stop()}catch{}}for(const u of unsubs)u();for(const c of clients)await deleteApp(c.app);vi.unstubAllGlobals();fs.writeFileSync('.staging.local/staging-smoke-result.json',JSON.stringify(report,null,2));}
},150000);

