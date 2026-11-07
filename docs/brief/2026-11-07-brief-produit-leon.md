# ✈️ Travel Concierge AI — Product & Hackathon Master Brief

> Brief produit d'origine écrit par Léon le 7 novembre 2026, conservé tel quel (seules les cases à cocher abîmées par le copier-coller ont été remises en liste). La direction retenue ensuite par l'équipe est dans [`docs/specs/2026-11-07-cadrage-devin.md`](../specs/2026-11-07-cadrage-devin.md) ; ce qui en est repris : l'angle « I have somewhere to be », les 4 statuts, la direction visuelle, les règles GitHub, le principe « une vraie action vaut dix fonctionnalités simulées ».

**Tagline:** *Don't just plan my trip. Make it happen.*

**Version:** 1.0 — 7 novembre 2026

**Événement:** H Company × 42AI — Computer Use Agents Hackathon

**Statut:** Vision validée en discussion · MVP à développer

**Deadline:** Dimanche 8 novembre 2026, 14 h (Paris)

**Objectif:** Livrer une démonstration fonctionnelle d'un agent de voyage capable d'effectuer des actions réelles.

---

# 01 — Executive Summary

## Notre concept

Nous construisons un **AI Travel Concierge**, un agent personnel qui organise les déplacements et voyages autour des besoins réels de l'utilisateur.

Qu'il s'agisse de vacances spontanées, d'un mariage à l'étranger, d'une conférence professionnelle ou d'un déplacement prévu depuis plusieurs mois, notre agent prend en charge une grande partie du travail de recherche, de coordination et de planification.

Contrairement à un générateur d'itinéraires classique, nous voulons développer un agent capable d'interagir avec des sites de voyage, de comparer les options, de préparer les réservations et d'adapter le programme lorsque les contraintes évoluent.

L'utilisateur conserve le contrôle des décisions importantes.

### Notre promesse

**From intention to execution.**

L'utilisateur exprime ce dont il a besoin. L'agent transforme cette intention en voyage organisé, avec des actions concrètes, des options vérifiables et un minimum de friction.

### Notre vision

Créer un assistant de voyage personnel qui connaît les déplacements à venir, détecte les éléments manquants et aide à les organiser avant que la charge mentale ne s'accumule.

### Notre mission pour le hackathon

Démontrer qu'un agent peut transformer une demande vocale concernant un événement déjà prévu en un programme de voyage structuré, puis rechercher des options réelles dans une interface externe grâce à H Company.

**Principe non négociable : une véritable action démontrée vaut davantage que dix fonctionnalités simulées.**

---

# 02 — Le problème : pourquoi ce produit ?

## Le parcours actuel est fragmenté

Pour organiser un voyage, l'utilisateur doit souvent naviguer entre plusieurs outils :

- Email ou calendrier pour retrouver l'événement.
- Google Flights ou d'autres sites pour les transports.
- Booking, Airbnb et autres plateformes pour les logements.
- Google Maps pour organiser les déplacements.
- Sites d'activités et de restaurants.
- Notes, messages et tableaux pour coordonner le programme.

Le problème ne se limite pas à chercher des informations.

Il faut **comparer, décider, vérifier la compatibilité des horaires et exécuter les actions**.

Une modification de date ou de budget peut obliger l'utilisateur à recommencer une partie de ses recherches.

## Design thinking — Notre hypothèse

Les utilisateurs ne veulent pas nécessairement « planifier un voyage ».

Ils veulent plutôt :

- Être certains d'arriver à l'heure à un événement important.
- Voyager dans leurs limites budgétaires.
- Passer moins de temps à coordonner les détails.
- Éviter d'oublier une réservation ou une étape.
- Conserver une vision claire de ce qui est organisé et de ce qui manque.

Ces besoins sont des hypothèses de conception à valider auprès de vrais voyageurs.

### How Might We

**Comment permettre à une personne de transformer une intention ou un engagement de voyage en programme réalisable et coordonné, avec un minimum d'effort, sans perdre le contrôle sur ses décisions et ses dépenses ?**

---

# 03 — Les utilisateurs et les cas d'usage

Notre plateforme repose sur deux intentions fondamentales.

