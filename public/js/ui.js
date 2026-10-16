export const $ = (s) => document.querySelector(s);
export const app = (html) => ($('#app').innerHTML = html);
const TZ = { timeZone: 'Africa/Abidjan' };
export const fd = (t) => (t ? new Date(t).toLocaleString('fr-FR', TZ) : '—');
export const hm = (t) => (t ? new Date(t).toLocaleTimeString('fr-FR', { ...TZ, hour: '2-digit', minute: '2-digit' }) : '—');
export const deviceId = (() => {
  try {
    const id = localStorage.getItem('dev');
    if (id) return id;
    const next = crypto.randomUUID();
    localStorage.setItem('dev', next);
    return next;
  } catch {
    return 'sans-memoire';
  }
})();
export const getGeo = () =>
  new Promise((ok) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { timeout: 4000 })
      : ok(null));
export const S = { me: null, role: null };
export const nav = (v) => dispatchEvent(new CustomEvent('nav', { detail: v }));

// Échappe le texte saisi par les utilisateurs avant de l'insérer dans la page.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const today = () => new Date().toISOString().slice(0, 10); // Abidjan = UTC+0
export const LATE_FROM = '10:00'; // doit correspondre à la règle serveur (late_from)
export const outLabel = (a) => (a.check_out ? (a.auto_closed ? 'non pointé' : hm(a.check_out)) : '—');
export const statusOf = (a) => {
  if (a.source === 'intervention') return 'Intervention';
  if (a.late) return ({ 'validé': 'Retard justifié, validé', 'en attente': 'Retard justifié en attente de validation', 'refusé': 'Retard non justifié (justification refusée)' })[a.late_status] || 'Retard sans justification';
  return a.source === 'manuel' ? 'Saisie manuelle' : 'Présent';
};

export function alertBar(n) {
  if (!n) return '';
  const ask = typeof Notification !== 'undefined' && Notification.permission !== 'granted'
    ? '<button class=g id=bell>Activer les alertes du téléphone</button>' : '';
  return `<div class=card><p class=ko>${n} élément${n > 1 ? 's' : ''} à traiter.</p>${ask}</div>`;
}

export function notifyPending(n) {
  if (!n || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (sessionStorage.getItem('ys-notified') === String(n)) return;
  sessionStorage.setItem('ys-notified', String(n));
  try { new Notification('Yesmo Scan', { body: `${n} élément${n > 1 ? 's' : ''} à traiter` }); } catch { /* navigateur sans notification */ }
}

export function wireAlert(n) {
  const b = $('#bell');
  if (!b || typeof Notification === 'undefined') return;
  b.onclick = async () => {
    if ((await Notification.requestPermission()) === 'granted') {
      sessionStorage.removeItem('ys-notified');
      notifyPending(n);
      b.remove();
    }
  };
}

export function readProof(input) {
  const file = input && input.files && input.files[0];
  if (!file) return Promise.reject(new Error('Photo de la validation requise'));
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.72);
      if (data.length > 500000) reject(new Error('Photo trop lourde, recommencez plus près'));
      else resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
    img.src = url;
  });
}

export function showProof(src) {
  if (!String(src || '').startsWith('data:image/jpeg')) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;z-index:9';
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Pièce du congé';
  img.style.cssText = 'max-width:92%;max-height:92%';
  box.append(img);
  box.onclick = () => box.remove();
  document.body.append(box);
}
