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

export const ouvrés = (days, since) => days.filter((d) => isWeekday(d) && d >= since).length;

const leaveCovers = (l, day) => l.status !== 'contesté' && day >= l.start_date && day < l.return_date;
const interventionCovers = (i, day) => i.status === 'validée' && day >= i.date_start && day <= i.date_end;

// people : comptes actifs. attendance / leaves / interventions : lignes déjà filtrées sur la personne si besoin.
export function absences(people, days, attendance, leaves, interventions) {
  const present = new Set((attendance || []).map((a) => a.matricule + '|' + a.date));
  const out = [];
  for (const p of people) {
    const since = (p.created_at || '1970-01-01').slice(0, 10);
    for (const day of days) {
      if (!isWeekday(day) || day < since) continue;
      if (present.has(p.matricule + '|' + day)) continue;
      if ((leaves || []).some((l) => l.matricule === p.matricule && leaveCovers(l, day))) continue;
      if ((interventions || []).some((i) => i.matricule === p.matricule && interventionCovers(i, day))) continue;
      out.push({ matricule: p.matricule, nom: p.nom, prenom: p.prenom, date: day, jour: weekdayName(day) });
    }
  }
  return out;
}
