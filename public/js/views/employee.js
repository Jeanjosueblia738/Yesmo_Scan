import { sb, api } from '../supabase.js';
import { app, $, fd, hm, deviceId, getGeo, S, nav, esc, statusOf, outLabel, readProof } from '../ui.js';
import { work } from '../work.js';

const PENDING = 'yesmo-pending-punch';

const MOTIFS = ['Intervention client', 'Transport', 'Rendez-vous externe', 'Autre'];
const TYPES = ['Congé annuel', 'Congé maladie', 'Congé maternité/paternité', 'Congé exceptionnel', 'Autre'];
const opts = (a) => a.map((x) => `<option>${x}</option>`).join('');
const list = (arr, f) => (arr.length ? arr.map(f).join('') : '<p class=m>Aucune.</p>');

async function settlePending() {
  const raw = localStorage.getItem(PENDING);
  if (!raw) return null;
  let body;
  try { body = JSON.parse(raw); } catch { localStorage.removeItem(PENDING); return null; }
  if (!(body.exp > Date.now())) {
    localStorage.removeItem(PENDING);
    return { msg: '<span class=ko>Le pointage en attente a expiré. Scannez à nouveau la borne.</span>' };
  }
  try {
    const p = await api('punch', body);
    localStorage.removeItem(PENDING);
    if (p.late && !p.lateStatus) return { lateForm: { id: p.attendanceId, info: `${p.type} enregistrée à ${hm(p.at)}` } };
    return { msg: `<span class=ok>${esc(p.type)} enregistrée à ${esc(hm(p.at))}</span>` };
  } catch (e) {
    if (e.offline) return { msg: '<span class=m>Pointage en attente : il sera renvoyé dès que le réseau revient.</span>' };
    localStorage.removeItem(PENDING);
    return { msg: `<span class=ko>${esc(e.message)}</span>` };
  }
}

if (!globalThis.__ysOnline) {
  globalThis.__ysOnline = true;
  addEventListener('online', () => { if (localStorage.getItem(PENDING)) employee(); });
}

