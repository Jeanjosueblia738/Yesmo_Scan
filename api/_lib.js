import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const TTL = 15; // secondes par créneau de jeton
export const slot = () => Math.floor(Date.now() / 1000 / TTL);
export const sign = (s) => s + '.' + crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(String(s)).digest('hex').slice(0, 16);

export class HttpError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

// Enveloppe commune : vérifie la session, charge le profil, contrôle le rôle.
export function route(roles, fn) {
  return async (req, res) => {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'POST requis');
      const jwt = (req.headers.authorization || '').replace('Bearer ', '');
      const { data: { user } } = await sb.auth.getUser(jwt);
      if (!user) throw new HttpError(401, 'Connexion requise');
      const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).single();
      if (!me || !me.active || (roles.length && !roles.includes(me.role))) throw new HttpError(403, 'Accès refusé');
      res.status(200).json(await fn(req.body || {}, me));
    } catch (e) {
      if (!e.code) console.error(e);
      res.status(e.code || 500).json({ error: e.code ? e.message : 'Erreur serveur' });
    }
  };
}