## A. I want to go somewhere

L'utilisateur souhaite voyager, mais son projet n'est pas entièrement défini.

Exemples :

**Vacances**

« On aimerait partir une semaine au soleil en juillet, avec 900 € par personne. »

**City break**

« Organise-moi un week-end culturel dans une capitale européenne, sans trop dépenser. »

**Escapade spontanée**

« J'ai quatre jours de libres la semaine prochaine. Trouve-moi quelque chose d'intéressant. »

L'agent aide à choisir la destination, les dates, les transports, les hébergements et les expériences.

## B. I have somewhere to be

L'utilisateur a déjà un engagement et doit organiser son déplacement autour de celui-ci.

Exemples :

**Mariage**

« J'ai un mariage à Lisbonne le 12 juin. Organise mon déplacement depuis Paris, avec un retour dimanche soir. »

**Executive Travel**

« J'ai une conférence à Zurich mardi matin, puis deux rendez-vous clients. Organise le voyage. »

**Événement**

« J'ai déjà mes billets pour un concert à Londres. Prépare le reste du week-end. »

**Visite familiale**

« Je dois rendre visite à ma famille pendant les vacances scolaires. Trouve un itinéraire pratique. »

### Notre angle prioritaire

**Event-driven travel planning : organiser les déplacements autour d'événements et de contraintes déjà connus.**

C'est notre premier angle de différenciation.

À terme, avec les permissions nécessaires, le produit pourrait exploiter des invitations, calendriers et confirmations de réservation pour identifier les voyages à organiser.

---

# 04 — Le MVP du hackathon

## Scénario principal : Wedding in Lisbon

Nous choisissons un événement émotionnellement compréhensible, avec une date impérative et un budget limité.

### Demande de l'utilisateur

> « J'ai un mariage à Lisbonne le samedi 12 juin 2027 à 17 h. Je pars de Paris, j'ai un budget de 500 € et je dois être de retour dimanche soir. Organise-moi le voyage. »

### Contraintes à enregistrer

| Paramètre | Valeur |
| --- | --- |
| Origine | Paris |
| Destination | Lisbonne |
| Événement | Mariage |
| Date | Samedi 12 juin 2027 |
| Heure de cérémonie | 17 h, heure locale |
| Budget | 500 € |
| Participants | 1 pour le MVP |
| Retour | Dimanche soir |
| Priorité | Arriver avec une marge suffisante avant la cérémonie |

Les chiffres du scénario sont des données de démonstration, pas des offres de voyage vérifiées.

## Parcours utilisateur

### Étape 1 — L'utilisateur exprime son intention

Gladia transcrit la demande vocale.

Notre orchestrateur transforme la transcription en informations structurées :

- Origine et destination.
- Date et heure de l'événement.
- Budget.
- Contraintes impératives.
- Préférences personnelles.
- Informations éventuellement manquantes.

**Résultat attendu :** un voyage créé dans l'application avec ses contraintes enregistrées.

### Étape 2 — L'agent comprend la mission

Le moteur de voyage établit les conditions à respecter :

- Arrivée suffisamment tôt pour assister à la cérémonie.
- Retour compatible avec l'engagement du dimanche.
- Budget global respecté.
- Pas de chevauchement impossible entre activités et transports.
- Pas de réservation définitive sans validation.

### Étape 3 — H Company recherche des solutions

L'agent utilise le navigateur pour consulter au moins un véritable site de voyage.

Il recherche une option de transport ou d'hébergement, relève les informations accessibles et retourne leur source.

Le produit indique clairement ce qui a été trouvé et ce qui reste à vérifier.

### Étape 4 — L'itinéraire se construit

L'utilisateur découvre une interface visuelle comprenant :

- Une vue d'ensemble du voyage.
- Les options de transport.
- Les hébergements possibles.
- L'événement principal.
- Un programme par journée.
- Un budget consolidé.
- Les prochaines actions nécessaires.

### Étape 5 — L'utilisateur modifie une contrainte

> « Finalement, je veux arriver la veille du mariage pour avoir le temps de me reposer. »

L'application enregistre la nouvelle contrainte et recalcule les éléments affectés.

