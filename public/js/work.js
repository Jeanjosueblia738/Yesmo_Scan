import { api } from './supabase.js';
// Appel d'une action de la route /api/work (retards, interventions, congés, saisie manuelle).
export const work = (action, body = {}) => api('work', { action, ...body });
