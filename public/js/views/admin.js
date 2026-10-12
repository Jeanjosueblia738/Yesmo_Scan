import { sb, api } from '../supabase.js';
import { app, $, fd, hm, getGeo, esc, statusOf, outLabel, today, LATE_FROM } from '../ui.js';
import { work } from '../work.js';
import { pendingBlock } from './corrections.js';
import { validationsBlock, todayBlock } from './validations.js';
import { eachDay, absenceEnd, absences, ouvrés, effectivePeriod } from '../period.js';

let ATT = [], LV = [], IT = [], NAME = {}, PEOPLE = [], EDIT = null, LOADED = { a: '', b: '' };
let loadSeq = 0;

export async function admin() {
  const { data: ps } = await sb.from('profiles').select('*').order('matricule');
  const all = ps || [];
  NAME = Object.fromEntries(all.map((p) => [p.id, `${p.nom} ${p.prenom}`]));
  const users = all.filter((p) => ['employee', 'manager'].includes(p.role));
  PEOPLE = users;
  const period = effectivePeriod('', '', today());
  const [pend, vals, day, log] = await Promise.all([
    pendingBlock(), validationsBlock(), todayBlock(users.filter((u) => u.active)),
    sb.from('attempts').select('*').order('ts', { ascending: false }).limit(8),
  ]);
  EDIT = null;
  const managers = users.filter((u) => u.role === 'manager').map((u) => `<option value=${u.id}>${esc(u.nom)} ${esc(u.prenom)}</option>`).join('');
  const people = users.map((u) => `<option value=${u.id}>${esc(u.nom)} ${esc(u.prenom)}</option>`).join('');

  app(`${day.html}${vals.html}${pend.html}
  <div class=card><h3>Créer un compte</h3><div class=row>
    <input id=n placeholder="Nom (état civil)"><input id=pr placeholder="Prénom"><input id=pw placeholder="Mot de passe initial (6 car. min.)">
    <select id=ro><option value=employee>Employé<option value=manager>Manager</select><select id=mg><option value="">Sans manager${managers}</select><button id=add>Créer le compte</button></div><p id=msg></p></div>
  <div class="card w"><h3>Comptes</h3><table><tr><th>Matricule<th>Nom<th>Prénom<th>Rôle<th>Appareil<th>Statut<th></tr>
  ${users.map((u) => `<tr><td>${esc(u.matricule)}<td>${esc(u.nom)}<td>${esc(u.prenom)}<td>${u.role}<td>${u.device_id ? 'lié' : '—'}<td class=${u.active ? 'ok' : 'ko'}>${u.active ? 'actif' : 'désactivé'}<td><button class=g data-rel="${u.id}">Libérer l’appareil</button> <button class=g data-act="${u.id}" data-to="${u.active ? 0 : 1}">${u.active ? 'Désactiver' : 'Réactiver'}</button>`).join('')}</table></div>

  <div class=card id=manCard><h3>Saisie ou correction manuelle d’un pointage</h3><p class=m>Le motif est obligatoire. Chaque saisie ou modification est tracée (qui, quand, avant/après).</p>
    <div class=row><select id=mu>${people}</select><input type=date id=md><input type=time id=mi><input type=time id=mo><input id=mm placeholder="Motif (obligatoire)" style="flex:1"></div>
    <div class=row><button id=ms>Enregistrer</button><button class=g id=mc hidden>Annuler la modification</button></div><p id=mr></p></div>

  <div class=card><h3>Déclarer un congé pour un employé</h3><p class=m>Congé déjà validé dans le système de congés.</p>
    <div class=row><select id=lu>${people}</select><select id=lt><option>Congé annuel<option>Congé maladie<option>Congé maternité/paternité<option>Congé exceptionnel<option>Autre</select><label class=m>Départ <input type=date id=ls></label><label class=m>Retour <input type=date id=lr></label></div>
    <div class=row><input id=lf placeholder="Référence de la validation"><input id=lc placeholder="Commentaire (facultatif)" style="flex:1"><button id=lb>Déclarer</button></div><p id=lm></p></div>

  <div class=card><h3>Site (géolocalisation souple)</h3><div class=row><button class=g id=site>Utiliser ma position comme site</button><input id=rad type=number value=150 style="width:100px"><span class=m>mètres</span></div>
  <p class=m>Un pointage hors rayon est signalé en anomalie, jamais bloqué.</p></div>

  <div class=card><h3>Pointages</h3><div class=row id=f><input type=date id=d1 value="${period.a}"><input type=date id=d2 value="${period.b}">
    <select id=se><option value="">Tous les employés${users.map((u) => `<option value=${esc(u.matricule)}>${esc(u.nom)} ${esc(u.prenom)}</option>`).join('')}</select><button id=exp>Exporter en Excel</button></div>
    <p class=m id=periodNote>Chargement de la période…</p><div class=w id=tb></div>
    <details><summary id=absSum>Absences de la période</summary>
    <p class=m>Lundi au vendredi, sans pointage, sans congé (même encore à vérifier) et sans intervention validée. Les jours fériés ne sont pas retirés. Seuls les comptes actifs sont comptés.</p>
    <div class=w id=abs></div></details></div>
  <div class="card w"><h3>Dernières tentatives</h3><table><tr><th>Heure<th>Résultat<th>Détail</tr>
  ${(log.data || []).map((l) => `<tr><td>${fd(l.ts)}<td class=${l.result === 'ok' ? 'ok' : 'ko'}>${l.result}<td>${esc(l.reason)}`).join('')}</table></div>`);

  const body = () => ({ nom: $('#n').value.trim(), prenom: $('#pr').value.trim(), password: $('#pw').value, role: $('#ro').value, managerId: $('#mg').value || null });
  $('#add').onclick = async () => {
    const btn = $('#add');
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      let r;
      try { r = await api('create-user', body()); }
      catch (e) {
        if (!e.message.startsWith('DOUBLON:')) throw e;
        if (!confirm(`Un compte existe déjà pour ce nom et prénom (${e.message.slice(8)}). Créer quand même un homonyme ?`)) { btn.disabled = false; return; }
        r = await api('create-user', { ...body(), force: true });
      }
      alert('Compte créé : ' + r.matricule); admin();
    } catch (e) { $('#msg').innerHTML = `<span class=ko>${esc(e.message)}</span>`; btn.disabled = false; }
  };
  document.querySelectorAll('[data-rel]').forEach((b) => (b.onclick = async () => { await api('release-device', { uid: b.dataset.rel }); admin(); }));
  document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.to === '0' && !confirm('Désactiver ce compte ? La personne ne pourra plus pointer.')) return;
    await api('set-active', { uid: b.dataset.act, active: b.dataset.to === '1' }); admin();
  }));

  $('#ms').onclick = async () => {
    $('#ms').disabled = true;
    try {
      await work('admin-attendance', { id: EDIT, uid: $('#mu').value, date: $('#md').value, checkIn: $('#mi').value, checkOut: $('#mo').value, motif: $('#mm').value });
      admin();
    } catch (e) { $('#mr').innerHTML = `<span class=ko>${esc(e.message)}</span>`; $('#ms').disabled = false; }
  };
  $('#mc').onclick = () => admin();
  $('#lb').onclick = async () => {
    $('#lb').disabled = true;
    try { await work('declare-leave', { uid: $('#lu').value, type: $('#lt').value, startDate: $('#ls').value, returnDate: $('#lr').value, reference: $('#lf').value, comment: $('#lc').value }); admin(); }
    catch (e) { $('#lm').innerHTML = `<span class=ko>${esc(e.message)}</span>`; $('#lb').disabled = false; }
  };
  $('#site').onclick = async () => {
    const g = await getGeo();
    if (!g) return alert('Position indisponible');
    await sb.from('settings').upsert({ key: 'site', value: { ...g, radiusM: +$('#rad').value || 150 } });
    alert('Site enregistré');
  };
  $('#se').oninput = () => { table(); showAbsences(); };
  $('#d1').onchange = () => loadPeriod();
  $('#d2').onchange = () => loadPeriod();
  $('#exp').onclick = exportXlsx;
  loadPeriod();
  pend.wire(admin); vals.wire(admin);
}