H Company peut relancer une recherche ciblée pour les options de transport.

Les éléments déjà validés et toujours compatibles sont conservés.

### Étape 6 — L'agent prépare l'action

L'utilisateur choisit une option.

L'agent peut ouvrir le parcours de réservation pertinent et le préparer dans les limites autorisées par la plateforme.

**La démo s'arrête avant tout paiement ou engagement non autorisé.**

## Le véritable WOW moment

L'utilisateur change une contrainte importante et voit son voyage se réorganiser, avec des données sourcées et une action réelle réalisée dans le navigateur.

Notre valeur n'est pas seulement « voici ton programme ».

C'est **« ton programme s'adapte, et l'agent s'occupe des démarches nécessaires ».**

---

# 05 — Fonctionnalités : MVP vs vision

| Fonctionnalité | Hackathon | Après hackathon |
| --- | --- | --- |
| Saisie de voyage par texte | P0 | Oui |
| Gladia : saisie vocale | P0 | Oui |
| Extraction des contraintes | P0 | Oui |
| Enregistrement d'un événement existant | P0 | Oui |
| Recherche web via H Company | P0 | Oui |
| Itinéraire visuel | P0 | Oui |
| Budget consolidé | P0 | Oui |
| Modification d'une contrainte | P0 | Oui |
| Préparation d'une action de réservation | P1 | Oui |
| Détection via Google Calendar | Non | Oui, avec autorisation |
| Lecture des confirmations d'email | Non | Oui, avec autorisation |
| Collaboration entre voyageurs | Non | Oui |
| Réservations multiples automatisées | Non | À étudier |
| Gestion des imprévus pendant le voyage | Non | Oui |
| Coordination multi-villes et multi-personnes | Non | Oui |
| Suivi des prix et disponibilités | Non | Oui |

P0 = indispensable. P1 = uniquement après réussite du parcours principal.

---

# 06 — Architecture technique

## Principe

Nous construisons une application web avec un orchestrateur central, un moteur de contraintes et un agent de navigation.

**Gladia comprend. Le Trip Brain structure. H Company exécute. L'utilisateur décide.**

### Architecture fonctionnelle

```
                USER
                  |
          Voice / Text / Event
                  |
          +----------------+
          | GLADIA         |
          | Speech to Text |
          +----------------+
                  |
          +----------------+
          | TRIP BRAIN     |
          | Intent parsing |
          | Trip context   |
          | Constraints    |
          +----------------+
                  |
        +---------+---------+
        |                   |
+---------------+   +----------------+
| H COMPANY     |   | TRIP ENGINE    |
| Agents API    |   | Dates          |
| Browser tasks |   | Budget         |
| Extraction    |   | Feasibility    |
+---------------+   +----------------+
        |                   |
        +---------+---------+
                  |
          +----------------+
          | VALIDATION     |
          | Human approval |
          +----------------+
                  |
          +----------------+
          | TRAVEL UI      |
          | Itinerary      |
          | Budget / Map   |
          | Action history |
          +----------------+
                  |
          +----------------+
          | DATA STORE     |
          | Trips / Events |
          | Options / Logs |
          +----------------+
```

## Technologies retenues

| Couche | Technologie | Responsabilité |
| --- | --- | --- |
| Application | Next.js + TypeScript | Front-end et routes serveur |
| Design | Tailwind + shadcn/ui | Interface et composants |
| Voix | Gladia | Transcription |
| Compréhension | Extraction structurée + validation Zod | Transformer le texte en contraintes |
| Navigation | H Company Agents API | Opérer les sites externes |
| Logique métier | Fonctions TypeScript | Contraintes, budget et cohérence |
| Données | Supabase ou base légère existante | Persistance des voyages |
| Développement | Devin | Coder, tester, déboguer |
| Collaboration | GitHub | Issues, branches et pull requests |
| Déploiement | Vercel | Application de démonstration |

### Rôle exact de chaque IA

**Gladia — Voice Intelligence**

Transforme la voix en texte. Une couche d'extraction distincte transforme ensuite le texte en objets métier validés.

**H Company — Computer Use Agent**

