import { sb, route, HttpError } from './_lib.js';

// Regroupe les actions « vie du pointage » : justification des retards, interventions, congés, saisie manuelle.
const MOTIFS = ['Intervention client', 'Transport', 'Rendez-vous externe', 'Autre'];
const TYPES_CONGE = ['Congé annuel', 'Congé maladie', 'Congé maternité/paternité', 'Congé exceptionnel', 'Autre'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = (s) => /^\d{2}:\d{2}$/.test(s || '');
const ts = (d, t) => new Date(`${d}T${t}:00Z`); // Abidjan = UTC+0
const must = (ok, msg, code = 400) => { if (!ok) throw new HttpError(code, msg); };
const log = (row) => sb.from('attendance_log').insert(row);
const inTeam = (me, row) => me.role === 'admin' || row.manager_id === me.id;
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

const ACTIONS = {
  // Un employé justifie son retard (motif + commentaire) : statut « en attente de validation ».
  'late-reason': { roles: ['employee', 'manager'], fn: async ({ id, motif, comment }, me) => {
    must(MOTIFS.includes(motif), 'Motif invalide');
    const com = String(comment || '').trim();
    if (motif === 'Autre') must(com.length >= 3, 'Précisez le motif');
    const { data: a } = await sb.from('attendance').select('*').eq('id', id).maybeSingle();
    must(a && a.uid === me.id && a.late, 'Retard introuvable', 404);
    must(!a.late_status || a.late_status === 'refusé', 'Ce retard a déjà une justification');
    await sb.from('attendance').update({ late_motif: motif, late_comment: com || null, late_status: 'en attente', late_decided_by: null, late_decided_at: null }).eq('id', id);
    await log({ attendance_id: id, uid: me.id, by_id: me.id, action: 'justification de retard', motif: motif + (com ? ' – ' + com : ''), before: { late_status: a.late_status }, after: { late_status: 'en attente' } });
    return { ok: true };
  } },

  // Le manager (de l'équipe) ou l'admin valide ou refuse la justification.
  'decide-late': { roles: ['manager', 'admin'], fn: async ({ id, approve }, me) => {
    const { data: a } = await sb.from('attendance').select('*').eq('id', id).maybeSingle();
    must(a && a.late_status === 'en attente', 'Demande introuvable ou déjà traitée', 409);
    must(inTeam(me, a), 'Cette demande n’est pas dans votre équipe', 403);
    const st = approve ? 'validé' : 'refusé', now = new Date();
    await sb.from('attendance').update({ late_status: st, late_decided_by: me.id, late_decided_at: now }).eq('id', id);
    await log({ attendance_id: id, uid: a.uid, by_id: me.id, action: 'décision sur retard', motif: st, before: { late_status: a.late_status }, after: { late_status: st } });
    return { ok: true };
  } },

  // Déclaration d'une intervention chez un client (heures, ou journées entières sans scan).
  'declare-intervention': { roles: ['employee', 'manager'], fn: async ({ client, dateStart, dateEnd, startTime, endTime, fullDay, comment }, me) => {
    must(String(client || '').trim().length >= 2, 'Client ou site requis');
    must(isDate(dateStart), 'Date invalide');
    const end = fullDay ? (dateEnd || dateStart) : dateStart;
    must(isDate(end) && end >= dateStart, 'Dates invalides');
    must((Date.parse(end) - Date.parse(dateStart)) / 864e5 <= 14, '14 jours au maximum par déclaration');
    if (!fullDay) must(isTime(startTime) && isTime(endTime) && endTime > startTime, 'Heures invalides');
    await sb.from('interventions').insert({
      uid: me.id, matricule: me.matricule, nom: me.nom, prenom: me.prenom, manager_id: me.manager_id,
      client: String(client).trim(), date_start: dateStart, date_end: end,
      start_time: fullDay ? null : startTime, end_time: fullDay ? null : endTime, full_day: !!fullDay,
      comment: String(comment || '').trim() || null });
    return { ok: true };
  } },

  // Validation d'une intervention : justifie les arrivées tardives, crée les présences des journées sans scan.
  'decide-intervention': { roles: ['manager', 'admin'], fn: async ({ id, approve }, me) => {
    const { data: it } = await sb.from('interventions').select('*').eq('id', id).maybeSingle();
    must(it && it.status === 'en attente', 'Demande introuvable ou déjà traitée', 409);
    must(inTeam(me, it), 'Cette demande n’est pas dans votre équipe', 403);
    const now = new Date();
    await sb.from('interventions').update({ status: approve ? 'validée' : 'refusée', decided_by: me.id, decided_at: now }).eq('id', id);
    if (approve) {
      const { data: rows } = await sb.from('attendance').select('*').eq('uid', it.uid).gte('date', it.date_start).lte('date', it.date_end);
      const byDay = new Map((rows || []).map((r) => [r.date, r]));
      for (let t = Date.parse(it.date_start); t <= Date.parse(it.date_end); t += 864e5) {
        const d = dayStr(t), r = byDay.get(d);
        if (r) {
          if (r.late && r.late_status !== 'validé') {
            await sb.from('attendance').update({ late_status: 'validé', late_motif: 'Intervention client', late_comment: it.client, late_decided_by: me.id, late_decided_at: now }).eq('id', r.id);
            await log({ attendance_id: r.id, uid: it.uid, by_id: me.id, action: 'retard justifié par intervention', motif: it.client, before: { late_status: r.late_status }, after: { late_status: 'validé' } });
          }
        } else if (it.full_day) {
          const ci = ts(d, '08:00'), co = ts(d, '17:00');
          await sb.from('attendance').insert({ uid: it.uid, matricule: it.matricule, nom: it.nom, prenom: it.prenom, manager_id: it.manager_id,
            date: d, check_in: ci, check_out: co, duration_min: 540, anomalies: ['intervention sans pointage'], source: 'intervention',
            note: it.client, manual_by: me.id, manual_at: now });
        }
      }
    }
    return { ok: true };
  } },

  // Congé déjà validé dans l'autre système, déclaré ici. L'admin peut le saisir pour quelqu'un.
  'declare-leave': { roles: ['employee', 'manager', 'admin'], fn: async ({ uid, type, startDate, returnDate, reference, comment }, me) => {
    let p = me;
    if (uid && uid !== me.id) {
      must(me.role === 'admin', 'Accès refusé', 403);
      const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      must(data && ['employee', 'manager'].includes(data.role), 'Employé introuvable', 404);
      p = data;
    }
    must(['employee', 'manager'].includes(p.role), 'Compte non concerné');
    must(TYPES_CONGE.includes(type), 'Type de congé invalide');
    must(isDate(startDate) && isDate(returnDate) && returnDate > startDate, 'Le retour doit être après le départ');
    must((Date.parse(returnDate) - Date.parse(startDate)) / 864e5 <= 120, '120 jours au maximum par déclaration');
    must(String(reference || '').trim().length >= 2, 'Référence de la validation requise');
    const { data: ov } = await sb.from('leaves').select('id').eq('uid', p.id).neq('status', 'contesté').lt('start_date', returnDate).gt('return_date', startDate);
    must(!(ov || []).length, 'Un congé déjà déclaré chevauche ces dates', 409);
    await sb.from('leaves').insert({ uid: p.id, matricule: p.matricule, nom: p.nom, prenom: p.prenom, manager_id: p.manager_id,
      type, start_date: startDate, return_date: returnDate, reference: String(reference).trim(),
      comment: String(comment || '').trim() || null, declared_by: me.id });
    return { ok: true };
  } },

  // Contrôle a posteriori : le manager ou l'admin marque un congé « vérifié » ou « contesté » (alors non pris en compte).
  'check-leave': { roles: ['manager', 'admin'], fn: async ({ id, status }, me) => {
    must(['vérifié', 'contesté'].includes(status), 'Statut invalide');
    const { data: l } = await sb.from('leaves').select('*').eq('id', id).maybeSingle();
    must(l, 'Congé introuvable', 404);
    must(inTeam(me, l), 'Ce congé n’est pas dans votre équipe', 403);
    await sb.from('leaves').update({ status, checked_by: me.id, checked_at: new Date() }).eq('id', id);
    return { ok: true };
  } },

  // Saisie ou correction manuelle d'un pointage par l'administrateur, avec motif obligatoire et trace.
  'admin-attendance': { roles: ['admin'], fn: async ({ id, uid, date, checkIn, checkOut, motif }, me) => {
    const m = String(motif || '').trim();
    must(m.length >= 3, 'Motif obligatoire');
    must(isDate(date) && isTime(checkIn) && isTime(checkOut) && checkOut > checkIn, 'Date ou heures invalides');
    const ci = ts(date, checkIn), co = ts(date, checkOut), now = new Date();
    const base = { date, check_in: ci, check_out: co, duration_min: Math.round((co - ci) / 60000), manual_by: me.id, manual_at: now, note: m, source: 'manuel', auto_closed: false };
    if (id) {
      const { data: b } = await sb.from('attendance').select('*').eq('id', id).maybeSingle();
      must(b, 'Pointage introuvable', 404);
      const anomalies = [...new Set([...(b.anomalies || []), 'modifié par l’administrateur'])];
      await sb.from('attendance').update({ ...base, anomalies }).eq('id', id);
      await log({ attendance_id: id, uid: b.uid, by_id: me.id, action: 'modification manuelle', motif: m,
        before: { date: b.date, check_in: b.check_in, check_out: b.check_out }, after: { date, check_in: ci, check_out: co } });
    } else {
      const { data: p } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      must(p && ['employee', 'manager'].includes(p.role), 'Employé introuvable', 404);
      const { data: ins, error } = await sb.from('attendance').insert({ uid: p.id, matricule: p.matricule, nom: p.nom, prenom: p.prenom,
        manager_id: p.manager_id, ...base, anomalies: ['saisie manuelle'] }).select('id').single();
      must(!error, error && error.message);
      await log({ attendance_id: ins.id, uid: p.id, by_id: me.id, action: 'saisie manuelle', motif: m, before: null, after: { date, check_in: ci, check_out: co } });
    }
    return { ok: true };
  } },
};

export default route([], async (body, me) => {
  const a = ACTIONS[body.action];
  if (!a || !a.roles.includes(me.role)) throw new HttpError(403, 'Accès refusé');
  return a.fn(body, me);
});
