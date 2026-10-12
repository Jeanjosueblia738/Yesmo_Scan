export const $ = (s) => document.querySelector(s);
export const app = (html) => ($('#app').innerHTML = html);
const TZ = { timeZone: 'Africa/Abidjan' };
export const fd = (t) => (t ? new Date(t).toLocaleString('fr-FR', TZ) : '—');
export const hm = (t) => (t ? new Date(t).toLocaleTimeString('fr-FR', { ...TZ, hour: '2-digit', minute: '2-digit' }) : '—');
export const deviceId = localStorage.getItem('dev') || (localStorage.setItem('dev', crypto.randomUUID()), localStorage.getItem('dev'));
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
