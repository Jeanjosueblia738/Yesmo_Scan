// À renseigner : Supabase > Project Settings > API (URL du projet + clé anon/publishable).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const sb = createClient('https://kvmllehwesxucdoryghl.supabase.co', 'sb_publishable_LqluoEako5ky9TKoYR5DpQ_dxzed6bv');

// Appel d'une route /api avec la session de l'utilisateur.
export async function api(name, body = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Erreur');
  return j;
}
