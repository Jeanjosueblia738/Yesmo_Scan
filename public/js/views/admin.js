import { sb, api } from '../supabase.js';
import { app, $, fd, hm, getGeo } from '../ui.js';
import { pendingBlock } from './corrections.js';

let ATT = [];

export async function admin() {
  const pend = await pendingBlock();
  const { data: us } = await sb.from('profiles').select('*').in('role', ['employee', 'manager']).order('matricule');
  const users = us || [];
  const { data: att } = await sb.from('attendance').select('*').order('check_in', { ascending: false }).limit(500);
  ATT = att || [];
  const { data: log } = await sb.from('attempts').select('*').order('ts', { ascending: false }).limit(8);
  const managers = users.filter((u) => u.role === 'manager').map((u) => `<option value=${u.id}>${u.nom} ${u.prenom}`).join('');

  app(`${pend.html}<div class=card><h3>Créer un compte</h3><div class=row>
    <input id=n placeholder="Nom (état civil)"><input id=pr placeholder="Prénom"><input id=pw placeholder="Mot de passe initial (6 car. min.)">
    <select id=ro><option value=employee>Employé<option value=manager>Manager</select><select id=mg><option value="">Sans manager${managers}</select><button id=add>Créer le compte</button></div><p id=msg></p></div>
  <div class="card w"><h3>Comptes</h3><table><tr><th>Matricule<th>Nom<th>Prénom<th>Rôle<th>Appareil<th></tr>
  ${users.map((u) => `<tr><td>${u.matricule}<td>${u.nom}<td>${u.prenom}<td>${u.role}<td>${u.device_id ? 'lié' : '—'}<td><button class=g data-rel="${u.id}">Libérer l’appareil</button>`).join('')}</table></div>
  <div class=card><h3>Site (géolocalisation souple)</h3><div class=row><button class=g id=site>Utiliser ma position comme site</button><input id=rad type=number value=150 style="width:100px"><span class=m>mètres</span></div>
  <p class=m>Un pointage hors rayon est signalé en anomalie, jamais bloqué.</p></div>
  <div class=card><h3>Pointages</h3><div class=row id=f><input type=date id=d1><input type=date id=d2>
    <select id=se><option value="">Tous les employés${users.map((u) => `<option value=${u.matricule}>${u.nom} ${u.prenom}`).join('')}</select><button id=exp>Exporter en Excel</button></div><div class=w id=tb></div></div>
  <div class="card w"><h3>Dernières tentatives</h3><table><tr><th>Heure<th>Résultat<th>Détail</tr>
  ${(log || []).map((l) => `<tr><td>${fd(l.ts)}<td class=${l.result === 'ok' ? 'ok' : 'ko'}>${l.result}<td>${l.reason}`).join('')}</table></div>`);

  $('#add').onclick = async () => {
    try {
      const r = await api('create-user', { nom: $('#n').value.trim(), prenom: $('#pr').value.trim(), password: $('#pw').value, role: $('#ro').value, managerId: $('#mg').value || null });
      alert('Compte créé : ' + r.matricule); admin();
    } catch (e) { $('#msg').innerHTML = `<span class=ko>${e.message}</span>`; }
  };
  document.querySelectorAll('[data-rel]').forEach((b) => (b.onclick = async () => { await api('release-device', { uid: b.dataset.rel }); admin(); }));
  $('#site').onclick = async () => {
    const g = await getGeo();
    if (!g) return alert('Position indisponible');
    await sb.from('settings').upsert({ key: 'site', value: { ...g, radiusM: +$('#rad').value || 150 } });
    alert('Site enregistré');
  };
  $('#f').oninput = table; $('#exp').onclick = exportXlsx; table(); pend.wire(admin);
}

const rows = () => {
  const a = $('#d1').value, b = $('#d2').value, e = $('#se').value;
  return ATT.filter((x) => (!a || x.date >= a) && (!b || x.date <= b) && (!e || x.matricule === e));
};

function table() {
  $('#tb').innerHTML = '<table><tr><th>Matricule<th>Nom<th>Date<th>Arrivée<th>Départ<th>Durée<th>Anomalie</tr>' +
    rows().map((x) => `<tr><td>${x.matricule}<td>${x.nom} ${x.prenom}<td>${x.date}<td>${hm(x.check_in)}<td>${hm(x.check_out)}<td>${x.duration_min != null ? x.duration_min + ' min' : ''}<td>${x.anomalies.join(', ')}`).join('') + '</table>';
}

function exportXlsx() {
  const r = rows().map((x) => ({ Matricule: x.matricule, Nom: x.nom, Prénom: x.prenom, Date: x.date, Arrivée: hm(x.check_in), Départ: x.check_out ? hm(x.check_out) : '', 'Durée (min)': x.duration_min ?? '', Anomalie: x.anomalies.join(', ') }));
  const s = {};
  r.forEach((x) => { const o = (s[x.Matricule] ||= { Matricule: x.Matricule, Nom: x.Nom, Prénom: x.Prénom, Jours: 0, 'Total (h)': 0 }); o.Jours++; o['Total (h)'] += (+x['Durée (min)'] || 0) / 60; });
  Object.values(s).forEach((o) => (o['Total (h)'] = +o['Total (h)'].toFixed(2)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), 'Pointages');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(s)), 'Synthèse');
  XLSX.writeFile(wb, 'pointages.xlsx');
}
