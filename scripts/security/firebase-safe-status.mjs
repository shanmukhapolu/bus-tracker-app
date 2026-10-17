import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
export function summarize(user,tokens){
 return {signedIn:Boolean(user?.email),account:typeof user?.email==='string'?user.email:null,hasLocalCredential:Boolean(tokens?.refresh_token||tokens?.access_token)};
}
// No subprocess, network calls, raw config, environment dumps, debug logging or token URLs.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error();
  const cli=process.env.FIREBASE_CLI_PATH;
  if(!cli||!cli.endsWith('firebase.js')||!fs.existsSync(cli))throw Error();
  const require=createRequire(cli);const {configstore}=require('../configstore');
  console.log(JSON.stringify(summarize(configstore.get('user'),configstore.get('tokens')),null,2));
 }catch{console.error('Safe status unavailable. Set FIREBASE_CLI_PATH to firebase-tools/lib/bin/firebase.js. Do not print CLI credential configuration.');process.exitCode=1;}
}
