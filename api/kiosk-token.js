import { route, sign, slot } from './_lib.js';
// Borne : fournit le jeton du créneau courant.
export default route(['kiosk'], async () => ({ token: sign(slot()) }));