const filt = () => ({ a: $('#d1').value, b: $('#d2').value, e: $('#se').value });
const rows = () => { const { e } = filt(); return ATT.filter((x) => !e || x.matricule === e); };
const dayNum = (s) => Date.parse(s + 'T00:00:00Z') / 864e5;
const overlaps = (s, en, a, b) => (!b || s <= b) && (!a || en >= a); // [s, en] inclusifs
const leaves = () => { const { a, b, e } = filt(); return LV.filter((l) => l.status !== 'contesté' && (!e || l.matricule === e) && overlaps(l.start_date, new Date(dayNum(l.return_date) * 864e5 - 864e5).toISOString().slice(0, 10), a, b)); };
const interventions = () => { const { a, b, e } = filt(); return IT.filter((i) => i.status === 'validée' && (!e || i.matricule === e) && overlaps(i.date_start, i.date_end, a, b)); };
const leaveDays = (l, a, b) => Math.max(0, Math.min(dayNum(l.return_date), b ? dayNum(b) + 1 : Infinity) - Math.max(dayNum(l.start_date), a ? dayNum(a) : -Infinity));
const motif = (x) => (x.late_motif ? x.late_motif + (x.late_comment ? ' – ' + x.late_comment : '') : x.note || '');

function table() {
  const list = rows();
  $('#tb').innerHTML = list.length
    ? '<table><tr><th>Matricule<th>Nom<th>Date<th>Arrivée<th>Départ<th>Durée<th>Statut<th>Anomalie<th></tr>' +
      list.map((x) => `<tr><td>${esc(x.matricule)}<td>${esc(x.nom)} ${esc(x.prenom)}<td>${x.date}<td>${hm(x.check_in)}<td>${outLabel(x)}<td>${x.duration_min != null ? x.duration_min + ' min' : ''}<td>${esc(statusOf(x))}<td>${esc((x.anomalies || []).join(', '))}<td><button class=g data-edit="${x.id}">Modifier</button>`).join('') + '</table>'
    : '<p class=m>Aucun pointage sur cette période.</p>';
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const x = ATT.find((r) => r.id === b.dataset.edit); EDIT = x.id;
    $('#mu').value = x.uid; $('#md').value = x.date;
    $('#mi').value = new Date(x.check_in).toISOString().slice(11, 16);
    $('#mo').value = x.check_out ? new Date(x.check_out).toISOString().slice(11, 16) : '';
    $('#mm').value = ''; $('#mu').disabled = true; $('#mc').hidden = false;
    $('#mr').innerHTML = '<span class=m>Modification d’un pointage existant : indiquez le motif.</span>';
    $('#manCard').scrollIntoView({ behavior: 'smooth' });
  }));
}

