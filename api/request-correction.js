import { sb, route, HttpError } from './_lib.js';
// Employé ou manager : demande de correction (oubli de pointage, panne).
export default route(['employee', 'manager'], async ({ date, in: hin, out: hout, motif }, me) => {
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > today) throw new HttpError(400, 'Date invalide');
  if (!/^\d{2}:\d{2}$/.test(hin || '') || !/^\d{2}:\d{2}$/.test(hout || '') || hout <= hin)
    throw new HttpError(400, 'Heures invalides (le départ doit suivre l’arrivée)');
  if (String(motif || '').trim().length < 3) throw new HttpError(400, 'Motif requis');
  await sb.from('corrections').insert({
    uid: me.id, matricule: me.matricule, nom: me.nom, prenom: me.prenom, manager_id: me.manager_id,
    date, in_time: hin, out_time: hout, motif: String(motif).trim(),
  });
  return { ok: true };
});
