# Passage du 7 novembre, minuit : le visa marche de bout en bout depuis le panneau, à la voix

Point de reprise si quelque chose casse : le code exact de ce passage est la branche `etat/visa-ok-2026-11-07` (commit `bfe54e5`, `main` du 7/11 vers 23 h 30 avec les PR #69, #71, #73, #74 et #77). Repartir de là : `git checkout etat/visa-ok-2026-11-07`, puis redémarrer `next dev` (un `next dev` déjà lancé garde d'anciens modules après un changement de branche, cf. `docs/tests/f1-evoa.md`).

## Ce qui a marché (session `5b7f9eb3`)

Piloté par Nathan dans le panneau Nami ouvert dans la fenêtre du Chrome de l'agent, tout à la voix, aucune aide humaine pendant le travail de l'agent :

1. « Je pars à Bali lundi pour le mariage d'un ami » : compris (Gladia puis Models API de H, 2 à 4 s).
2. Date proposée, visa proposé, oui à la voix.
3. Passeport trouvé sur le Mac, lu (3,9 s), confirmé à la voix ; photo d'identité trouvée (aperçu affiché, HEIC converti), acceptée ; pas de billet retour.
4. Agent H : 4 menus du visa (FRANCE, General, Tourism, B1) choisis de façon visible (souris violette, liste ouverte, pays tapé, environ 2,6 s par menu), Detail & Apply, Apply, OK des messages importants.
5. Étape 1 : **passeport déposé par Nami et lu par le site** (fenêtre de lecture confirmée par Ok après un Page Down), **photo déposée**.
6. Arrêt à l'étape 1 comme prévu (PR #59) : aucun Next, rien envoyé au gouvernement. Panneau : « Your visa is ready ».

Métriques H : 19 étapes, 0,05 $.

## Conditions de départ (à refaire avant chaque démo)

- Chrome de l'agent (port 9333, densité 1, extension Nami chargée et rechargée après chaque mise à jour) avec **un seul onglet, ouvert après le rechargement de l'extension**, sur `https://evisa.imigrasi.go.id/web/visa-selection`.
- Pont `holo local browser --debug-port 9333 --session-id <id>` relancé en boucle (il se termine avec chaque session H).
- Panneau Nami ouvert **dans la fenêtre du Chrome de l'agent** (pas dans un autre Chrome), souris sur le panneau pendant que l'agent travaille ; micro autorisé par les options de l'extension (« Allow the microphone »).
- Micro du Mac en entrée (pas l'iPhone en Continuité : Gladia devine alors une autre langue).
- Passeport : **scan à plat** de la page photo (une photo prise au téléphone est refusée par le lecteur du site). Photo d'identité : JPEG (un HEIC est converti par Nami depuis la PR #71).
- Aucune autre page de Nami ouverte ailleurs (elle parlerait aussi par les haut-parleurs).

## Ce qui ne marche pas encore

- **Carte d'arrivée (All Indonesia)** : jamais ouverte en réel. Juste après le visa, le pont holo redémarrait ; la session a démarré pendant ce temps et H a répondu « Connection refused on the WebDriver port ». Parade : attendre quelques secondes entre les deux documents ; la PR #79 fait proposer « Try again » après un échec.
- Écran un peu flou sur le Retina : conséquence voulue de la densité 1 (sans elle, les clics de H tombent au double des coordonnées).

## PR de la soirée liées à ce passage

#64 (voix ElevenLabs), #67 et #68 (refonte du panneau), #69 (souris violette), #71 (garde-fou, onglet unique, HEIC), #72 (relevés et consignes de Clément), #73 (langue), #74 (voix au rechargement), #77 (menus visibles, voix courte). En attente : #78 (Nouveau voyage repart de zéro), #79 (réessayer un papier).
