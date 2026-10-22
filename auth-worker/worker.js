/**
 * MY ASSET NOTE — Cloudflare Worker OAuth + private GitHub backup.
 * Secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET (>=32 chars)
 * Vars: SITE_ORIGIN=https://<user>.github.io
 *       REPO=shallo9505/F_USA_private
 *       ALLOWED_GITHUB_LOGIN=<your exact GitHub login>
 *       WORKER_ORIGIN=https://<your-worker>.workers.dev
 */
const enc=new TextEncoder(), dec=new TextDecoder();
const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const parseCookies=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1)]}));
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const secret=async env=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(env.SESSION_SECRET)),'AES-GCM',false,['encrypt','decrypt']);
async function seal(data,env){const iv=crypto.getRandomValues(new Uint8Array(12)),body=await crypto.subtle.encrypt({name:'AES-GCM',iv},await secret(env),enc.encode(JSON.stringify(data)));return b64(iv)+'.'+b64(body)}
async function unseal(value,env){try{const [i,v]=value.split('.');const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(i)},await secret(env),unb64(v));return JSON.parse(dec.decode(plaintext))}catch{return null}}
const setCookie=(name,value,age=86400*7)=>name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=None; Max-Age='+age;
const clearCookie=name=>setCookie(name,'',0);
function originAllowed(req,env){return req.headers.get('Origin')===env.SITE_ORIGIN}
async function gh(path,token,options={}){const res=await fetch('https://api.github.com'+path,{...options,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'my-asset-note-worker',...(options.headers||{})}});return res}
async function identity(token){const r=await gh('/user',token);if(!r.ok)throw Error('GitHub 인증 실패');return r.json()}
async function auth(req,env){const s=await unseal(parseCookies(req).asset_session||'',env);if(!s||s.exp<Date.now())return null;const user=await identity(s.token);if(user.login.toLowerCase()!==env.ALLOWED_GITHUB_LOGIN.toLowerCase())return null;return {token:s.token,login:user.login}}
function callbackUrl(env){return env.WORKER_ORIGIN.replace(/\/$/,'')+'/auth/callback'}
function cors(env){return {'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}}
function redirect(url,headers={}){return new Response(null,{status:302,headers:{Location:url,'cache-control':'no-store',...headers}})}
export default {async fetch(req,env){
try{
if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.SESSION_SECRET||!env.SITE_ORIGIN||!env.REPO||!env.ALLOWED_GITHUB_LOGIN||!env.WORKER_ORIGIN)return json({error:'Missing server configuration'},503);
const u=new URL(req.url),p=u.pathname,headers=cors(env);
if(req.method==='OPTIONS'){if(!originAllowed(req,env))return new Response(null,{status:403});return new Response(null,{status:204,headers})}
if(p==='/auth/login'){
const returnTo=u.searchParams.get('return')||env.SITE_ORIGIN+'/asset-note.html';
if(new URL(returnTo).origin!==env.SITE_ORIGIN)return json({error:'Invalid return origin'},400);
const nonce=b64(crypto.getRandomValues(new Uint8Array(24)));
const state=await seal({nonce,returnTo,exp:Date.now()+600000},env);
const url=new URL('https://github.com/login/oauth/authorize');
url.searchParams.set('client_id',env.GITHUB_CLIENT_ID);url.searchParams.set('redirect_uri',callbackUrl(env));
url.searchParams.set('scope','repo');url.searchParams.set('state',nonce);
return redirect(url.toString(),{'Set-Cookie':setCookie('asset_oauth_state',state,600)});
}
if(p==='/auth/callback'){
const s=await unseal(parseCookies(req).asset_oauth_state||'',env);
if(!s||s.exp<Date.now()||s.nonce!==u.searchParams.get('state'))return json({error:'OAuth state validation failed'},403);
const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:u.searchParams.get('code'),redirect_uri:callbackUrl(env)})});
const tr=await tokenRes.json();if(!tr.access_token) return json({error:'OAuth token exchange failed'},403);
const me=await identity(tr.access_token);if(me.login.toLowerCase()!==env.ALLOWED_GITHUB_LOGIN.toLowerCase())return json({error:'This GitHub account is not authorized'},403);
const sealed=await seal({token:tr.access_token,exp:Date.now()+7*86400000},env);
const h=new Headers({Location:s.returnTo,'cache-control':'no-store'});h.append('Set-Cookie',setCookie('asset_session',sealed));h.append('Set-Cookie',clearCookie('asset_oauth_state'));return new Response(null,{status:302,headers:h});
}
if(!p.startsWith('/api/')&&p!=='/auth/logout')return json({service:'asset-note-auth',status:'ready'});
if(!originAllowed(req,env))return json({error:'Origin not allowed'},403,headers);
if(p==='/auth/logout'&&req.method==='POST')return json({ok:true},200,{...headers,'Set-Cookie':clearCookie('asset_session')});
const a=await auth(req,env);if(!a)return json({error:'Not authenticated'},401,headers);
if(p==='/api/me'&&req.method==='GET')return json({login:a.login},200,headers);
if(p==='/api/backup'){
const path='/repos/'+env.REPO+'/contents/data/combined-backup.json';
if(req.method==='GET'){
const r=await gh(path,a.token);if(r.status===404)return json({error:'No backup found'},404,headers);if(!r.ok)return json({error:'GitHub read failed'},r.status,headers);
const j=await r.json();const b=atob(j.content.replace(/\s/g,''));const bytes=Uint8Array.from(b,c=>c.charCodeAt(0));return new Response(dec.decode(bytes),{status:200,headers:{...headers,'content-type':'application/json','cache-control':'no-store'}});
}
if(req.method==='PUT'){
const txt=await req.text();if(txt.length>2500000)return json({error:'Backup too large'},413,headers);
let backup;try{backup=JSON.parse(txt)}catch{return json({error:'Bad JSON'},400,headers)}
if(backup.format!=='asset-note-combined'||backup.version!==1)return json({error:'Unknown backup format'},422,headers);
const prev=await gh(path,a.token);let sha;
if(prev.ok)sha=(await prev.json()).sha;else if(prev.status!==404)return json({error:'Unable to inspect backup'},prev.status,headers);
const encoded=btoa(Array.from(enc.encode(txt),c=>String.fromCharCode(c)).join(''));
const r=await gh(path,a.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Backup unified asset note',content:encoded,...(sha?{sha}:{})})});
if(!r.ok)return json({error:'GitHub write failed',detail:(await r.text()).slice(0,250)},r.status,headers);
return json({ok:true,updatedAt:new Date().toISOString()},200,headers);
}}
return json({error:'Not found'},404,headers);
}catch(e){return json({error:String(e?.message||e)},500)}
}};