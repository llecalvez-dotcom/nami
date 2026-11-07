# 🧭 Cockpit de l'équipe Nami

À jour au samedi 7 novembre, midi. Document vivant : chacun met à jour la colonne Statut de sa ligne (PR ou commit direct sur `docs/equipe/cockpit.md`).

> Direction validée : **Nami**, l'agent qui prépare ton voyage. L'utilisateur décrit n'importe quel voyage à la voix, l'agent pose ses questions, puis propose les modules un par un : papiers, vol, hôtel. **V1 = module Papiers pour un Français qui part de France à Bali.** Brief produit d'origine de Léon : [`docs/brief/2026-11-07-brief-produit-leon.md`](../brief/2026-11-07-brief-produit-leon.md). Note de cadrage complète (v4.2) : [`docs/specs/2026-11-07-cadrage-devin.md`](../specs/2026-11-07-cadrage-devin.md).

## 🎯 Le produit en une minute

1. **La demande** : « Je pars à Bali lundi pour le mariage d'un ami, je reste dix jours. » Voix (Gladia) ou texte.
2. **L'intelligence** : l'agent comprend la demande, pose une question à la fois sur ce qui manque (passeport, heure d'atterrissage, motif) et ne propose que ce qui s'applique. Genève ou Barcelone : « rien à faire avec un passeport français ». Autre pays : « pas encore couvert, voici une liste non vérifiée ».
3. **Les documents** : « Envoie-moi une photo de ton passeport. » Les champs se remplissent tout seuls, l'utilisateur confirme d'un clic. En démo : les vrais documents d'un membre de l'équipe, avec son accord écrit, masqués à l'écran.
4. **Les papiers de Bali** : visa à l'arrivée (e-VOA, 500 000 IDR), carte d'arrivée « All Indonesia » (gratuite, 72 h avant l'arrivée), taxe touristique de Bali (150 000 IDR). Liens officiels, coûts officiels, sources non officielles signalées.
5. **L'action réelle** : « Create my visa ». L'agent H remplit le visa e-VOA sur le site officiel, sous nos yeux : il dépose le passeport et la photo, clique sur les étapes, utilise la date dite à l'oral, demande l'e-mail à voix haute, et s'arrête sur l'écran de paiement : « tout est prêt, tu vérifies, tu paies ». Personne ne clique sur payer.
6. **La suite** : « Tu veux que je cherche ton vol ? » (module Vol, P1).

Tagline : **Don't just plan my trip. Make it happen.**

## 👥 Répartition (proposée, à échanger librement)

| Qui | Rôle | Périmètre | Premier livrable | Statut |
|---|---|---|---|---|
| Clément | A, agent H | Sessions H, consignes, condition d'arrêt, navigateur local, puis module Vol | Parcours à la main du e-VOA jusqu'à l'écran de paiement (sans payer), puis carte d'arrivée et Love Bali | À faire |
| Ali | B, papiers et intelligence | Linkup, domaines officiels, logique des questions et des propositions, compréhension de la demande, lecture du passeport | Tests L1 (Linkup), F0 (compréhension), F7 (passeport) | À faire |
| Léon | C, front et conversation | Écrans, cartes de la conversation, dépôt de documents, dossier du voyage, statuts, direction visuelle | Parcours cliquable sur données d'exemple | À faire |
| Nathan | D, voix, démo, qualité, orchestration | Gladia, déroulé de démo, vidéo de secours, tests de bout en bout, Discord, pilotage de Devin et de Claude, bascule vers le module Vol | Test F5 (voix dans la salle), déroulé chronométré | À faire |
| Devin | Construction | Squelette, contrats, composants, tests unitaires | Ticket 01 | À lancer |
| Claude | Orchestration | Tickets Devin, relecture des PR, note à jour, cohérence des contrats | Note v4.2 | Fait |

**Règle d'or** : chacun code contre les contrats communs (`lib/contracts.ts`) avec des données d'exemple, sans attendre les autres.

## 🧪 Tests de faisabilité

| Test | Ce qu'on vérifie | Qui | Échéance | Statut |
|---|---|---|---|---|
| F1 manuel | e-VOA de bout en bout avec les vrais documents, jusqu'à l'écran de paiement : étapes, boutons, captcha, compte | Clément | 13 h 30 | À faire |
| F1 agent | L'agent H remplit le e-VOA jusqu'à l'écran de paiement 3 fois sur 3, avec un champ venu de la voix, un du passeport, une question à l'oral, aucun clic sur payer | Clément | 15 h 30 | À faire |
| F8 | L'agent H sait déposer un fichier dans le Chrome local (sinon l'humain choisit le fichier quand l'agent le demande) | Clément | 15 h 30 | À faire |
| F6 | Navigateur local d'H piloté par l'API, question de l'agent, deux sessions de suite, formulaire encore rempli 30 min après | Clément | 15 h 30 | À faire |
| L1 | Linkup sur 5 pays hors V1 : au moins 4 justes face à France Diplomatie | Ali | 13 h 30 | À faire |
| F0 | Le modèle d'H comprend 5 demandes variées | Ali | 13 h 30 | À faire |
| F7 | Lecture du vrai passeport en 3 photos : 7 champs justes sur au moins 2 | Ali | 13 h 30 | À faire |
| F5 | Gladia dans la salle : 4 demandes sur 5 justes | Nathan | 13 h 30 | À faire |
| G1 | (P1) L'agent H sur Google Flights, Kayak et le site d'une compagnie | Clément | après F1 | À faire |

Si à **15 h 30** aucun papier pilote ne passe, Nathan déclenche la bascule : le module Vol devient l'action H principale.

## ⏱️ Calendrier

- **13 h 30** : tests manuels et rapides (F1 manuel, L1, F0, F7, F5)
- **15 h 30** : agent H sur le papier pilote (F1 agent, F6), décision de bascule
- **22 h** : vidéo de secours enregistrée, quel que soit l'état
- **Dimanche 11 h** : gel du code, répétitions seulement
- **Dimanche 14 h** : rendu

## 🎬 Démo en 3 minutes

- **0:00** le problème : un voyage lointain, c'est surtout des papiers, et des sites copiés font payer des formulaires gratuits (DGCCRF, campagne de 2018 : environ 1 million de personnes piégées par an).
- **0:20** la demande à voix haute, la question de l'agent, sa proposition « je te prépare tes papiers ? »
- **0:50** le passeport déposé, les 3 papiers avec liens officiels ; contre-exemple « Genève : rien à faire ».
- **1:20** « Create my visa » : l'agent H remplit le e-VOA en direct (passeport déposé, étapes, question à l'oral) et s'arrête sur l'écran de paiement.
- **2:30** « Tu veux que je cherche ton vol ? » et la tagline.

## 🛡️ Règles non négociables

- Une vraie action démontrée vaut mieux que dix fonctionnalités simulées. Aucun résultat inventé.
- L'agent va jusqu'au dernier écran mais ne clique jamais sur l'envoi final ni sur le paiement. Captcha ou compte : l'humain s'en charge.
- Vrais documents d'un membre de l'équipe uniquement avec son accord écrit ; jamais dans Git (dossier `private/`), jamais lisibles sur scène, dans la vidéo ou dans les posts ; sessions H supprimées après la démo.
- Aucune clé API dans le code ni dans Git.

## 🔗 Liens

- Dépôt GitHub : https://github.com/llecalvez-dotcom/nami
- Note de cadrage v4.2 : [`docs/specs/2026-11-07-cadrage-devin.md`](../specs/2026-11-07-cadrage-devin.md) (relecture : https://github.com/llecalvez-dotcom/nami/pull/1)
- Discord H Company : https://discord.gg/y7bf5YRmST
- Événement : https://luma.com/hz9db5u9
- Doc H (agents) : https://hub.hcompany.ai/agents-api/introduction
- Exemples H : https://github.com/hcompai/agents-api-demos
- Doc Gladia : https://docs.gladia.io
- Doc Linkup : https://docs.linkup.so
- Doc Devin : https://docs.devin.ai
- Sites officiels : https://lovebali.baliprov.go.id · https://allindonesia.imigrasi.go.id · https://evisa.imigrasi.go.id
