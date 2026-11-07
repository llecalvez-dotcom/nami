# Ticket 01 : squelette de l'app

Lis d'abord en entier `docs/specs/2026-11-07-cadrage-devin.md` (la note de cadrage). Ce ticket n'en couvre qu'une partie : ne code rien d'autre que ce qui est listé ici.

Pars de la branche `docs/cadrage` si elle n'est pas encore fusionnée, sinon de `main`. Ouvre une PR vers cette même branche de base.

## À faire

1. Initialiser une app Next.js (App Router, TypeScript strict, Tailwind, ESLint) à la racine du dépôt, avec zod et vitest. Garder `.gitignore` existant (y ajouter seulement ce que Next.js génère en plus).
2. `.env.example` avec les noms de la section 4.1 de la note, sans valeurs.
3. `lib/official-sites.ts` (section 4.3, « Contrôle du domaine ») :
   - `isOfficialUrl(url: string): boolean`, comparaison sur les étiquettes de fin de `new URL(url).hostname`, liste de suffixes gouvernementaux plus liste blanche d'exceptions ;
   - la table des pays rodés : `MY` (URL MDAC de la note, domaine, `opensDaysBeforeArrival: 3`, condition d'arrêt de la section 4.6) ; `TH` laissé en commentaire « à remplir après le test F2 » ;
   - `isWithinOpeningWindow(countryIso2, arrivalDate, today): boolean` (fenêtre de 3 jours, jour de saisie compris).
4. `lib/persona.ts` : persona fictive de la section 4.7 (données inventées, adresse d'hébergement en Malaisie alphanumérique sans accents ; date de départ et mode de transport absents).
5. `lib/agent-task.ts` : fonction qui construit la consigne de la section 4.6 à partir du pays rodé, du profil et du voyage.
6. Page unique (section 4.2) avec des composants vides mais en place : conversation (bouton micro inactif, champ texte), liste des formalités, bouton de paiement inactif, panneau de statut de l'agent avec bouton « Arrêter l'agent ». Interface en français, propre et sobre, sans logique réseau.
7. Tests vitest de `lib/official-sites.ts` : URL gouvernementale acceptée ; `https://gov.example.com`, `https://example.com/gov`, `https://imigresen-online.imi.gov.my.evil.com` refusés ; fenêtre d'ouverture (J-4 refusé, J-3, J-1 et J acceptés).
8. README court : ce que fait l'app, commandes `npm run dev` et `npm test`.

## Critère de fin

`npm run build` et `npm test` passent ; aucune clé ni valeur de secret dans le dépôt ; la PR liste ce qui est fait et ce qui reste vide.

Ne rien coder pour Gladia, Linkup, Stripe ni H dans ce ticket : ce seront les tickets suivants.
