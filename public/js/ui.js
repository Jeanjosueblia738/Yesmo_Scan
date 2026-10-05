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
