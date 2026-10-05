import { sb, api } from '../supabase.js';

// Bloc « corrections à valider ». Les règles d'accès limitent déjà les lignes visibles (équipe ou tout pour l'admin).
export async function pendingBlock() {
  const { data } = await sb.from('corrections').select('*').eq('status', 'en attente').order('created_at');
  const items = data || [];
  const html = `<div class="card w"><h3>Corrections à valider (${items.length})</h3>` + (items.length
    ? `<table><tr><th>Employé<th>Date<th>Arrivée<th>Départ<th>Motif<th></tr>${items.map((c) =>
      `<tr><td>${c.nom} ${c.prenom}<td>${c.date}<td>${c.in_time}<td>${c.out_time}<td>${c.motif}<td><button data-id="${c.id}" data-dec="1">Approuver</button> <button class=g data-id="${c.id}" data-dec="0">Refuser</button>`).join('')}</table>`
    : '<p class=m>Aucune demande en attente.</p>') + '</div>';
  const wire = (refresh) => document.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = async () => {
    try { await api('decide-correction', { id: b.dataset.id, approve: b.dataset.dec === '1' }); refresh(); }
    catch (e) { alert(e.message); }
  }));
  return { html, wire };
}
