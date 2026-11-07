# Nami

**Don't just plan my trip. Make it happen.**

Nami est un agent de voyage. Tu lui décris ton voyage à la voix (« Je pars à Bali lundi pour le mariage d'un ami »), il pose les questions qui manquent, puis propose ce qu'il peut faire pour toi : préparer tes papiers d'entrée, chercher ton vol, ton hôtel. Il agit sur les vrais sites officiels et s'arrête toujours avant l'envoi final ou le paiement : tu vérifies, tu valides.

Projet du hackathon H Company × 42AI (Computer Use Agents), Paris, 7 et 8 novembre 2026.
V1 : un Français qui part de France à Bali, module Papiers (visa e-VOA, carte d'arrivée, taxe de Bali).

## Par où commencer

| Document | Contenu |
|---|---|
| [`docs/equipe/checklist.md`](docs/equipe/checklist.md) | **La checklist globale** : chaque fonctionnalité front et back, son état, son responsable |
| [`docs/equipe/cockpit.md`](docs/equipe/cockpit.md) | **Le tableau de bord de l'équipe** : répartition, tests de faisabilité, calendrier, démo, règles, liens |
| [`docs/specs/2026-11-07-cadrage-devin.md`](docs/specs/2026-11-07-cadrage-devin.md) | La note de cadrage complète (v4.2) : architecture, routes, contrats, tests, registre des faits |
| [`docs/tickets/`](docs/tickets/) | Les tickets pour Devin, un par périmètre |
| [`docs/brief/2026-11-07-brief-produit-leon.md`](docs/brief/2026-11-07-brief-produit-leon.md) | Le brief produit d'origine de Léon (vision, design, psychologie utilisateur) |

## Équipe

Léon (front et conversation), Clément (agent H), Ali (papiers et intelligence), Nathan (voix, démo, qualité, orchestration), avec Devin (construction) et Claude (cadrage, tickets, relecture).

## Partenaires utilisés

- **H Company** : l'agent qui remplit le visa sur le site officiel ; le modèle de vision qui lit le passeport.
- **Gladia** : la transcription de la demande vocale.
- **Linkup** : la vérification que les règles d'entrée n'ont pas changé, et les formalités des pays hors V1.
- **Devin** : la construction de l'application.

## Règles

- Une vraie action démontrée vaut mieux que dix fonctionnalités simulées. Aucun résultat inventé.
- L'agent ne clique jamais sur l'envoi final ni sur le paiement d'un site officiel.
- Les vrais documents de la démo vivent dans `private/`, ignoré par Git. Aucune clé API dans le dépôt (`.env.local`, ignoré).
- Routes de l'agent H (`/api/papers/start`, `/api/agent/…`) sans contrôle du propriétaire de la session (seulement le code d'accès de `proxy.ts`) : démo en local sur le portable uniquement, ne pas déployer en public.
- Une branche et une PR par périmètre ; jamais de fusion directe sur `main` par un agent ; une relecture humaine avant fusion.

## Lancer l'application

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés (jamais commitées)
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires (vitest)
npm run build && npm start   # version de démo, sur le portable
```

### Démo avec l'agent H (portable de démo)

```bash
npm run demo                 # ou scripts/lancer-demo.sh --port 9333
```

Le script lance, dans l'ordre :
1. le Chrome dédié de l'agent (profil `~/chrome-for-agents`, port 9333 par défaut), réglé pour ne jamais se mettre en veille quand sa fenêtre est cachée, sans la bulle de traduction. Si un autre navigateur (par exemple ton Chrome perso) occupe déjà le port, le script s'arrête au lieu de le confier à l'agent ;
2. `holo local browser` sur ce port, avec un identifiant de session fixe (gardé dans `~/.config/nami/local-browser-session-id`), relancé s'il s'arrête. S'il échoue 3 fois de suite, le script arrête tout ;
3. Nami (`npm run dev`), sauf s'il tourne déjà. Si une autre app occupe le port 3000, le script s'arrête.

Il affiche l'identifiant à coller dans « Local browser session » (`http://localhost:3000/?demo=1`) et n'affiche jamais la clé H (prise dans `HAI_API_KEY` ou `.env.local`). Prérequis : `pip install "hai-agents[cli,browser]"`. Ctrl+C arrête le pont et Nami ; le Chrome de l'agent reste ouvert.

L'état des voyages vit dans le `localStorage` du navigateur. Le voyage « Bali » de l'accueil est une donnée d'exemple (marquée « Sample data ») ; le bouton « Reset » le remet à zéro.
