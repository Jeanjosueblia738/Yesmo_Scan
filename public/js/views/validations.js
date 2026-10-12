import { sb } from '../supabase.js';
import { esc, hm, fd, today, statusOf, LATE_FROM } from '../ui.js';
import { work } from '../work.js';

const who = (r) => `${esc(r.nom)} ${esc(r.prenom)}`;
const TH = (...c) => `<tr>${c.map((x) => `<th>${x}`).join('')}</tr>`;

// Blocs « à traiter » : retards à valider, interventions à valider, congés déclarés à contrôler.
// Les règles d'accès Supabase limitent déjà les lignes visibles (équipe du manager, ou tout pour l'admin).
export async function validationsBlock() {
  const [late, itv, lv] = await Promise.all([
    sb.from('attendance').select('*').eq('late_status', 'en attente').order('check_in'),
    sb.from('interventions').select('*').eq('status', 'en attente').order('created_at'),
    sb.from('leaves').select('*').eq('status', 'déclaré').order('created_at'),
  ]);
  const L = late.data || [], I = itv.data || [], V = lv.data || [];
  const card = (title, n, body) => `<div class="card w"><h3>${title} (${n})</h3>${n ? body : '<p class=m>Rien à traiter.</p>'}</div>`;
  const html =
    card('Retards à valider', L.length, `<table>${TH('Employé', 'Date', 'Arrivée', 'Motif', 'Commentaire', '')}${L.map((a) =>
      `<tr><td>${who(a)}<td>${a.date}<td>${hm(a.check_in)}<td>${esc(a.late_motif)}<td>${esc(a.late_comment || '')}<td><button data-late="${a.id}" data-ok="1">Valider</button> <button class=g data-late="${a.id}" data-ok="0">Refuser</button>`).join('')}</table>`) +
    card('Interventions à valider', I.length, `<table>${TH('Employé', 'Client / site', 'Période', 'Heures', 'Commentaire', '')}${I.map((i) =>
      `<tr><td>${who(i)}<td>${esc(i.client)}<td>${i.date_start}${i.date_end !== i.date_start ? ' → ' + i.date_end : ''}<td>${i.full_day ? 'journée(s) entière(s)' : esc(i.start_time) + '–' + esc(i.end_time)}<td>${esc(i.comment || '')}<td><button data-itv="${i.id}" data-ok="1">Valider</button> <button class=g data-itv="${i.id}" data-ok="0">Refuser</button>`).join('')}</table>`) +
    card('Congés déclarés à contrôler', V.length, `<p class=m>Comparez avec la validation dans le système de congés. « Contester » retire le congé : les jours redeviennent des absences.</p><table>${TH('Employé', 'Type', 'Départ', 'Retour', 'Référence', 'Commentaire', '')}${V.map((l) =>
      `<tr><td>${who(l)}<td>${esc(l.type)}<td>${l.start_date}<td>${l.return_date}<td>${esc(l.reference)}<td>${esc(l.comment || '')}<td><button data-lv="${l.id}" data-st="vérifié">Vérifié</button> <button class=g data-lv="${l.id}" data-st="contesté">Contester</button>`).join('')}</table>`);
  const wire = (refresh) => {
    const on = (sel, act, body) => document.querySelectorAll(sel).forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await work(act, body(b)); refresh(); } catch (e) { alert(e.message); b.disabled = false; }
    }));
    on('[data-late]', 'decide-late', (b) => ({ id: b.dataset.late, approve: b.dataset.ok === '1' }));
    on('[data-itv]', 'decide-intervention', (b) => ({ id: b.dataset.itv, approve: b.dataset.ok === '1' }));
    on('[data-lv]', 'check-leave', (b) => ({ id: b.dataset.lv, status: b.dataset.st }));
  };
  return { html, wire };
}

// Situation du jour : présent, retard, congé, intervention, pas encore pointé, absent.
export async function todayBlock(people) {
  const d = today(), nowHm = new Date().toISOString().slice(11, 16);
  const [att, itv, lv] = await Promise.all([
    sb.from('attendance').select('*').eq('date', d),
    sb.from('interventions').select('uid, client, status').lte('date_start', d).gte('date_end', d).neq('status', 'refusée'),
    sb.from('leaves').select('uid, type').lte('start_date', d).gt('return_date', d).neq('status', 'contesté'),
  ]);
  const A = att.data || [], I = itv.data || [], V = lv.data || [];
  const state = (p) => {
    const rows = A.filter((a) => a.uid === p.id).sort((x, y) => +new Date(y.check_in) - +new Date(x.check_in));
    const leave = V.find((v) => v.uid === p.id), it = I.find((i) => i.uid === p.id);
    if (rows.length) { const a = rows[0]; return [`${a.check_out ? 'Sorti' : 'Présent'} (arrivée ${hm(rows[rows.length - 1].check_in)})${a.late || rows.some((r) => r.late) ? ', ' + statusOf(rows.find((r) => r.late) || a).toLowerCase() : ''}`, rows.some((r) => r.late && r.late_status !== 'validé') ? 'ko' : 'ok']; }
    if (leave) return [`En congé (${esc(leave.type)})`, 'm'];
    if (it) return [`Intervention ${it.status === 'validée' ? '' : 'déclarée (en attente) '}: ${esc(it.client)}`, 'm'];
    return nowHm < LATE_FROM ? ['Pas encore pointé', 'm'] : ['Absent (aucun pointage)', 'ko'];
  };
  const html = `<div class="card w"><h3>Situation du jour (${d})</h3><table>${TH('Employé', 'Situation')}${people.map((p) => {
    const [t, c] = state(p); return `<tr><td>${who(p)}<td class=${c}>${t}`; }).join('') || '<tr><td colspan=2 class=m>Aucune personne à afficher.'}</table></div>`;
  return { html };
}
