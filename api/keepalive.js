import { sb } from './_lib.js';
// Appelé chaque jour par le cron Vercel : évite la mise en pause du plan gratuit Supabase.
// CRON_SECRET est obligatoire : Vercel l'envoie, tout autre appel est refusé.
export default async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'Non autorisé' });
  await sb.from('settings').select('key').limit(1);
  res.status(200).json({ ok: true });
};
