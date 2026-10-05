import { sb } from './_lib.js';
// Appelé chaque jour par le cron Vercel : évite la mise en pause du plan gratuit Supabase.
// Si CRON_SECRET est défini, Vercel l'envoie automatiquement et on refuse les autres appels.
export default async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'Non autorisé' });
  await sb.from('settings').select('key').limit(1);
  res.status(200).json({ ok: true });
};
