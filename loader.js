'use strict';
(() => {
const $ = id => document.getElementById(id);
const say = t => { $('s').textContent = t; console.log('box: ' + t); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('box', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kget() {
  const db = await idb();
  return new Promise(res => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
}
async function kput(k) {
  const db = await idb();
  return new Promise(res => { const t = db.transaction('k', 'readwrite'); t.objectStore('k').put(k, 'key'); t.oncomplete = () => res(); t.onerror = () => res(); });
}
async function derive(pass, meta) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(meta.s), iterations: meta.it }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function fetchBlob(name) {
  const r = await fetch('b/' + name + '.bin', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function open(key, blob) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12) }, key, blob.subarray(12)));
}
async function readIndex(key, meta) {
  try { return JSON.parse(new TextDecoder().decode(await open(key, await fetchBlob(meta.i)))); } catch (e) { return null; }
}
async function install(key, meta, index) {
  const name = 'app-' + meta.v;
  await caches.delete(name);
  const cache = await caches.open(name);
  let done = 0, bytes = 0;
  const total = index.reduce((a, f) => a + f.n, 0);
  let next = 0;
  async function worker() {
    while (next < index.length) {
      const f = index[next++];
      const plain = await open(key, await fetchBlob(f.b));
      await cache.put(new Request('app/' + f.p), new Response(plain, { headers: { 'Content-Type': f.t } }));
      done++; bytes += f.n;
      say('Installing ' + Math.floor(100 * bytes / Math.max(1, total)) + '%');
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const k of await caches.keys()) if (k.startsWith('app-') && k !== name) await caches.delete(k);
  localStorage.setItem('box:v', meta.v);
}
async function main() {
  console.log('box: start');
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 3000))]); } catch (e) { console.log('box: sw ' + e); }
  }
  console.log('box: sw done');
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }
  console.log('box: persist done');
  let meta = null;
  try { const r = await fetch('v.json', { cache: 'no-store' }); if (r.ok) meta = await r.json(); } catch (e) {}
  console.log('box: meta ' + (meta ? meta.v : 'none'));
  const have = localStorage.getItem('box:v');
  const haveCache = have ? await caches.has('app-' + have) : false;
  if (haveCache && (!meta || meta.v === have)) { location.replace('app/index.html'); return; }
  if (!meta) { say(haveCache ? '' : 'Offline. Open once while online to install.'); return; }
  console.log('box: have ' + have + ' ' + haveCache);
  let key = await kget();
  console.log('box: key ' + !!key);
  let index = key ? await readIndex(key, meta) : null;
  if (!index && window.__boxTestPass) {
    key = await derive(window.__boxTestPass, meta);
    index = await readIndex(key, meta);
    if (index) await kput(key);
  }
  if (!index) {
    key = null;
    $('f').style.display = 'flex';
    $('p').focus();
    await new Promise(res => {
      $('f').onsubmit = async ev => {
        ev.preventDefault();
        say('Checking...');
        const k = await derive($('p').value.trim(), meta);
        const ix = await readIndex(k, meta);
        if (!ix) { say('Wrong passphrase'); return; }
        key = k; index = ix; $('f').style.display = 'none'; res();
      };
    });
    await kput(key);
  }
  say('Installing...');
  try { await install(key, meta, index); } catch (e) { say('Install failed: ' + e.message); return; }
  location.replace('app/index.html');
}
main();
})();