export async function employee(msg = '') {
  const pending = await settlePending();
  if (pending?.lateForm) return lateForm(pending.lateForm.id, pending.lateForm.info);
  if (pending?.msg) msg = pending.msg;
  const u = S.me;
  const bind = await api('bind-device', { deviceId }).catch(() => null);
  const foreign = bind && bind.bound === false;
  const q = (t) => sb.from(t).select('*').eq('uid', u.id);
  const [att, cor, itv, lv] = await Promise.all([
    q('attendance').order('check_in', { ascending: false }).limit(30),
    q('corrections').order('created_at', { ascending: false }).limit(10),
    q('interventions').order('created_at', { ascending: false }).limit(10),
    sb.from('leaves').select('start_date,return_date,type,status').eq('uid', u.id).order('start_date', { ascending: false }).limit(10),
  ]);
  const A = att.data || [], open = A.find((a) => !a.check_out);
  const toJustify = A.filter((a) => a.late && (!a.late_status || a.late_status === 'refusé'));

  app(`<div class=card><h2>${esc(u.prenom)} ${esc(u.nom)} <span class=m>${esc(u.matricule)}</span></h2>
  <p>${open ? 'Présent depuis ' + fd(open.check_in) : 'Vous n’êtes pas pointé'}</p>
  <video id=v playsinline hidden></video>
  <div class=row><button id=sc>Scanner le QR de la borne</button></div>
  <div class=row><input id=c placeholder="Code de la borne"><button id=pk>Pointer</button></div>
  <p id=res>${msg}</p></div>
  ${foreign ? `<div class=card><p class=ko>Ce téléphone n’est pas l’appareil enregistré pour ce compte.</p><button id=devAsk>Demander à utiliser ce téléphone</button><p id=devMsg></p></div>` : ''}
  ${S.role === 'manager' ? '<div class=row><button class=g id=bk>Espace manager</button></div>' : ''}
  ${toJustify.length ? `<div class=card><h3>Retards à justifier</h3>${toJustify.map((a) => `<p>${a.date}, arrivée à ${hm(a.check_in)}${a.late_status === 'refusé' ? ' <span class=ko>(justification refusée)</span>' : ''} <button class=g data-late="${a.id}">Justifier</button></p>`).join('')}</div>` : ''}

  <details class=card><summary><b>Déclarer une intervention</b> (chez un client, hors des locaux)</summary>
    <div class=row><input id=ivC placeholder="Client ou site"><input type=date id=ivD><label class=m><input type=checkbox id=ivA> journée(s) entière(s), jusqu’au</label><input type=date id=ivE></div>
    <div class=row><input type=time id=ivS><input type=time id=ivF><input id=ivM placeholder="Commentaire (facultatif)" style="flex:1"><button id=ivB>Envoyer</button></div><p id=ivR></p>
    ${list(itv.data || [], (i) => `<p class=m>${i.date_start}${i.date_end !== i.date_start ? ' → ' + i.date_end : ''} · ${esc(i.client)} : ${esc(i.status)}</p>`)}</details>

  <details class=card><summary><b>Déclarer un congé validé</b></summary>
    <p class=m>Déclarez ici un congé déjà validé dans le système de congés, avec la photo de cette validation. Les jours de congé vont de la date de départ jusqu’à la veille de la date de retour (jour de reprise).</p>
    <div class=row><select id=lvT>${opts(TYPES)}</select><label class=m>Départ <input type=date id=lvS></label><label class=m>Retour <input type=date id=lvR></label></div>
    <div class=row><input id=lvF placeholder="Référence de la validation (n° ou date)"><input id=lvC placeholder="Commentaire (facultatif)" style="flex:1"></div>
    <div class=row><label class=m>Photo de la validation <input type=file id=lvP accept="image/*"></label><button id=lvB>Déclarer</button></div><p id=lvM></p>
    ${list(lv.data || [], (l) => `<p class=m>${l.start_date} → retour le ${l.return_date} · ${esc(l.type)} : ${esc(l.status)}</p>`)}</details>

  <details class=card><summary><b>Demander une correction</b> (oubli de pointage, panne)</summary>
    <div class=row><input type=date id=cd><input type=time id=ci><input type=time id=co><input id=cm placeholder="Motif (oubli, panne…)"><button id=cb>Envoyer</button></div><p id=cr></p>
    ${list(cor.data || [], (c) => `<p class=m>${c.date} ${esc(c.in_time)}–${esc(c.out_time)} : ${esc(c.status)}</p>`)}</details>

  <div class="card w"><h3>Historique</h3><table><tr><th>Date<th>Arrivée<th>Départ<th>Statut<th>Anomalie</tr>
  ${A.map((a) => `<tr><td>${a.date}<td>${hm(a.check_in)}<td>${outLabel(a)}<td>${esc(statusOf(a))}<td>${esc((a.anomalies || []).join(', '))}`).join('')}</table></div>`);

  if ($('#devAsk')) $('#devAsk').onclick = async () => {
    $('#devAsk').disabled = true;
    try { await work('request-device', { deviceId }); $('#devMsg').innerHTML = '<span class=ok>Demande envoyée. Le manager ou l’admin doit l’accepter.</span>'; }
    catch (e) { $('#devMsg').innerHTML = `<span class=ko>${esc(e.message)}</span>`; $('#devAsk').disabled = false; }
  };
  $('#pk').onclick = () => go($('#c').value);
  $('#sc').onclick = scan;
  if ($('#bk')) $('#bk').onclick = () => nav('manager');
  document.querySelectorAll('[data-late]').forEach((b) => (b.onclick = () => lateForm(b.dataset.late)));

  const run = async (btn, res, fn, ok) => {
    btn.disabled = true;
    try { await fn(); employee(`<span class=ok>${ok}</span>`); }
    catch (e) { $(res).innerHTML = `<span class=ko>${esc(e.message)}</span>`; btn.disabled = false; }
  };
  $('#ivB').onclick = () => run($('#ivB'), '#ivR', () => work('declare-intervention', { client: $('#ivC').value, dateStart: $('#ivD').value, dateEnd: $('#ivE').value, fullDay: $('#ivA').checked, startTime: $('#ivS').value, endTime: $('#ivF').value, comment: $('#ivM').value }), 'Intervention déclarée, en attente de validation');
  $('#lvB').onclick = () => run($('#lvB'), '#lvM', async () => work('declare-leave', { type: $('#lvT').value, startDate: $('#lvS').value, returnDate: $('#lvR').value, reference: $('#lvF').value, comment: $('#lvC').value, proof: await readProof($('#lvP')) }), 'Congé déclaré');
  $('#cb').onclick = () => run($('#cb'), '#cr', () => api('request-correction', { date: $('#cd').value, in: $('#ci').value, out: $('#co').value, motif: $('#cm').value }), 'Demande envoyée');
}

