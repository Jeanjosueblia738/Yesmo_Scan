import { sb, route, HttpError } from './_lib.js';

const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Admin : crée un employé ou un manager (matricule auto, nom en majuscules).
// Refuse un homonyme (même nom et prénom) sauf confirmation explicite (force).
export default route(['admin'], async ({ nom, prenom, password, role, managerId, force }) => {
  role = role === 'manager' ? 'manager' : 'employee';
  if (!nom || !prenom || String(password || '').length < 6)
    throw new HttpError(400, 'Nom, prénom et mot de passe (6 caractères min.) requis');
  const NOM = String(nom).trim().toUpperCase();
  const { data: same } = await sb.from('profiles').select('matricule, prenom').eq('nom', NOM);
  const dup = (same || []).find((p) => norm(p.prenom) === norm(prenom));
  if (dup && !force) throw new HttpError(409, 'DOUBLON:' + dup.matricule);

  const { data: n } = await sb.rpc('next_counter', { p_role: role });
  const matricule = (role === 'manager' ? 'M' : 'E') + String(n).padStart(3, '0');
  const { data, error } = await sb.auth.admin.createUser({ email: matricule.toLowerCase() + '@pointage.local', password, email_confirm: true });
  if (error) throw new HttpError(400, error.message);
  const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, matricule, nom: NOM, prenom: String(prenom).trim(), role, manager_id: managerId || null });
  if (e2) { await sb.auth.admin.deleteUser(data.user.id); throw new HttpError(400, e2.message); }
  return { matricule };
});
