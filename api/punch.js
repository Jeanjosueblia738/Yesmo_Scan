import { sb, route, sign, slot, ticket, HttpError } from './_lib.js';

const dist = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742e3 * Math.asin(Math.sqrt(h));
};
const today = () => new Date().toISOString().slice(0, 10); // Abidjan = UTC+0
const hhmm = (d = new Date()) => d.toISOString().slice(11, 16);

// Pointage en deux temps :
//  1) sans « confirm » : vérifie le code et renvoie un aperçu (arrivée ou départ, retard, avertissements) sans rien écrire ;
//  2) avec « confirm » : l'employé a validé, l'écriture atomique se fait en SQL (do_punch).
export default route(['employee', 'manager'], async ({ token, deviceId, geo, confirm, exp, tk }, me) => {
  const log = (result, reason) => sb.from('attempts').insert({ uid: me.id, result, reason, device_id: deviceId || null });
  const refuse = async (m) => { await log('refusé', m); throw new HttpError(409, m); };

  const [s] = String(token || '').split('.');
  if (token !== sign(+s)) return refuse('Code invalide');

  if (!confirm) {
    if (!(+s === slot() || +s === slot() - 1)) return refuse('Code expiré, rescannez la borne');
    if (me.device_id !== deviceId) return refuse('Appareil non reconnu pour ce compte. Demandez à l’admin de libérer l’appareil.');
    if (me.last_token === token) return refuse('Code déjà utilisé, attendez le suivant');

    const day = today();
    const [{ data: rows }, { data: open }, { data: lv }, { data: cfg }] = await Promise.all([
      sb.from('attendance').select('check_in, check_out').eq('uid', me.id).eq('date', day),
      sb.from('attendance').select('id, date').eq('uid', me.id).is('check_out', null).maybeSingle(),
      sb.from('leaves').select('id').eq('uid', me.id).neq('status', 'contesté').lte('start_date', day).gt('return_date', day).limit(1),
      sb.from('settings').select('value').eq('key', 'rules').maybeSingle(),
    ]);
    const R = rows || [], LV = lv || [];
    const last = Math.max(0, ...R.flatMap((r) => [+new Date(r.check_in), r.check_out ? +new Date(r.check_out) : 0]));
    if (last && Date.now() - last < 120000) return refuse('Pointage déjà enregistré il y a moins de 2 minutes (doublon refusé)');

    const warnings = [];
    let type = 'Entrée';
    if (open && open.date === day) type = 'Sortie';
    else if (open) warnings.push('Votre dernière arrivée n’a pas de départ : elle sera clôturée en « départ non pointé ».');
    if (type === 'Entrée' && R.length) warnings.push('Vous avez déjà pointé aujourd’hui : cette arrivée sera enregistrée comme une nouvelle entrée.');
    if (type === 'Entrée' && LV.length) warnings.push('Un congé est déclaré aujourd’hui : ce pointage sera signalé.');
    const lateFrom = (cfg && cfg.value && cfg.value.lateFrom) || '10:00';
    const late = type === 'Entrée' && !R.length && !LV.length && hhmm() >= lateFrom;

    const until = Date.now() + 90000;
    return { preview: true, type, at: Date.now(), late, lateFrom, warnings, exp: until, tk: ticket(me.id, token, until) };
  }

  if (!(exp > Date.now()) || tk !== ticket(me.id, token, exp)) return refuse('Confirmation expirée, rescannez la borne');

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
