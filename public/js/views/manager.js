import { sb } from '../supabase.js';
import { app, hm, nav, S } from '../ui.js';
import { pendingBlock } from './corrections.js';

export async function manager() {
  const pend = await pendingBlock();
  const { data } = await sb.from('attendance').select('*').eq('manager_id', S.me.id).order('check_in', { ascending: false }).limit(100);
  app(`<div class=row><button id=me>Mon pointage</button></div>${pend.html}
  <div class="card w"><h3>Présences de l’équipe</h3><table><tr><th>Employé<th>Date<th>Arrivée<th>Départ<th>Durée<th>Anomalie</tr>
  ${(data || []).map((x) => `<tr><td>${x.nom} ${x.prenom}<td>${x.date}<td>${hm(x.check_in)}<td>${hm(x.check_out)}<td>${x.duration_min != null ? x.duration_min + ' min' : ''}<td>${x.anomalies.join(', ')}`).join('')}</table></div>`);
  document.getElementById('me').onclick = () => nav('employee');
  pend.wire(manager);
}
