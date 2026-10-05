import { sb } from '../supabase.js';
import { app, $ } from '../ui.js';

export function login(msg = '') {
  app(`<div class=card><h2>Connexion</h2>
  <div class=row><input id=i placeholder="Matricule" autocomplete=username><input id=p type=password placeholder="Mot de passe" autocomplete=current-password><button id=go>Se connecter</button></div>
  <p class=ko>${msg}</p></div>`);
  $('#go').onclick = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: $('#i').value.trim().toLowerCase() + '@pointage.local', password: $('#p').value });
    if (error) login('Matricule ou mot de passe incorrect');
  };
}
