# Ticket 01 : squelette de l'app et contrat `Trip`

Lis d'abord en entier `docs/specs/2026-11-07-cadrage-devin.md` (la note de cadrage, version 3). Ce ticket n'en couvre qu'une partie : ne code rien d'autre que ce qui est listé ici.

Pars de la branche `docs/cadrage` si elle n'est pas encore fusionnée, sinon de `main`. Travaille sur une branche `feat/01-squelette` et ouvre une PR vers cette branche de base.

## À faire

1. Initialiser une app Next.js (App Router, TypeScript strict, Tailwind, ESLint) à la racine du dépôt, avec shadcn/ui, zod et vitest. Garder le `.gitignore` existant (y ajouter seulement ce que Next.js génère en plus).
2. `.env.example` avec les noms de la section 4.1 de la note, sans valeurs.
3. `lib/trip-brain/schema.ts` : schémas zod du `Trip` (section 4.4), d'une option de vol (section 4.3, route 4), d'un papier (route 5) et du statut commun (`suggested`, `checked`, `pending_approval`, `confirmed`, avec `checked_at` et `source_url`).
4. `data/demo-trip.ts` : le `Trip` du scénario Bali (section 4.4).
5. `lib/official-sites.ts` (section 4.3, route 5, « Contrôle de domaine ») : `isOfficialUrl(url)` par comparaison des étiquettes de fin de `new URL(url).hostname`, liste de suffixes gouvernementaux et liste blanche. Les domaines indonésiens restent en constante marquée « à confirmer par le test L1 ».
6. `lib/persona.ts` : persona fictive de la section 4.7.
7. `lib/agent-task.ts` : fonctions qui construisent les deux consignes de la section 4.5 (vols ; carte d'arrivée avec un emplacement pour la condition d'arrêt).
8. Écrans de la section 4.2 avec les données de `data/demo-trip.ts` et des options et papiers d'exemple **marqués visiblement « sample data »** : Accueil (« Where to next? », les deux entrées) et Journey Workspace (Overview, Your Plan avec frise et cartes, Agent Activity avec bouton « Stop agent »). Palette et typographie de la section 4.2. Aucune logique réseau.
9. Tests vitest : schémas (le `Trip` de démo est valide, un `Trip` sans `event_date` est refusé) ; `isOfficialUrl` (`https://allindonesia.imigrasi.go.id/x` accepté ; `https://gov.example.com`, `https://example.com/gov`, `https://allindonesia.imigrasi.go.id.evil.com` refusés).
10. README court : ce que fait l'app, commandes `npm run dev` et `npm test`.

## Critère de fin

`npm run build` et `npm test` passent ; aucune clé ni valeur de secret dans le dépôt ; la PR liste ce qui est fait et ce qui reste vide.

Ne rien coder pour Gladia, Linkup, H ni le moteur de contraintes dans ce ticket : ce sont les tickets 02 à 05.