// Étape 1 : aperçu et confirmation. Rien n'est enregistré avant « Confirmer ».
async function go(token) {
  if (!token) return;
  token = token.trim();
  try { confirmScreen(token, await api('punch', { token, deviceId })); }
  catch (e) { employee(`<span class=ko>${esc(e.message)}</span>`); }
}

function confirmScreen(token, r) {
  app(`<div class=card><h2>Confirmer votre ${r.type === 'Entrée' ? 'ARRIVÉE' : 'DÉPART'}</h2>
  <p>Heure : <b>${hm(r.at)}</b></p>
  ${r.late ? `<p class=ko>Il est ${esc(r.lateFrom)} ou plus : un retard sera enregistré et un motif vous sera demandé.</p>` : ''}
  ${r.warnings.map((w) => `<p class=m>⚠ ${esc(w)}</p>`).join('')}
  <div class=row><button id=ok>Confirmer</button><button class=g id=no>Annuler</button></div></div>`);
  $('#no').onclick = () => employee();
  $('#ok').onclick = async () => {
    $('#ok').disabled = true;
    const geo = await getGeo();
    const body = { token, deviceId, geo, confirm: true, exp: r.exp, tk: r.tk };
    try {
      const p = await api('punch', body);
      const done = `${p.type} enregistrée à ${hm(p.at)}`;
      if (p.late && !p.lateStatus) return lateForm(p.attendanceId, done);
      employee(`<span class=ok>${esc(done)}${p.anomalies.length ? ' — ' + esc(p.anomalies.join(', ')) : ''}</span>`);
    } catch (e) {
      if (e.offline) {
        localStorage.setItem(PENDING, JSON.stringify(body));
        return employee('<span class=m>Réseau coupé. Le pointage sera renvoyé automatiquement.</span>');
      }
      employee(`<span class=ko>${esc(e.message)}</span>`);
    }
  };
}

// Justification d'un retard : motif obligatoire, commentaire exigé pour « Autre ».
function lateForm(id, info = '') {
  app(`<div class=card><h2>Justifier votre retard</h2>${info ? `<p class=ok>${esc(info)}</p>` : ''}
  <div class=row><select id=lm>${opts(MOTIFS)}</select></div>
  <div class=row><input id=lc placeholder="Précision (obligatoire si « Autre »)" style="flex:1"></div>
  <div class=row><button id=ls>Envoyer</button><button class=g id=ll>Plus tard</button></div><p id=lr></p></div>`);
  $('#ll').onclick = () => employee();
  $('#ls').onclick = async () => {
    $('#ls').disabled = true;
    try { await work('late-reason', { id, motif: $('#lm').value, comment: $('#lc').value }); employee('<span class=ok>Justification envoyée, en attente de validation</span>'); }
    catch (e) { $('#lr').innerHTML = `<span class=ko>${esc(e.message)}</span>`; $('#ls').disabled = false; }
  };
}

async function scan() {
  const v = $('#v'), st = $('#res');
  st.textContent = 'Ouverture de la caméra…';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    st.innerHTML = `<span class=ko>Caméra inaccessible (${e.name}). Autorisez la caméra pour ce site dans les réglages du téléphone, puis réessayez.</span>`;
    return;
  }
  v.srcObject = stream; v.muted = true; v.hidden = false; await v.play();
  st.textContent = 'Cadrez le QR de la borne, à 20–30 cm, sans reflet…';
  const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
  let done = false;
  const stop = () => { done = true; stream.getTracks().forEach((t) => t.stop()); v.hidden = true; };
  const tick = async () => {
    if (done) return;
    try {
      let text = null;
      if (v.videoWidth) {
        if (detector) { const r = await detector.detect(v); if (r[0]) text = r[0].rawValue; }
        if (!text && typeof jsQR === 'function') {
          const k = Math.min(1, 800 / v.videoWidth);
          cv.width = v.videoWidth * k; cv.height = v.videoHeight * k;
          x.drawImage(v, 0, 0, cv.width, cv.height);
          const c = jsQR(x.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
          if (c) text = c.data;
        }
      }
      if (text) { stop(); return go(text); }
    } catch { /* image pas encore prête : on réessaie */ }
    setTimeout(tick, 150);
  };
  tick();
}
