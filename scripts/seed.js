// Crée le premier admin (A001) et la borne (K000).
// Usage : définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY, puis  node scripts/seed.js MDP_ADMIN MDP_BORNE
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [pwAdmin, pwKiosk] = process.argv.slice(2);
if (!pwAdmin || !pwKiosk) { console.error('Mots de passe requis'); process.exit(1); }
for (const [matricule, nom, prenom, role, password] of [
  ['A001', 'ADMIN', 'RH', 'admin', pwAdmin],
  ['K000', 'BORNE', 'Entrée', 'kiosk', pwKiosk],
]) {
  const { data, error } = await sb.auth.admin.createUser({ email: matricule.toLowerCase() + '@pointage.local', password, email_confirm: true });
  if (error) { console.error(matricule, error.message); continue; }
  await sb.from('profiles').insert({ id: data.user.id, matricule, nom, prenom, role });
  console.log('Créé :', matricule);
}
