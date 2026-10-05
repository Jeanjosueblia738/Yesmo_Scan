import { api } from '../supabase.js';
import { app, $ } from '../ui.js';

// Affiche le QR et le renouvelle quand le jeton change. Retourne l'intervalle pour l'arrêter.
export function kiosk() {
  app('<div class=card style="text-align:center"><h2>Scannez pour pointer</h2><div id=qr></div><p class=m>Le code change toutes les 15 secondes</p></div>');
  const qr = new QRCode($('#qr'), { width: 280, height: 280 });
  let last = '';
  const tick = async () => {
    try {
      const t = (await api('kiosk-token')).token;
      if (t !== last) { last = t; qr.makeCode(t); }
    } catch { /* réseau coupé : on garde le dernier QR */ }
  };
  tick();
  return setInterval(tick, 5000);
}
