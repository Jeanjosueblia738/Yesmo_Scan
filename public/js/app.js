// Point d'entrée : route selon le rôle du profil de l'utilisateur connecté.
import { sb } from './supabase.js';
import { $, S } from './ui.js';
import { login } from './views/login.js';
import { employee } from './views/employee.js';
import { manager } from './views/manager.js';
import { kiosk } from './views/kiosk.js';
import { admin } from './views/admin.js';

let cur = null, timer;
const views = { employee, manager, admin };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
addEventListener('nav', (e) => views[e.detail]());

async function start(session) {
  const uid = session ? session.user.id : null;
  if (uid === cur) return; // ignore les rafraîchissements de jeton
  cur = uid;
  clearInterval(timer);
  if (!uid) { $('#h').innerHTML = '<span>Yesmo Scan</span>'; return login(); }
  const { data: me } = await sb.from('profiles').select('*').eq('id', uid).single();
  if (!me) { await sb.auth.signOut(); return login('Compte sans profil'); }
  S.me = me; S.role = me.role;
  $('#h').innerHTML = `<span>${me.prenom} ${me.nom}</span><button class=g id=out style="color:#fff;border-color:#fff">Quitter</button>`;
  $('#out').onclick = () => sb.auth.signOut();
  if (me.role === 'kiosk') timer = kiosk();
  else views[me.role]();
}
sb.auth.onAuthStateChange((_e, session) => start(session));