async function fetchAll(make) {
  const page = 1000, out = [];
  for (let from = 0; from < 100000; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

function fetchPeriod(a, b) {
  return Promise.all([
    fetchAll(() => sb.from('attendance').select('*').gte('date', a).lte('date', b).order('date').order('id')),
    fetchAll(() => sb.from('leaves').select('*').lte('start_date', b).gt('return_date', a).order('start_date').order('id')),
    fetchAll(() => sb.from('interventions').select('*').lte('date_start', b).gte('date_end', a).order('date_start').order('id')),
  ]).then(([att, lv, it]) => ({ att, lv, it }));
}

let loadError = '';

async function loadPeriod() {
  loadError = '';
  const { a, b, invalid } = effectivePeriod($('#d1').value, $('#d2').value, today());
  if (invalid) {
    ATT = []; LV = []; IT = []; LOADED = { a: '', b: '' };
    loadError = 'La date de début est après la date de fin.';
    $('#periodNote').textContent = loadError;
    $('#tb').innerHTML = ''; $('#abs').innerHTML = ''; $('#absSum').textContent = 'Absences de la période';
    return false;
  }
  if (!$('#d1').value) $('#d1').value = a;
  if (!$('#d2').value) $('#d2').value = b;
  const seq = ++loadSeq;
  $('#tb').innerHTML = '<p class=m>Chargement de la période…</p>';
  try {
    const got = await fetchPeriod(a, b);
    if (seq !== loadSeq) return false;
    ATT = got.att; LV = got.lv; IT = got.it; LOADED = { a, b };
    table(); showAbsences();
    return true;
  } catch (e) {
    if (seq !== loadSeq) return false;
    ATT = []; LV = []; IT = []; LOADED = { a: '', b: '' };
    loadError = e.message;
    $('#periodNote').textContent = 'Le chargement de la période a échoué.';
    $('#tb').innerHTML = `<p class=ko>${esc(e.message)}</p>`;
    $('#abs').innerHTML = ''; $('#absSum').textContent = 'Absences de la période';
    return false;
  }
}

function absenceWindow() {
  const end = absenceEnd(today(), new Date().toISOString().slice(11, 16), LATE_FROM, LOADED.b);
  return { days: eachDay(LOADED.a, end), end };
}

function currentAbsences() {
  const { e } = filt();
  const { days } = absenceWindow();
  const people = PEOPLE.filter((p) => p.active && (!e || p.matricule === e));
  return absences(people, days, rows(), leaves(), interventions());
}

function showAbsences() {
  const { a, b } = LOADED;
  if (!a) return;
  const list = currentAbsences();
  const n = rows().length;
  const { end } = absenceWindow();
  const pts = n ? `${n} pointage${n > 1 ? 's' : ''}` : 'Aucun pointage';
  const abs = list.length ? `${list.length} jour${list.length > 1 ? 's' : ''} d’absence` : 'Aucune absence';
  $('#periodNote').textContent = a > end
    ? `Il est moins de ${LATE_FROM} : aujourd’hui n’est pas encore compté comme une absence. ${pts}.`
    : `${pts} du ${a} au ${b}. ${abs} jusqu’au ${end}. L’Excel contient toute la période, sans limite de lignes.`;
  const by = new Map();
  for (const x of list) {
    if (!by.has(x.matricule)) by.set(x.matricule, { ...x, dates: [] });
    by.get(x.matricule).dates.push(x.date);
  }
  const groups = [...by.values()];
  $('#absSum').textContent = `Absences de la période (${list.length} jour${list.length > 1 ? 's' : ''})`;
  $('#abs').innerHTML = groups.length
    ? '<table><tr><th>Matricule<th>Nom<th>Jours<th>Dates</tr>' + groups.map((g) => `<tr><td>${esc(g.matricule)}<td>${esc(g.nom)} ${esc(g.prenom)}<td>${g.dates.length}<td>${esc(g.dates.join(', '))}`).join('') + '</table>'
    : '<p class=m>Aucune absence sur les jours ouvrés de cette période.</p>';
}

async function exportXlsx() {
  const btn = $('#exp');
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Export…';
  try {
    const ok = await loadPeriod();
    if (!ok) { if (loadError) alert(loadError); return; }
    writeWorkbook();
  } catch (e) { alert(e.message); }
  finally { btn.disabled = false; btn.textContent = label; }
}

function writeWorkbook() {
  const { a, b } = LOADED, { e } = filt(), A = rows(), Lv = leaves(), It = interventions();
  const by = (x) => NAME[x.late_decided_by || x.manual_by] || '';
  const at = (x) => x.late_decided_at || x.manual_at;
  const P = A.map((x) => ({ Matricule: x.matricule, Nom: x.nom, Prénom: x.prenom, Date: x.date, Arrivée: hm(x.check_in),
    Départ: x.auto_closed ? 'départ non pointé' : x.check_out ? hm(x.check_out) : '', 'Durée (min)': x.duration_min ?? '',
    Statut: statusOf(x), Motif: motif(x), 'Validé par': by(x), 'Date de validation': at(x) ? fd(at(x)) : '',
    Anomalie: (x.anomalies || []).join(', '), Source: x.source }));
  const C = Lv.map((l) => ({ Matricule: l.matricule, Nom: l.nom, Prénom: l.prenom, Type: l.type, Départ: l.start_date, Retour: l.return_date,
    'Jours de congé': leaveDays(l, a, b), Référence: l.reference, Statut: l.status === 'déclaré' ? 'Congé déclaré (à vérifier)' : 'Congé vérifié',
    'Déclaré par': NAME[l.declared_by] || '', 'Vérifié par': NAME[l.checked_by] || '', 'Date de contrôle': l.checked_at ? fd(l.checked_at) : '', Commentaire: l.comment || '' }));
  const I = It.map((i) => ({ Matricule: i.matricule, Nom: i.nom, Prénom: i.prenom, 'Client / site': i.client, Du: i.date_start, Au: i.date_end,
    Heures: i.full_day ? 'journée(s) entière(s)' : `${i.start_time}–${i.end_time}`, Statut: 'Intervention validée',
    'Validé par': NAME[i.decided_by] || '', 'Date de validation': i.decided_at ? fd(i.decided_at) : '', Commentaire: i.comment || '' }));
  const S = {};
  const row = (m, n, p) => (S[m] ||= { Matricule: m, Nom: n, Prénom: p, 'Jours ouvrés': 0, 'Jours pointés': 0, "Jours d'absence": 0, 'Jours de congé': 0, 'Interventions validées': 0, 'Retards (non justifiés)': 0, 'Retards justifiés validés': 0, 'Retards en attente': 0, 'Départs non pointés': 0, 'Heures travaillées': 0 });
  const { days } = absenceWindow();
  PEOPLE.filter((p) => p.active && (!e || p.matricule === e)).forEach((p) => {
    const o = row(p.matricule, p.nom, p.prenom);
    o['Jours ouvrés'] = ouvrés(days, (p.created_at || '1970-01-01').slice(0, 10));
  });
  const seen = new Set();
  A.forEach((x) => { const o = row(x.matricule, x.nom, x.prenom); if (!seen.has(x.matricule + x.date)) { seen.add(x.matricule + x.date); o['Jours pointés']++; }
    if (x.late) { if (x.late_status === 'validé') o['Retards justifiés validés']++; else if (x.late_status === 'en attente') o['Retards en attente']++; else o['Retards (non justifiés)']++; }
    if (x.auto_closed) o['Départs non pointés']++; o['Heures travaillées'] += (x.duration_min || 0) / 60; });
  Lv.forEach((l) => (row(l.matricule, l.nom, l.prenom)['Jours de congé'] += leaveDays(l, a, b)));
  It.forEach((i) => row(i.matricule, i.nom, i.prenom)['Interventions validées']++);
  const list = currentAbsences();
  list.forEach((x) => row(x.matricule, x.nom, x.prenom)["Jours d'absence"]++);
  const synth = Object.values(S).sort((p, q) => p.Matricule.localeCompare(q.Matricule));
  synth.forEach((o) => (o['Heures travaillées'] = +o['Heures travaillées'].toFixed(2)));
  const ABS = list.map((x) => ({ Matricule: x.matricule, Nom: x.nom, Prénom: x.prenom, Date: x.date, Jour: x.jour }));
  const wb = XLSX.utils.book_new();
  const headers = {
    Pointages: ['Matricule', 'Nom', 'Prénom', 'Date', 'Arrivée', 'Départ', 'Durée (min)', 'Statut', 'Motif', 'Validé par', 'Date de validation', 'Anomalie', 'Source'],
    Synthèse: ['Matricule', 'Nom', 'Prénom', 'Jours ouvrés', 'Jours pointés', "Jours d'absence", 'Jours de congé', 'Interventions validées', 'Retards (non justifiés)', 'Retards justifiés validés', 'Retards en attente', 'Départs non pointés', 'Heures travaillées'],
    Absences: ['Matricule', 'Nom', 'Prénom', 'Date', 'Jour'],
    Congés: ['Matricule', 'Nom', 'Prénom', 'Type', 'Départ', 'Retour', 'Jours de congé', 'Référence', 'Statut', 'Déclaré par', 'Vérifié par', 'Date de contrôle', 'Commentaire'],
    Interventions: ['Matricule', 'Nom', 'Prénom', 'Client / site', 'Du', 'Au', 'Heures', 'Statut', 'Validé par', 'Date de validation', 'Commentaire'],
  };
  [['Pointages', P], ['Synthèse', synth], ['Absences', ABS], ['Congés', C], ['Interventions', I]].forEach(([n, d]) => {
    const header = headers[n];
    const sheet = d.length ? XLSX.utils.json_to_sheet(d, { header }) : XLSX.utils.aoa_to_sheet([header]);
    XLSX.utils.book_append_sheet(wb, sheet, n);
  });
  XLSX.writeFile(wb, `pointages_${a}_${b}.xlsx`);
}
