# Passage à la voix dans le panneau, samedi 7 novembre au soir

Banc du Mac de Nathan : Nami (`main`) sur le port 3010, Chrome de l'agent sur le port 9333 en densité 1, pont `holo local browser` relancé en boucle. Aucune donnée du passeport dans ce fichier.

## Ce qui a marché (session `d30c187c`, 31 étapes, 0,09 $)

- Phrase comprise en 0,9 s ; passeport trouvé sur l'ordinateur, lu (5,4 s), confirmé à la voix ; photo d'identité cherchée ; agent lancé sans clic.
- L'agent remplit seul les 5 menus Select2 de l'e-VOA (vrais clics, densité 1), ouvre « Detail & Apply », clique « Apply », ferme la fenêtre d'information.
- Nami dépose le passeport sur le site (`upload_file`, champ `passport-attachment`), puis la photo (`picture`), sans clic humain.

## Ce qui a bloqué, et pourquoi

| Blocage | Cause | Suite |
|---|---|---|
| Le site refuse le passeport (« Unable to read several fields from your passport ») et bloque « Next » | Le site lit lui-même la MRZ de l'image (`mrzInvalidCount > 0`) ; notre fichier est une photo prise au téléphone | Scan à plat de la page photo (Notes de l'iPhone, « Scanner des documents ») ; décision de Nathan : la démo s'arrête à l'étape 1, avant tout envoi de données |
| L'aperçu de la photo ne s'affiche pas | La page passe la photo à une détection de visage (`faceapi`) puis remplit `path_photo`, resté vide | À vérifier : dépôt à la main du même fichier ; sinon portrait de face, fond clair |
| Pas de souris violette dans l'onglet | L'extension était chargée dans le Chrome personnel de Nathan, pas dans le Chrome de l'agent | Charger l'extension (« Load unpacked ») dans la fenêtre du Chrome de l'agent, ouvrir le panneau dans cette fenêtre |
| Compréhension de la phrase abandonnée après 20 s (2 fois) | Appel au modèle texte de H bloqué | PR #57 : essai de 8 s puis second essai de 10 s |
| Lecture du passeport refusée par Nami (nom composé, chiffre de contrôle, virgules) | Voir la PR #56 | 5 lectures sur 5 confirmées par la MRZ |
| Agent à 0 étape | Chrome de l'agent sans aucun onglet | PR #58 : onglet vide ouvert avant le lancement |

## Retours de Nathan à noter (21 h)

1. L'agent ne parle pas : Nami doit dire à voix haute ce que fait l'agent.
2. Interface et parcours pas beaux : messages qui s'empilent, il faut défiler ; viser des messages courts et clairs (après la démo fonctionnelle).
3. « Dans deux semaines » : Nami demande la date d'atterrissage au lieu de la proposer (« You fly on Saturday 21 November: do you land that day? »).
4. On s'arrête à l'étape 1 de l'e-VOA, avant tout envoi de données ; à l'oral : l'agent n'envoie pas les données au gouvernement.
5. Après le visa, un deuxième document rempli de la même façon par l'agent.
6. La souris visible qui se déplace et clique, comme dans Claude in Chrome (construite : PR #49 ; à charger dans le bon Chrome).
