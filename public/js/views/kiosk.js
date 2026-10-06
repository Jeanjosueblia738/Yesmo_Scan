import { api } from '../supabase.js';
import { app, $ } from '../ui.js';

// Affiche le QR et le renouvelle quand le jeton change. Retourne l'intervalle pour l'arrêter.
export function kiosk() {
  const size = Math.round(Math.min(innerWidth * 0.8, innerHeight * 0.55, 420));
  app('<div class=card style="text-align:center"><h2>Scannez pour pointer</h2><div id=qr></div><p class=m>Le code change toutes les 15 secondes</p><p id=kerr class=ko></p></div>');
  const qr = new QRCode($('#qr'), { width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  let last = '';
  const tick = async () => {
    try {
      const t = (await api('kiosk-token')).token;
      $('#kerr').textContent = '';
      if (t !== last) { last = t; qr.makeCode(t); }
    } catch (e) { $('#kerr').textContent = 'Connexion au serveur impossible : ' + e.message; }
  };
  tick();
  return setInterval(tick, 5000);
}
