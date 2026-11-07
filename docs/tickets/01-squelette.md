# Ticket 01 : squelette, contrats et écrans sur données d'exemple

Lis d'abord en entier `docs/specs/2026-11-07-cadrage-devin.md` (note de cadrage, version 4.2). Ce ticket n'en couvre qu'une partie : ne code rien d'autre que ce qui est listé ici.

Pars de `main` (où la note est fusionnée). Travaille sur `feat/01-squelette` et ouvre une PR vers `main`.

## À faire

1. Initialiser une app Next.js (App Router, TypeScript strict, Tailwind, ESLint) à la racine du dépôt, avec shadcn/ui, zod et vitest. Garder le `.gitignore` existant (y ajouter seulement ce que Next.js génère en plus).
2. `.env.example` avec les noms de la section 4.1, sans valeurs.
3. `lib/contracts.ts` : schémas zod et types de la section 4.4 (`TripRequestDraft` aux champs nullables sauf `raw_text`, `TripRequest` stricte, `ModuleSuggestion`, `Formality`, `AgentRun`, et `PassportFields` de la route 12).
4. `lib/bali-papers.ts` : la table des 3 papiers de Bali relevée sur les sites officiels (section 5 de la note : nom, coût, domaine, fenêtre). `data/sample.ts` : une `TripRequest` Bali, des `ModuleSuggestion`, 3 `Formality` et un `AgentRun` d'exemple, **marqués visiblement « sample data »** à l'écran.
5. `lib/official-sites.ts` : `isOfficialUrl(url)` par comparaison des étiquettes de fin de `new URL(url).hostname`, liste de suffixes gouvernementaux et liste blanche ; domaines indonésiens de la section 4.3 (observés le 7 novembre).
6. `lib/persona.ts` : persona fictive de la section 4.7.
7. `lib/agent-task.ts` : fonctions qui construisent les deux consignes de la section 4.5 (papier pilote avec un emplacement pour la condition d'arrêt ; vols).
8. Écrans de la section 4.2 avec `data/sample.ts`, sans logique réseau : Accueil (« Where to next? », bouton micro inactif, champ texte, voyages enregistrés) et Trip (conversation à gauche avec cartes de proposition et de question et leurs boutons ; dossier du voyage à droite avec modules, cartes des papiers, Agent Activity et bouton « Stop agent »). Palette et typographie de la section 4.2. Les boutons changent l'état local (accepter, refuser, répondre) pour que le parcours soit cliquable de bout en bout.
9. Tests vitest : schémas (la `TripRequest` d'exemple est valide ; un brouillon sans `country_iso2` est accepté ; une `TripRequest` stricte sans `country_iso2` est refusée) ; `isOfficialUrl` (`https://allindonesia.imigrasi.go.id/x` accepté ; `https://gov.example.com`, `https://example.com/gov`, `https://allindonesia.imigrasi.go.id.evil.com` refusés).
10. Vérifier que `private/` est dans `.gitignore` (les vrais documents de la démo y vivent). README : compléter seulement la section « Lancer l'application » du README existant (commandes `npm install`, `npm run dev`, `npm test`), sans réécrire le reste.

## Critère de fin

`npm run build` et `npm test` passent ; aucune clé ni valeur de secret dans le dépôt ; le parcours d'exemple est cliquable de l'accueil jusqu'au papier « pré-rempli » ; la PR liste ce qui est fait et ce qui reste vide.

Ne rien coder pour Gladia, Linkup, H ni `lib/planner/` dans ce ticket : ce sont les tickets 02 à 05.
