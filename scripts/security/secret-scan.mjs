import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function detect(text, known=[]){
 const patterns=[
 ['google-refresh',/\b1\/\/[A-Za-z0-9_-]{30,}/],
 ['google-access',/\bya29\.[A-Za-z0-9_.-]{30,}/],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{30,}?-----END/],
 ['jwt',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/],
 ['credential-url',/https?:\/\/[^\s/@:]+:[^\s/@]{8,}@/],
 ['literal-password',/(?<![\w-])["']?(?:password|refresh_token|access_token|client_secret)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/i],
 ];
 return [...patterns.filter(([,r])=>r.test(text)).map(([id])=>id),...(known.some(v=>v.length>=8&&text.includes(v))?['known-local-credential']:[])];
}
export function scan(root){
 const git=args=>execFileSync('git',['-c',`safe.directory=${root}`,...args],{cwd:root,encoding:'utf8',maxBuffer:256*1024*1024,stdio:['ignore','pipe','pipe']});
 const known=[];const journal=path.join(root,'.staging.local/cloud-accounts.json');
 if(fs.existsSync(journal)){for(const a of JSON.parse(fs.readFileSync(journal,'utf8')).accounts??[])if(a.password)known.push(a.password);}
 const findings=[];let files=0,blobs=0;const skipped=[];
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(['.git','node_modules'].includes(e.name)||e.isSymbolicLink())continue;
  const p=path.join(dir,e.name);if(e.isDirectory()){walk(p);continue;}if(!e.isFile())continue;
  const rel=path.relative(root,p).replaceAll('\\','/');const b=fs.readFileSync(p);files++;if(b.includes(0))continue;
  const ids=detect(b.toString('utf8'),known);if(ids.length) {
   let ignored=false;try{git(['check-ignore','--',rel]);ignored=true}catch{}
   findings.push({scope:ignored?'ignored-local':'working-tree',path:rel,rules:ids});
  }
 }};walk(root);
 const history=git(['rev-list','--objects','--all']).trim().split('\n').filter(Boolean).map(s=>s.split(' ')[0]);
 const index=git(['ls-files','--stage']).trim().split('\n').filter(Boolean).map(s=>s.split(/\s+/)[1]);
 const objects=[...new Set([...history,...index])];
 const common=path.resolve(root,git(['rev-parse','--git-common-dir']).trim());
 const config=path.join(common,'config');
 if(fs.existsSync(config)){const ids=detect(fs.readFileSync(config,'utf8'),known);if(ids.length)findings.push({scope:'git-config',path:'.git/config',rules:ids});}
 // Batch object reads never send their contents to stdout or temporary files.
 const types=execFileSync('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{cwd:root,input:objects.join('\n')+'\n',encoding:'utf8',maxBuffer:256*1024*1024}).trim().split('\n');
 for(const entry of types){const [sha,type]=entry.split(' ');if(type!=='blob')continue;blobs++;const b=execFileSync('git',['cat-file','blob',sha],{cwd:root,maxBuffer:256*1024*1024});if(b.includes(0))continue;const ids=detect(b.toString('utf8'),known);if(ids.length)findings.push({scope:'git-history',blob:sha,rules:ids});}
 return {repository:path.basename(root),head:git(['rev-parse','HEAD']).trim(),files,blobs,skipped,findings,limitations:['Pattern-based scan; false positives require review. No remote-only unreachable objects or dependency binaries scanned.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {const result=scan(path.resolve(process.argv[2]??'.'));console.log(JSON.stringify(result,null,2));if(result.findings.some(f=>f.scope!=='ignored-local'||f.rules.some(r=>!['literal-password','known-local-credential'].includes(r))))process.exitCode=1;}
 catch {console.error('Secret scan could not complete; release blocked. No raw error output emitted.');process.exitCode=2;}
}
