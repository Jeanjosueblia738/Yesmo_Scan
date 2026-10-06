import { sb, route, HttpError } from './_lib.js';
// Admin : désactive ou réactive un compte (départ d'un employé).
export default route(['admin'], async ({ uid, active }, me) => {
  if (uid === me.id) throw new HttpError(400, 'Vous ne pouvez pas désactiver votre propre compte');
  await sb.from('profiles').update({ active: !!active }).eq('id', uid);
  return { ok: true };
});
