import { sb, route } from './_lib.js';
// Lie le compte à un appareil à la première connexion.
export default route(['employee', 'manager'], async ({ deviceId }, me) => {
  if (!me.device_id) {
    await sb.from('profiles').update({ device_id: deviceId }).eq('id', me.id);
    return { bound: true };
  }
  return { bound: me.device_id === deviceId };
});
