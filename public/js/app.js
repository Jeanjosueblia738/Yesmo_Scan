// Point d'entrée : route selon le rôle du profil de l'utilisateur connecté.
import { sb } from './supabase.js';
import { $, S } from './ui.js';
import { login } from './views/login.js';
import { employee } from './views/employee.js';
import { manager } from './views/manager.js';
import { kiosk, releaseScreen } from './views/kiosk.js';
import { admin } from './views/admin.js';

globalThis.__ysBooted = true;
let cur, timer, booted = false;
const views = { employee, manager, admin };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
addEventListener('nav', (e) => { const fn = views[e.detail]; if (fn) fn(); });

function showError(message) {
  $('#h').innerHTML = '<span>Yesmo Scan</span>';
  $('#app').innerHTML = '<p class=ko></p><p class=m><a href="/?reset=1">Réinitialiser l\'application</a></p>';
  $('#app').firstChild.textContent = message || 'Ouverture impossible';
}

async function start(session) {
  const uid = session ? session.user.id : null;
  if (uid === cur) return; // ignore les rafraîchissements de jeton
  const prev = cur;
  cur = uid;
  clearInterval(timer);
  releaseScreen();
  try {
    if (!uid) {
      $('#h').innerHTML = '<span>Yesmo Scan</span>';
      booted = true;
      return login();
    }
    if (!$('#app').textContent.trim()) $('#app').innerHTML = '<p class=m>Ouverture…</p>';
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', uid).single();
    if (error || !me) {
      const msg = error ? 'Connexion au profil impossible' : 'Compte sans profil';
      try { await sb.auth.signOut(); } catch { /* on affiche la connexion quand même */ }
      cur = null;
      booted = true;
      return login(msg);
    }
    S.me = me; S.role = me.role;
    $('#h').innerHTML = `<span>${me.prenom} ${me.nom}</span><button class=g id=out style="color:#fff;border-color:#fff">Quitter</button>`;
    $('#out').onclick = () => sb.auth.signOut();
    booted = true;
    if (me.role === 'kiosk') timer = kiosk();
    else if (views[me.role]) await views[me.role]();
    else login('Ce compte n’a pas d’écran.');
  } catch (e) {
    cur = prev;
    booted = true;
    showError(e.message);
  }
}
// Hors du verrou interne de Supabase : un appel attendu dans le callback peut figer l’écran.
sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => start(session), 0); });
setTimeout(() => {
  if (!booted) login('L’ouverture prend trop de temps. Vérifiez le réseau, puis réessayez.');
}, 12000);
