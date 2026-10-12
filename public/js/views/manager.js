import { sb } from '../supabase.js';
import { app, hm, nav, S, esc, statusOf, outLabel, alertBar, notifyPending, wireAlert } from '../ui.js';
import { pendingBlock } from './corrections.js';
import { validationsBlock, todayBlock, journalBlock, watchPending } from './validations.js';

export async function manager() {
  const { data: team } = await sb.from('profiles').select('*').eq('manager_id', S.me.id).eq('active', true).order('nom');
  const names = Object.fromEntries((team || []).map((p) => [p.id, `${p.nom} ${p.prenom}`]));
  names[S.me.id] = `${S.me.nom} ${S.me.prenom}`;
  const [pend, vals, day, att, journal] = await Promise.all([
    pendingBlock(), validationsBlock(), todayBlock(team || []),
    sb.from('attendance').select('*').eq('manager_id', S.me.id).order('check_in', { ascending: false }).limit(100),
    journalBlock(names),
  ]);
  app(`<div class=row><button id=me>Mon pointage</button></div>${alertBar(vals.pending)}${day.html}${vals.html}${pend.html}
  <div class="card w"><h3>Présences de l’équipe</h3><table><tr><th>Employé<th>Date<th>Arrivée<th>Départ<th>Durée<th>Statut<th>Anomalie</tr>
  ${(att.data || []).map((x) => `<tr><td>${esc(x.nom)} ${esc(x.prenom)}<td>${x.date}<td>${hm(x.check_in)}<td>${outLabel(x)}<td>${x.duration_min != null ? x.duration_min + ' min' : ''}<td>${esc(statusOf(x))}<td>${esc((x.anomalies || []).join(', '))}`).join('')}</table></div>${journal}`);
  document.getElementById('me').onclick = () => nav('employee');
  pend.wire(manager);
  vals.wire(manager);
  wireAlert(vals.pending);
  notifyPending(vals.pending);
  watchPending(manager);
}