Effectue les tâches de navigation dans les interfaces de sites web externes.

Il ne doit pas être remplacé par de simples résultats inventés ou une simulation qui prétend naviguer sur un site réel.

**Devin — AI Software Engineer**

Contribue au code du prototype depuis le dépôt GitHub : composants UI, tests, logique métier, corrections.

Devin n'est pas nécessaire pour exécuter le voyage du client final.

**Trip Brain — Orchestrateur produit**

Conserve les préférences, contraintes, décisions et résultats de recherche. Il garantit que les différentes étapes restent cohérentes.

### Données minimales

- `trips` : origine, destination, budget, statut.
- `events` : type, lieu, date, heure et contraintes.
- `travellers` : participants et préférences.
- `travel_options` : transport, hébergement, prix, source, date de vérification.
- `itinerary_items` : activités, horaires et réservations.
- `agent_runs` : tâches exécutées, résultats et erreurs.
- `approvals` : décisions et autorisations explicites.

### Principales règles métier

- Un transport doit être compatible avec la date de l'événement.
- L'agent ne peut pas garantir une disponibilité non vérifiée.
- Les prix doivent porter une source et une date de consultation.
- Le budget doit distinguer le confirmé de l'estimé.
- Une modification de date relance uniquement les recherches affectées.
- Une action payante ou engageante exige une validation explicite.
- Une réservation est « confirmée » uniquement si une confirmation réelle a été obtenue.

### Sécurité

- Clés API uniquement côté serveur.
- Aucune donnée bancaire dans les traces de développement.
- Minimisation des données personnelles.
- Navigation limitée aux sites et actions prévus.
- Instructions de pages externes traitées comme du contenu non fiable.
- Historique des actions et gestion explicite des erreurs.

---

# 07 — Expérience utilisateur & psychologie humaine

## Notre direction artistique

**Premium Editorial Travel Concierge**

Inspirations :

- Airbnb : émotion, destination et découverte.
- Apple Wallet : simplicité des informations importantes.
- Linear : rapidité, organisation et cohérence.
- Applications de conciergerie haut de gamme : qualité perçue et discrétion.

Nous voulons créer un produit qui inspire **l'anticipation, la sérénité et la maîtrise**.

Pas un tableau de bord d'entreprise. Pas un chatbot générique.

## Principes psychologiques

### 1. Anticipation positive

Les utilisateurs doivent d'abord ressentir le plaisir du voyage.

Utiliser des images immersives, une typographie éditoriale et une présentation attractive des destinations.

### 2. Réduction de la charge cognitive

Ne pas exposer vingt choix simultanément.

Afficher les deux ou trois options les plus pertinentes et proposer les détails supplémentaires à la demande.

### 3. Progressive disclosure

Afficher d'abord :

- Ce qui est organisé.
- Ce qui manque.
- Ce qui nécessite une décision.

Les informations secondaires restent accessibles, sans surcharger l'écran.

### 4. Sentiment de contrôle

L'agent peut rechercher et préparer, mais il ne prend pas une décision financière importante sans accord.

### 5. Confiance calibrée

Distinguer quatre statuts :

- Suggested — proposé.
- Checked — vérifié à une date donnée.
- Pending approval — en attente d'autorisation.
- Confirmed — confirmé par une preuve réelle.

### 6. Continuité contextuelle

Lorsque l'utilisateur modifie une préférence, il ne doit pas recommencer depuis zéro.

Le produit conserve les décisions pertinentes et explique ce qu'il doit réviser.

## Palette visuelle proposée

| Rôle | Couleur |
| --- | --- |
| Canvas | `#F7F5F1` — warm ivory |
| Text | `#242A29` — deep charcoal |
| Primary action | `#214D45` — forest green |
| Secondary | `#D9C8B5` — warm sand |
| Attention | `#C38A4A` — muted amber |
| Surfaces | `#FFFFFF` |

Typographie : Geist ou Inter pour l'interface ; typographie éditoriale expressive pour les grands titres.

Animations : discrètes, rapides, uniquement pour rendre les transitions compréhensibles.

## Écrans du MVP

### Screen 1 — Home / Your journeys

Grand titre :

