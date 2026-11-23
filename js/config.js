// Where Property Inspect keeps its shared data.
//
// Same Supabase project and key/value table as Human Being and Human Doing.
// Every Property Inspect row is namespaced "prop:<space code>:…", so the apps
// never collide.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const isLocalHost = LOCAL_HOSTS.includes(location.hostname);

// `?mock` (local dev only) points sync at dev-server.js's fake table instead
// of the real database; `?mock=0` switches back.
try {
  const q = new URLSearchParams(location.search);
  if (q.get('mock') === '0') localStorage.removeItem('prop:mock');
  else if (q.has('mock')) localStorage.setItem('prop:mock', '1');
} catch (e) { /* storage blocked: stay on the real database */ }

let mockFlag = false;
try { mockFlag = localStorage.getItem('prop:mock') === '1'; } catch (e) {}

// This app's version (shown on Us; the Android app's versionName matches it).
export const VERSION = '1.10';

export const CONFIG = {
  supabaseUrl: 'https://njywijcqspkwebfqesjx.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qeXdpamNxc3Brd2ViZnFlc2p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTAwODcsImV4cCI6MjA4OTgyNjA4N30.2dAP4tXOr1ukQy8Q3_GkMjKhOfnwSCMnTjp9ofd79ls',
  table: 'tb_store',
  mock: isLocalHost && mockFlag,
  pollMs: 30000,             // check for your partner's changes while the app is on screen
  fullCheckMs: 10 * 60000,   // every row's stamp, in case a wrong clock hid a change
};

export const apiBase = () => (CONFIG.mock ? location.origin : CONFIG.supabaseUrl);
