# Yesmo Scan — pointage par PWA (Supabase + Vercel)

## Structure
```
vercel.json · package.json · .gitignore
supabase/schema.sql   tables, règles d'accès (RLS), pointage atomique en SQL
api/                  routes serveur Vercel : kiosk-token, punch, bind-device, create-user,
                      release-device, request-correction, decide-correction, keepalive (cron)
scripts/seed.js       crée l'admin (A001) et la borne (K000)
public/               PWA : index.html, manifest, sw.js, icônes, css/
public/js/            supabase.js (config + appel API), ui.js, app.js (routage par rôle)
public/js/views/      login, employee, manager, kiosk, admin, corrections
```

## Mise en route
**1. Supabase** (supabase.com, plan gratuit, sans carte)
- Créer un projet (région proche, ex. Europe) et noter le mot de passe de la base.
- **SQL Editor** : coller tout `supabase/schema.sql` puis **Run**.
- **Authentication > Sign In / Providers** : désactiver « Allow new users to sign up » (les comptes sont créés par l'admin uniquement). Pour Email, la confirmation d'e-mail peut rester désactivée.
- **Project Settings > API** : relever l'**URL du projet**, la clé **anon/publishable** (publique) et la clé **service_role/secret** (privée, ne jamais la mettre dans `public/`).

**2. Configuration du front**
- Dans `public/js/supabase.js`, remplacer l'URL du projet et la clé anon/publishable.

**3. Vercel** (compte avec plan Pro pour un usage commercial)
- `npm i -g vercel` puis `vercel login`, puis dans ce dossier `vercel` (lier ou créer le projet, accepter les réglages détectés).
- Ajouter les variables d'environnement (Production) :
  `vercel env add SUPABASE_URL` · `vercel env add SUPABASE_SERVICE_ROLE_KEY` · `vercel env add TOKEN_SECRET` · `vercel env add CRON_SECRET` (autre valeur aléatoire)
  (`TOKEN_SECRET` = longue valeur aléatoire : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `vercel --prod`

**4. Créer l'admin et la borne**
```
npm install
# PowerShell :
$env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="clé_service_role"
node scripts/seed.js MDP_ADMIN MDP_BORNE
```
**5.** Ouvrir l'URL Vercel : `K000` sur la tablette de l'entrée, `A001` pour créer managers et employés.

## Sécurité
- Le navigateur ne peut que **lire** (règles RLS) ; toute écriture passe par les routes `/api` avec la clé service, jamais exposée.
- Jeton QR signé (HMAC), valable 15 à 30 s, usage unique par personne ; pointage atomique en SQL, avec index unique « un seul pointage ouvert par personne ».
- Un compte = un appareil, libéré par l'admin ; géolocalisation en contrôle souple ; corrections tracées.
- Le cron quotidien `/api/keepalive` évite la mise en pause d'un projet Supabase gratuit.

## Reste à faire
Déverrouillage WebAuthn (une fois le domaine définitif connu), désactivation d'un compte depuis l'admin, durée de conservation des données.