**Where to next?**

Deux entrées principales :

- I want to go somewhere.
- I have somewhere to be.

Sous les entrées : voyages en cours et événements nécessitant une organisation.

### Screen 2 — Journey Workspace

Trois zones visuelles :

1. **Journey Overview** — destination, dates, image, budget.
2. **Your Plan** — timeline du voyage, options et événements.
3. **Agent Activity** — recherches, progression et décisions.

### Screen 3 — Review & Confirm

Deux ou trois options présentées sous forme de cartes comparables :

- Prix.
- Horaires.
- Compatibilité avec les contraintes.
- Source.
- Disponibilité vérifiée ou non.
- Bouton d'approbation.

### Screen 4 — Trip Ready

Une synthèse lisible :

- Éléments confirmés.
- Éléments seulement suggérés.
- Réservations encore nécessaires.
- Prochaine action recommandée.

---

# 08 — Réutilisation d'outils et de repositories

## H Company — Priorité absolue

Repository officiel :

https://github.com/hcompai/agents-api-demos

Documentation :

https://hub.hcompany.ai/computer-use-agents/introduction

À examiner en premier :

- Exemple de navigation browser.
- Extraction d'informations structurées.
- Gestion des sessions et des résultats.
- Exemple de test QA d'une interface web.

## Gladia — Intégration vocale

Repository officiel :

https://github.com/gladiaio/gladia-samples

Réutiliser un exemple TypeScript de transcription préenregistrée.

Ne pas développer une infrastructure de streaming audio complexe si un enregistrement court suffit.

## Devin — Génération et tests

Documentation :

https://docs.devin.ai/

Exemples de missions :

- Créer les composants de la page Journey.
- Construire le modèle de données du Trip Brain.
- Écrire les tests de validation.
- Réaliser les tests end-to-end avec Playwright.
- Corriger les bugs identifiés avant soumission.

Chaque mission doit avoir un périmètre et des critères d'acceptation.

## UI

shadcn/ui :

https://github.com/shadcn-ui/ui

Documentation :

https://ui.shadcn.com/

Réutiliser les composants accessibles plutôt que recréer les dialogues, sélecteurs, cartes et formulaires.

## Inspiration et concurrence

- Mindtrip : https://mindtrip.ai/
- Wanderlog : https://wanderlog.com/
- TripIt : https://www.tripit.com/
- Veeza AI : https://www.veeza.ai/en

**Consigne : analyser leurs parcours et fonctionnalités, sans copier directement leur identité visuelle.**

---

# 09 — Organisation GitHub

## Structure proposée

```
travel-concierge/
├── app/
│   ├── page.tsx
│   ├── journeys/
│   └── api/
├── components/
│   ├── trip/
│   ├── itinerary/
│   ├── agent/
│   └── ui/
├── lib/
│   ├── gladia/
│   ├── h-company/
│   ├── trip-brain/
│   └── validation/
├── data/
│   └── demo-trip.ts
├── tests/
├── README.md
├── AGENTS.md
└── .env.example
```

## Règles de collaboration

- GitHub est la source de vérité technique.
- Une modification fonctionnelle par branche.
- Une PR par périmètre.
- Les tâches sont documentées dans GitHub Issues.
- Chaque PR doit expliquer les modifications et comment les tester.
- Les agents de développement ne fusionnent pas directement sur `main`.
- Les secrets ne sont jamais committés.
- Les décisions d'architecture sont ajoutées au README ou à `docs/`.

## Critères pour fusionner une PR

- Le code compile.
- Les tests concernés passent.
- Les modifications sont limitées au périmètre annoncé.
- Le comportement de démo reste fonctionnel.
- Un membre de l'équipe a relu la PR.

---

# 10 — Répartition du travail

*Proposition pour une équipe de trois personnes, à adapter selon les compétences.*

| Responsable | Périmètre | Livrable |
| --- | --- | --- |
| Personne A | H Company & navigation | Recherche réelle et extraction structurée |
| Personne B | Gladia & Trip Brain | Audio → contraintes → moteur de voyage |
| Personne C | Produit, UI & intégration | Interface premium et parcours complet |
| Devin | Support transversal | Composants isolés, tests, corrections |

