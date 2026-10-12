import { sb } from './_lib.js';
// Cron quotidien à minuit (heure d'Abidjan = UTC) : ferme les arrivées restées sans départ.
export default async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: 'Non autorisé' });
  const { data, error } = await sb.rpc('close_open_sessions', { p_uid: null });
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ closed: data });
};
