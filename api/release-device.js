import { sb, route } from './_lib.js';
// Admin : libère l'appareil lié (changement de téléphone).
export default route(['admin'], async ({ uid }) => {
  await sb.from('profiles').update({ device_id: null }).eq('id', uid);
  return { ok: true };
});