## Travail en parallèle

Pendant que la personne A valide l'API H Company :

- B prépare le schéma métier et l'intégration Gladia.
- C crée les écrans à partir des données de démonstration.
- Devin développe les tests ou des composants indépendants.

Toutes les équipes doivent s'appuyer sur un contrat JSON commun pour éviter des intégrations incompatibles.

## Premier livrable commun

Un objet `Trip` qui contient :

```
{
  "origin": "Paris",
  "destination": "Lisbon",
  "purpose": "wedding",
  "event_date": "2027-06-12",
  "event_time": "17:00",
  "event_timezone": "Europe/Lisbon",
  "budget_eur": 500,
  "travellers": 1,
  "return_constraint": "Sunday evening",
  "status": "planning"
}
```

---

# 11 — Roadmap du hackathon

## Phase 1 — Prouver la faisabilité

**H0 à H3**

- [ ] Créer ou configurer le repository GitHub.
- [ ] Configurer les clés API.
- [ ] Vérifier l'accès à H Company.
- [ ] Réussir une recherche réelle avec l'agent.
- [ ] Obtenir un résultat structuré utilisable dans le produit.

**Gate 1 : l'agent doit réellement naviguer et récupérer une information vérifiable.**

## Phase 2 — Construire le moteur

**H3 à H8**

- [ ] Définir le schéma `Trip`.
- [ ] Créer le scénario Lisbonne.
- [ ] Intégrer Gladia.
- [ ] Définir les règles de dates, contraintes et budget.
- [ ] Relier les résultats H à la structure du voyage.

## Phase 3 — Développer l'expérience premium

**H8 à H15**

- [ ] Home avec les deux intentions.
- [ ] Journey Workspace.
- [ ] Timeline de voyage.
- [ ] Cartes d'options.
- [ ] États de progression de l'agent.
- [ ] UI de validation.

## Phase 4 — Intégrer le parcours

**H15 à H21**

- [ ] Relier les différentes couches.
- [ ] Tester une demande vocale complète.
- [ ] Tester une modification de contrainte.
- [ ] Vérifier les données sourcées.
- [ ] Préparer une action de réservation si possible.

## Phase 5 — Stabiliser et présenter

**H21 à H25 maximum, sous réserve de la deadline réelle**

- [ ] Corriger les bugs bloquants.
- [ ] Tester plusieurs parcours identiques.
- [ ] Capturer une vidéo de secours authentique.
- [ ] Finaliser le README.
- [ ] Préparer le pitch.
- [ ] Soumettre le projet avant 14 h dimanche.

**Règle : arrêter l'ajout de fonctionnalités dès que le temps de stabilisation commence.**

---

# 12 — Demo Script — 3 minutes

## 00:00–00:20 — The problem

« Planning a trip shouldn't feel like a second job. And sometimes, you don't even choose the destination — life gives you places to be. »

Montrer rapidement la fragmentation du processus traditionnel.

## 00:20–00:45 — The user intent

L'utilisateur enregistre :

« I have a wedding in Lisbon on June 12th. I'm travelling from Paris, my budget is €500, and I need to be back on Sunday evening. Make it happen. »

Gladia transcrit et le Trip Brain structure la demande.

## 00:45–01:30 — The agent works

H Company ouvre un site externe et recherche une option pertinente.

Montrer le navigateur en activité, puis le résultat avec sa source.

## 01:30–02:10 — The experience

Le Journey Workspace apparaît.

Le jury découvre :

- Un beau visuel de Lisbonne.
- L'événement du samedi.
- L'itinéraire.
- Les options de transport.
- Les contraintes et le budget.

## 02:10–02:45 — The WOW moment

L'utilisateur demande :

« Actually, I'd prefer to arrive on Friday so I can rest before the wedding. »

L'agent adapte les contraintes et déclenche une recherche ciblée.

L'interface conserve les informations déjà pertinentes.

## 02:45–03:00 — The outcome

Montrer les options réellement trouvées, ce qui a été préparé et ce qui nécessite encore une validation.

Terminer par :

**Don't just plan my trip. Make it happen.**
