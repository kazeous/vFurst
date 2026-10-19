// Integration proof with the same Traefik minor as Coolify. No Docker socket
// is mounted in either test container; only this isolated network is routed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testProxyConfig } from './proxy-config.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const temp = path.resolve(root, '../../../node_modules/.cache/account-branding-proxy-test');
fs.mkdirSync(temp, { recursive: true });
fs.writeFileSync(path.join(temp, 'dynamic.yaml'), JSON.stringify(testProxyConfig('http://brand-backend:3000')));
fs.writeFileSync(path.join(temp, 'backend.mjs'), `
import http from 'node:http'; import fs from 'node:fs';
http.createServer((req,res)=>{
 if(req.url==='/static/dist/assets/reyuugames/unavailable.html'){
  res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync('/assets/unavailable.html'));return;
 }
 res.setHeader('X-Powered-By','authentik');res.setHeader('X-Test-Security','retained');
 if(req.url==='/if/ok'){res.writeHead(200);res.end('Normal login');return;}
 if(req.url==='/if/missing'){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(502,{'Content-Type':req.url.startsWith('/api/')?'application/json':'text/plain'});
 res.end('authentik backend unavailable'+(req.url.startsWith('/if/fail')?' '.repeat(4096):''));
}).listen(3000,'0.0.0.0');`);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const suffix = `${process.pid}-${Date.now()}`;
const network = `reyuu-branding-${suffix}`;
const containers = [];
let createdNetwork = false;
try {
  docker('network', 'create', network); createdNetwork = true;
  containers.push(docker('run', '-d', '--network', network, '--network-alias', 'brand-backend',
    '--mount', `type=bind,source=${temp},target=/test,readonly`,
    '--mount', `type=bind,source=${path.join(root, 'assets')},target=/assets,readonly`,
    'node:24.16.0-bookworm-slim', 'node', '/test/backend.mjs'));
  containers.push(docker('run', '-d', '--network', network, '-p', '127.0.0.1:3189:80',
    '--mount', `type=bind,source=${temp},target=/test,readonly`, 'traefik:v3.7',
    '--entrypoints.web.address=:80', '--providers.file.filename=/test/dynamic.yaml', '--log.level=ERROR'));
  const request = (url, accept) => new Promise((resolve,reject) => {
    const req=http.get(`http://127.0.0.1:3189${url}`,
      { headers: { Host: 'account.reyuugames.com', Accept: accept, 'Accept-Encoding':'gzip' }, timeout:3000 }, res=>{
        const chunks=[]; res.on('data',chunk=>chunks.push(chunk));
        res.on('end',()=>{
          try {
            let bytes=Buffer.concat(chunks);
            if(res.headers['content-encoding']==='gzip')bytes=gunzipSync(bytes);
            resolve({status:res.statusCode,headers:{get:name=>res.headers[name]??null},text:async()=>bytes.toString()});
          } catch(error){reject(error);}
        });
      });
    req.on('error',reject); req.on('timeout',()=>req.destroy(new Error('Request timed out')));
  });
  let ready = false;
  for (let i=0; i<30; i++) {
    try { if ((await request('/if/ok', 'text/html')).status===200) { ready=true; break; } } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert(ready, 'Isolated proxy did not start');
  let response = await request('/if/fail?example=private', 'text/html');
  assert.equal(response.status,502);
  let body=await response.text();
  assert(body.includes('reyuuGAMES Account') && !body.includes('authentik'));
  assert(!body.includes('example=private'));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-powered-by'),null);
  response=await request('/if/fail','application/json');
  assert.equal(response.status,502); assert.equal((await response.text()).trim(),'authentik backend unavailable');
  response=await request('/api/v3/example','text/html');
  assert.equal(response.status,502); assert.equal(await response.text(),'authentik backend unavailable');
  response=await request('/static/example','text/html');
  assert.equal(response.status,502); assert.equal(await response.text(),'authentik backend unavailable');
  response=await request('/if/ok','text/html');
  assert.equal(response.status,200); assert.equal(await response.text(),'Normal login');
  assert.equal(response.headers.get('x-test-security'),'retained');
  response=await request('/if/missing','text/html');
  assert.equal(response.status,404); assert.equal(await response.text(),'Not found');
  console.log('PASS: HTML 502 branded with original status/no-store; query omitted; API/JSON/static/200/404 preserved');
} catch (error) {
  for (const id of containers) console.error(docker('logs','--tail','15',id));
  throw error;
} finally {
  for (const id of containers.reverse()) docker('rm','-f',id);
  if (createdNetwork) docker('network','rm',network);
}
