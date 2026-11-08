# Passage complet visa, vol, hôtel : point de reprise (8 novembre, 12 h 19)

Parcours mené par Nathan dans le panneau, sur le Mac du banc. Il a marché de bout en bout. L'étiquette `demo-complete-2026-11-08` pointe sur ce code (`3986f19`, PR #114 fusionnée).

## Conditions de départ
- Nami lancée depuis un terminal de Nathan, jamais depuis une session Claude en arrière-plan (le passeport est dans `~/Documents`), sans `HAI_API_KEY` chargée dans ce terminal.
- Identifiant du pont propre au compte H : `NAMI_LOCAL_SESSION_ID=91620180-3289-4884-a89b-fa46300a35f9`. Une clé d'un autre compte demande un nouvel identifiant.
- Un seul onglet « Nouvel onglet » dans le Chrome de l'agent, ouvert au moins 30 s avant de lancer (voir PR #116 pour retirer cette contrainte).

## Ce qui a été observé
| Étape | Heure | Détail |
|---|---|---|
| Visa | 12:14:03 à 12:15:04 | 61 s d'agent, dans l'onglet de départ, arrêt avant l'envoi |
| Onglet du vol ouvert | 12:15:11 | Nouvel onglet, à côté du visa, avant le démarrage de l'agent |
| Vol, première action de l'agent | 12:15:44 | Après la pause de 35 s |
| Page de réservation du vol | 12:16:56 | Arrêt à 12:17:06, rien de réservé |
| Onglet de l'hôtel ouvert | 12:17:10 | Troisième onglet |
| Hôtel, première action de l'agent | 12:17:45 | Liste vers 12:18:05 |
| Page de l'hôtel | fin à 12:18:58 | Rien de réservé |

Avant cette réussite, sur la même demi-heure, deux lancements du visa ont échoué : un pont accroché à un onglet fermé (corrigé par la PR #116), une session figée côté H sur sa première étape.

## Défauts connus à cette heure
- Une session H peut se figer sur sa première étape (1 essai sur 6 au script). Le panneau relance une fois. Ces sessions occupent une place du quota de 3.
- Google Hotels peut afficher « No results » au premier chargement d'un nouvel onglet. L'agent recharge la page, environ 6 s.
- Environ 40 s d'attente entre la fin d'une session et la première action de la suivante, à cause de la pause de 35 s.
- La voix reste à régler, et le curseur violet bouge sans rapport avec les vrais clics de l'agent.
