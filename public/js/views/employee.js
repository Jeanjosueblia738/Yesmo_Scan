import { sb, api } from '../supabase.js';
import { app, $, fd, hm, deviceId, getGeo, S, nav } from '../ui.js';

export async function employee(msg = '') {
  const u = S.me;
  api('bind-device', { deviceId }).catch(() => {});
  const { data: att } = await sb.from('attendance').select('*').eq('uid', u.id).order('check_in', { ascending: false }).limit(30);
  const { data: cor } = await sb.from('corrections').select('*').eq('uid', u.id).order('created_at', { ascending: false }).limit(10);
  const open = (att || []).find((a) => !a.check_out);

  app(`<div class=card><h2>${u.prenom} ${u.nom} <span class=m>${u.matricule}</span></h2>
  <p>${open ? 'Présent depuis ' + fd(open.check_in) : 'Vous n’êtes pas pointé'}</p>
  <video id=v playsinline hidden></video>
  <div class=row><button id=sc>Scanner le QR de la borne</button></div>
  <div class=row><input id=c placeholder="Code de la borne"><button id=pk>Pointer</button></div>
  <p id=res>${msg}</p></div>
  ${S.role === 'manager' ? '<div class=row><button class=g id=bk>Espace manager</button></div>' : ''}
  <div class=card><h3>Demander une correction</h3><div class=row><input type=date id=cd><input type=time id=ci><input type=time id=co><input id=cm placeholder="Motif (oubli, panne…)"><button id=cb>Envoyer</button></div><p id=cr></p>
  ${(cor || []).map((c) => `<p class=m>${c.date} ${c.in_time}–${c.out_time} : ${c.status}</p>`).join('')}</div>
  <div class="card w"><h3>Historique</h3><table><tr><th>Date<th>Arrivée<th>Départ<th>Anomalie</tr>
  ${(att || []).map((a) => `<tr><td>${a.date}<td>${hm(a.check_in)}<td>${hm(a.check_out)}<td>${a.anomalies.join(', ')}`).join('')}</table></div>`);

  $('#pk').onclick = () => go($('#c').value);
  $('#sc').onclick = scan;
  if ($('#bk')) $('#bk').onclick = () => nav('manager');
  $('#cb').onclick = async () => {
    try {
      await api('request-correction', { date: $('#cd').value, in: $('#ci').value, out: $('#co').value, motif: $('#cm').value });
      employee('<span class=ok>Demande envoyée</span>');
    } catch (e) { $('#cr').innerHTML = `<span class=ko>${e.message}</span>`; }
  };
}

async function go(token) {
  if (!token) return;
  try {
    const r = await api('punch', { token: token.trim(), deviceId, geo: await getGeo() });
    employee(`<span class=ok>${r.type} enregistrée à ${hm(r.at)}${r.anomalies.length ? ' — anomalie : ' + r.anomalies.join(', ') : ''}</span>`);
  } catch (e) {
    employee(`<span class=ko>${e.message}</span>`);
  }
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
