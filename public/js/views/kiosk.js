import { api } from '../supabase.js';
import { app, $ } from '../ui.js';

let wake;
async function arm() {
  try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
}
export function releaseScreen() {
  const s = wake;
  wake = null;
  s?.release?.().catch(() => {});
}

// Affiche le QR et le renouvelle quand le jeton change. Retourne l'intervalle pour l'arrêter.
export function kiosk() {
  const size = Math.round(Math.min(innerWidth * 0.8, innerHeight * 0.55, 420));
  app('<div class=card style="text-align:center"><h2>Scannez pour pointer</h2><div id=qr></div><p class=m>Le code change toutes les 15 secondes</p><p id=kerr class=ko></p></div>');
  let qr = null, last = '', waits = 0;
  const tick = async () => {
    try {
      if (!qr) {
        if (typeof QRCode !== 'function') {
          if (++waits > 3) $('#kerr').textContent = 'Le QR ne peut pas s’afficher. Vérifiez la connexion, puis rouvrez l’application.';
          return;
        }
        qr = new QRCode($('#qr'), { width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      }
      const t = (await api('kiosk-token')).token;
      $('#kerr').textContent = '';
      if (t !== last) { last = t; qr.makeCode(t); }
    } catch (e) { $('#kerr').textContent = 'Connexion au serveur impossible : ' + e.message; }
  };
  tick();
  arm();
  if (!globalThis.__ysWake) {
    globalThis.__ysWake = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && document.getElementById('qr')) arm();
    });
  }
  return setInterval(tick, 5000);
}
