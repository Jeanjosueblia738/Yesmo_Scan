import { sb, route, sign, slot, HttpError } from './_lib.js';

const dist = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742e3 * Math.asin(Math.sqrt(h));
};

// Pointage : valide le jeton ici, puis l'écriture atomique se fait en SQL (do_punch).
export default route(['employee', 'manager'], async ({ token, deviceId, geo }, me) => {
  const log = (result, reason) => sb.from('attempts').insert({ uid: me.id, result, reason, device_id: deviceId || null });
  const refuse = async (m) => { await log('refusé', m); throw new HttpError(409, m); };

  const [s] = String(token || '').split('.');
  const n = slot();
  if (!(+s === n || +s === n - 1)) return refuse('Code expiré, rescannez la borne');
  if (token !== sign(+s)) return refuse('Code invalide');

  // Géolocalisation en contrôle souple : signale, ne bloque pas.
  const { data: cfg } = await sb.from('settings').select('value').eq('key', 'site').maybeSingle();
  const c = cfg && cfg.value, anomalies = [];
  if (c && c.lat != null) {
    if (!geo) anomalies.push('position absente');
    else if (dist(geo, c) > (c.radiusM || 150)) anomalies.push('hors site');
  }

  const { data, error } = await sb.rpc('do_punch', { p_uid: me.id, p_token: token, p_device: deviceId || '', p_geo: geo || null, p_anoms: anomalies });
  if (error) return refuse(error.message);
  await log('ok', data.type);
  return data;
});
