import { sb, route, HttpError } from './_lib.js';
// Manager (de l'équipe) ou admin : approuve ou refuse une correction.
export default route(['admin', 'manager'], async ({ id, approve }, me) => {
  const { data: c } = await sb.from('corrections').select('*').eq('id', id).maybeSingle();
  if (!c || c.status !== 'en attente') throw new HttpError(409, 'Demande introuvable ou déjà traitée');
  if (me.role === 'manager' && c.manager_id !== me.id) throw new HttpError(403, 'Cette demande n’est pas dans votre équipe');
  if (approve) {
    const ci = new Date(`${c.date}T${c.in_time}:00Z`), co = new Date(`${c.date}T${c.out_time}:00Z`); // Abidjan = UTC+0
    const { error } = await sb.from('attendance').insert({
      uid: c.uid, matricule: c.matricule, nom: c.nom, prenom: c.prenom, manager_id: c.manager_id, date: c.date,
      check_in: ci, check_out: co, duration_min: Math.round((co - ci) / 60000), anomalies: ['corrigé'],
    });
    if (error) throw new HttpError(409, error.message);
  }
  await sb.from('corrections').update({ status: approve ? 'approuvée' : 'refusée', decided_by: me.id, decided_at: new Date() }).eq('id', id);
  return { ok: true };
});
