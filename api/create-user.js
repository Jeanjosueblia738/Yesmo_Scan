import { sb, route, HttpError } from './_lib.js';
// Admin : crée un employé ou un manager (matricule auto, nom en majuscules).
export default route(['admin'], async ({ nom, prenom, password, role, managerId }) => {
  role = role === 'manager' ? 'manager' : 'employee';
  if (!nom || !prenom || String(password || '').length < 6)
    throw new HttpError(400, 'Nom, prénom et mot de passe (6 caractères min.) requis');
  const { data: n } = await sb.rpc('next_counter', { p_role: role });
  const matricule = (role === 'manager' ? 'M' : 'E') + String(n).padStart(3, '0');
  const { data, error } = await sb.auth.admin.createUser({ email: matricule.toLowerCase() + '@pointage.local', password, email_confirm: true });
  if (error) throw new HttpError(400, error.message);
  const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, matricule, nom: String(nom).toUpperCase(), prenom, role, manager_id: managerId || null });
  if (e2) throw new HttpError(400, e2.message);
  return { matricule };
});
