import test from 'node:test';
import assert from 'node:assert/strict';
import { eachDay, absenceEnd, absences, effectivePeriod, ouvrés, isWeekday, isHoliday, holidayName, easterSunday, extraInterventionHours } from '../public/js/period.js';

const person = (over = {}) => ({ matricule: 'E001', nom: 'KOUASSI', prenom: 'Aya', created_at: '2026-01-01T00:00:00Z', active: true, ...over });

test('chaque jour de 2026 est visité une fois, sans trou', () => {
  const days = eachDay('2026-01-01', '2026-12-31');
  assert.equal(days.length, 365);
  assert.equal(days[0], '2026-01-01');
  assert.equal(days.at(-1), '2026-12-31');
  assert.equal(new Set(days).size, 365);
});

test('le 12 octobre 2026 est un lundi, le week-end ne compte pas', () => {
  assert.equal(isWeekday('2026-10-12'), true);
  assert.equal(isWeekday('2026-10-10'), false);
  assert.equal(isWeekday('2026-10-11'), false);
  assert.equal(ouvrés(eachDay('2026-10-05', '2026-10-11'), '2026-01-01'), 5);
});

test('avant 10h00, aujourd’hui n’est pas encore une absence', () => {
  assert.equal(absenceEnd('2026-10-12', '09:59', '10:00', '2026-10-12'), '2026-10-11');
  assert.equal(absenceEnd('2026-10-12', '10:00', '10:00', '2026-10-12'), '2026-10-12');
  assert.equal(absenceEnd('2026-10-12', '18:00', '10:00', '2026-10-09'), '2026-10-09');
  assert.equal(absenceEnd('2026-10-12', '18:00', '10:00', '2026-12-01'), '2026-10-12');
});

test('sans dates, la période est le mois en cours', () => {
  assert.deepEqual(effectivePeriod('', '', '2026-10-12'), { a: '2026-10-01', b: '2026-10-12', invalid: false });
  assert.equal(effectivePeriod('2026-10-20', '2026-10-01', '2026-10-12').invalid, true);
});

test('une absence est un jour ouvré sans pointage, congé ni intervention validée', () => {
  const days = eachDay('2026-10-05', '2026-10-09');
  const p = [person()];
  const list = absences(p, days, [{ matricule: 'E001', date: '2026-10-05' }], [], []);
  assert.deepEqual(list.map((x) => x.date), ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
});

test('le congé couvre du départ inclus à la veille du retour, sauf s’il est contesté', () => {
  const days = eachDay('2026-10-05', '2026-10-09');
  const p = [person()];
  const leave = { matricule: 'E001', status: 'déclaré', start_date: '2026-10-06', return_date: '2026-10-08' };
  assert.deepEqual(absences(p, days, [], [leave], []).map((x) => x.date), ['2026-10-05', '2026-10-08', '2026-10-09']);
  assert.deepEqual(absences(p, days, [], [{ ...leave, status: 'contesté' }], []).map((x) => x.date), days);
});

test('les jours fériés ivoiriens ne sont pas des absences', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(holidayName('2026-04-06'), 'Lundi de Pâques');
  assert.equal(holidayName('2026-05-14'), 'Ascension');
  assert.equal(holidayName('2026-05-25'), 'Lundi de Pentecôte');
  assert.equal(isHoliday('2026-08-07'), true);
  assert.equal(isHoliday('2026-08-25'), true);
  assert.equal(isHoliday('2026-03-20'), true);
  assert.equal(isHoliday('2026-10-12'), false);
  assert.equal(isHoliday('2022-05-02'), true);
  const list = absences([person()], eachDay('2026-08-06', '2026-08-07'), [], [], []);
  assert.deepEqual(list.map((x) => x.date), ['2026-08-06']);
});

test('une intervention de quelques heures compte sans scan, pas en plus d’un scan', () => {
  const it = [{ matricule: 'E001', full_day: false, start_time: '08:00', end_time: '12:30', date_start: '2026-10-06' }];
  assert.equal(extraInterventionHours(it, [])['E001'], 4.5);
  assert.equal(extraInterventionHours(it, [{ matricule: 'E001', date: '2026-10-06' }])['E001'], undefined);
  assert.equal(extraInterventionHours([{ ...it[0], full_day: true }], [])['E001'], undefined);
});

test('seule une intervention validée retire l’absence, et le compte créé en cours de période ne remonte pas avant', () => {
  const days = eachDay('2026-10-05', '2026-10-09');
  const pending = { matricule: 'E001', status: 'en attente', date_start: '2026-10-07', date_end: '2026-10-07' };
  const validated = { ...pending, status: 'validée' };
  assert.equal(absences([person()], days, [], [], [pending]).some((x) => x.date === '2026-10-07'), true);
  assert.equal(absences([person()], days, [], [], [validated]).some((x) => x.date === '2026-10-07'), false);
  const late = absences([person({ created_at: '2026-10-08T08:00:00Z' })], days, [], [], []);
  assert.deepEqual(late.map((x) => x.date), ['2026-10-08', '2026-10-09']);
});
