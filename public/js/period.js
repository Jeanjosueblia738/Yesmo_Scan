// Période d'export et absences : lundi–vendredi, sans pointage, sans congé, sans intervention validée.
// Abidjan est à UTC+0, les dates ISO restent donc sur le jour civil.

const WEEK = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAY = 86400000;

export const dayNum = (s) => Date.parse(s + 'T00:00:00Z') / DAY;
export const weekdayName = (iso) => WEEK[new Date(iso + 'T00:00:00Z').getUTCDay()];
export const isWeekday = (iso) => {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d >= 1 && d <= 5;
};

// Sans dates saisies : le mois en cours, jusqu'à aujourd'hui. Une période inversée est refusée.
export function effectivePeriod(d1, d2, todayIso) {
  const end = d2 || todayIso;
  const start = d1 || end.slice(0, 8) + '01';
  if (start > end) return { a: start, b: end, invalid: true };
  return { a: start, b: end, invalid: false };
}

// Aujourd'hui ne compte qu'à partir de l'heure de retard. Un jour futur ne compte pas.
export function absenceEnd(todayIso, nowHm, lateFrom, requestedEnd) {
  let end = requestedEnd && requestedEnd < todayIso ? requestedEnd : todayIso;
  if (end === todayIso && nowHm < lateFrom) end = new Date(Date.parse(todayIso + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
  return end;
}

export function eachDay(a, b) {
  const out = [];
  if (!a || !b || a > b) return out;
  const end = Date.parse(b + 'T00:00:00Z');
  for (let t = Date.parse(a + 'T00:00:00Z'); t <= end; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const ouvrés = (days, since) => days.filter((d) => isWorkday(d) && d >= since).length;

// Jours fériés de Côte d'Ivoire : fêtes fixes et chrétiennes calculées, fêtes musulmanes
// de 2026 selon le calendrier annoncé (le croissant peut décaler d'un jour).
const ANNOUNCED = [
  ['2026-03-16', 'Lendemain de la Nuit du Destin', false],
  ['2026-03-20', 'Aïd el-Fitr', true],
  ['2026-05-27', 'Tabaski', true],
  ['2026-08-25', 'Lendemain du Maouloud', false],
];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const isSunday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay() === 0;

export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoOf(year, month, day);
}

const yearCache = new Map();
function holidaysOf(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  const y = String(year), map = {};
  const put = (iso, name) => { if (iso) map[iso] = name; };
  put(`${y}-01-01`, 'Jour de l’an');
  put(`${y}-05-01`, 'Fête du Travail');
  put(`${y}-08-07`, 'Fête nationale');
  put(`${y}-08-15`, 'Assomption');
  put(`${y}-11-01`, 'Toussaint');
  put(`${y}-11-15`, 'Journée de la Paix');
  put(`${y}-12-25`, 'Noël');
  const easter = easterSunday(year);
  put(addDays(easter, 1), 'Lundi de Pâques');
  put(addDays(easter, 39), 'Ascension');
  put(addDays(easter, 50), 'Lundi de Pentecôte');
  for (const iso of [`${y}-05-01`, `${y}-08-07`, `${y}-12-25`]) if (isSunday(iso)) put(addDays(iso, 1), 'Lendemain de fête');
  for (const [iso, name, sundayNext] of ANNOUNCED) {
    if (!iso.startsWith(y)) continue;
    put(iso, name);
    if (sundayNext && isSunday(iso)) put(addDays(iso, 1), 'Lendemain de ' + name);
  }
  yearCache.set(year, map);
  return map;
}

export const holidayName = (iso) => holidaysOf(+String(iso).slice(0, 4))[iso] || '';
export const isHoliday = (iso) => !!holidayName(iso);
export const isWorkday = (iso) => isWeekday(iso) && !isHoliday(iso);

export function minutesBetween(start, end) {
  const [sh, sm] = String(start || '').split(':').map(Number);
  const [eh, em] = String(end || '').split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return (eh * 60 + em) - (sh * 60 + sm);
}

// Heures d'une intervention validée, sans journée entière et sans scan le même jour.
export function extraInterventionHours(interventions, attendance) {
  const present = new Set((attendance || []).map((a) => a.matricule + '|' + a.date));
  const out = {};
  for (const i of interventions || []) {
    if (i.full_day || !i.start_time || !i.end_time) continue;
    const mins = minutesBetween(i.start_time, i.end_time);
    if (!(mins > 0) || present.has(i.matricule + '|' + i.date_start)) continue;
    out[i.matricule] = (out[i.matricule] || 0) + mins / 60;
  }
  return out;
}

const leaveCovers = (l, day) => l.status !== 'contesté' && day >= l.start_date && day < l.return_date;
const interventionCovers = (i, day) => i.status === 'validée' && day >= i.date_start && day <= i.date_end;

// people : comptes actifs. attendance / leaves / interventions : lignes déjà filtrées sur la personne si besoin.
export function absences(people, days, attendance, leaves, interventions) {
  const present = new Set((attendance || []).map((a) => a.matricule + '|' + a.date));
  const out = [];
  for (const p of people) {
    const since = (p.created_at || '1970-01-01').slice(0, 10);
    for (const day of days) {
      if (!isWorkday(day) || day < since) continue;
      if (present.has(p.matricule + '|' + day)) continue;
      if ((leaves || []).some((l) => l.matricule === p.matricule && leaveCovers(l, day))) continue;
      if ((interventions || []).some((i) => i.matricule === p.matricule && interventionCovers(i, day))) continue;
      out.push({ matricule: p.matricule, nom: p.nom, prenom: p.prenom, date: day, jour: weekdayName(day) });
    }
  }
  return out;
}
