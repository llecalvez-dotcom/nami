# Recadrage : le computer use au centre de Nami

Samedi 7 novembre, 15 h 40. Décision de l'équipe (Nathan, « go pour la séquence »). Complète la note de cadrage `docs/specs/2026-11-07-cadrage-devin.md`, qui reste valable pour tout ce qui n'est pas repris ici.

## 1. Pourquoi

L'équipe trouve le projet « pas assez computer use ». Le constat :

- **Le computer use existe déjà** : dans la PR #14, l'agent H pilote un Chrome du portable, clique et remplit le vrai e-VOA. Mais personne ne l'a encore vu marcher, et l'écran met en avant le globe, les cartes et le dossier, pas l'agent qui agit.
- **H a déjà une extension Chrome qui clique toute seule : HoloTab** (gratuite, Chrome Web Store). Holo4 regarde l'onglet actif, clique et tape, montre chaque étape dans un panneau latéral, demande avant d'envoyer en mode supervisé. C'est un produit grand public **sans API** : Nami ne peut ni la lancer, ni lui passer un passeport, ni lui imposer des règles d'arrêt. Le jury de H connaît donc « l'extension qui clique » : notre valeur est ailleurs.

Conséquence : on ne construit pas notre propre agent dans une extension (ce serait refaire HoloTab en 20 heures). L'agent existe, on le met au centre de l'écran et de la démo.

## 2. Le produit recadré

Tu dis à Nami où tu pars. Nami sait quels papiers il te faut (sources officielles), retrouve tes documents, puis **prend la main sur ton ordinateur** : il ouvre le site officiel et remplit le formulaire sous tes yeux, page par page, en te demandant ton accord à chaque étape, et s'arrête devant le paiement.

Ce que HoloTab ne fait pas et que Nami fait :
1. savoir quels papiers il faut pour ce voyage, avec la source officielle ;
2. n'aller que sur le domaine officiel (la session s'arrête si l'agent en sort) ;
3. retrouver tes documents (dépôt ou recherche avec ton accord) ;
4. s'arrêter avant le paiement, par construction ;
5. tout faire à la voix.

## 3. Le moment de la démo (on construit à l'envers depuis lui)

1. « Je pars à Bali lundi pour le mariage d'un ami. » Nami répond à voix haute et pose deux questions ; on répond à la voix.
2. « Il te faut 3 papiers. Je m'occupe de ton visa ? » « Oui. »
3. « Je n'ai pas ton passeport. Je le cherche dans tes documents ? » « Oui. » L'agent le trouve et montre l'aperçu : « C'est bien celui-ci ? » « Oui. »
4. Le site officiel s'ouvre, l'agent remplit sous nos yeux. À la fin de chaque page : « Page 1 remplie : nom, numéro de passeport, dates. Je continue ? » « Oui. »
5. Il dépose le passeport, pose sa question à voix haute (l'e-mail), s'arrête devant le paiement : « Tout est prêt. Tu vérifies, tu paies. » Personne ne paie.

## 4. Architecture

| Rôle | Qui | Où |
|---|---|---|
| Cerveau (conversation, papiers, documents, règles) | Nami, l'app Next.js, **lancée en local sur le portable de démo** | `npm run dev` sur le portable de Clément |
| Mains (clics, saisie, dépôt de fichier) | L'agent H | Navigateur : Chrome dédié piloté par CDP (`holo local browser`, PR #14). Ordinateur entier : `holo local desktop` (option C, selon le test T9) |
| Visage (ce que l'utilisateur voit) | Nami dans le panneau latéral de Chrome (petite extension), l'agent dans l'onglet | Le Chrome dédié |

Dialogue avec l'agent H, par ses outils personnalisés :
- `ask_user { question, field }` (existe, PR #14) : question lue à voix haute, réponse à la voix ou au clavier.
- `confirm_page { page, filled_fields[] }` (nouveau, ticket 06) : à la fin de chaque page, avant « Suivant », l'agent attend un « oui ». Un « non » renvoie la correction à l'agent.
- `report_ready { summary, filled_fields[] }` (existe) : arrêt devant le paiement.

Garde-fous inchangés : boutons interdits, arrêt de la session hors du domaine officiel, « Stop agent » qui arrête vraiment la session H, aucun clic sur l'envoi final ni le paiement, données du passeport jamais dans les journaux.

## 5. Deux options pour « prendre la main », tranchées par un test

| | A. Navigateur piloté | C. Ordinateur entier pour les documents + navigateur pour le formulaire |
|---|---|---|
| Recherche du passeport | Nami cherche dans un dossier choisi à l'avance et montre ce qu'il trouve (ticket 09) | L'agent ouvre le Finder sous nos yeux et le trouve (ticket 10) |
| Dépôt du fichier sur le site | Par l'agent du navigateur si T5 passe, sinon l'humain choisit le fichier quand l'agent le demande | Par l'agent de l'ordinateur, qui voit la fenêtre de sélection de fichiers |
| Risques | Dépôt de fichier pas garanti | Plus lent (une capture par geste) ; voit tout l'écran ; autorisations macOS ; jamais testé par notre serveur |

**Règle de décision** : si le test T9 (`docs/tests/t9-bureau.md`) réussit ses deux étapes, on fait C ; sinon A. Dans les deux cas, la PR #14 telle quelle reste la démo de secours.

## 6. Faits vérifiés dans la doc de H (lue le 7 novembre, 15 h 30)

| Fait | Source |
|---|---|
| HoloTab : extension Chrome gratuite, Holo4 agit dans l'onglet actif, étapes visibles dans un panneau latéral, modes supervisé et autonome ; aucune API documentée ; dépôt de fichier non mentionné | https://hub.hcompany.ai/holotab/introduction.md |
| Ordinateur entier : `pip install "hai-agents[cli,desktop]"`, `holo -a h/holo-desktop "tâche"` ou `holo local desktop` puis `session_id` ; macOS, Windows, Linux ; souris, clavier, capture après chaque geste ; autorisations demandées à la première session ; arrêt par deux fois Échap ou `holo local stop` ; « Prefer a dedicated machine over your primary one » | https://hub.hcompany.ai/agents-api/your-desktop.md |
| Environnement `desktop` : champs `id`, `kind: "desktop"`, `shell` (accès aux fichiers par commandes, en préversion, sinon 403), `session_id`, `lazy`, `screenshot_max_width` | idem |
| Navigateur local : CDP sur le port 9222, profil à part ; une nouvelle session annule la précédente ; dépôt de fichier, onglets multiples et panneau latéral non documentés | https://hub.hcompany.ai/agents-api/your-browser.md |
| `write_file` (fichier mis à disposition de l'agent) : navigateur cloud seulement, `~/Downloads`, 8 Mio au plus | https://hub.hcompany.ai/agents-api/sessions/write-file.md |
| Suivi en direct : Agent View sur la plateforme H (connexion requise), ou nos propres appels `changes` et `events` ; pas de vue intégrable documentée | https://hub.hcompany.ai/agents-api/observe-and-steer.md |

À tester (non documenté) : l'environnement `desktop` créé par notre serveur (REST) avec le `session_id` de `holo local desktop` ; l'agent du navigateur qui dépose un fichier (T5) ; l'agent du navigateur qui ignore le panneau latéral de l'extension.

## 7. Séquence et responsables

| Ordre | Quoi | Qui | Fichier |
|---|---|---|---|
| 1, maintenant | Test réel de la PR #14 (T4, T5, T6) : premier vrai essai du pilotage local | Clément | `docs/tests/f1-evoa.md` |
| 1, en parallèle | Test T9 : l'agent H pilote l'ordinateur entier (30 min) | Ali | `docs/tests/t9-bureau.md` |
| 2, en parallèle sur Devin | Ticket 06 : validation page par page (`confirm_page`) et conversation à la voix | Nathan (Devin) | `docs/tickets/06-validation-et-voix.md` |
| 2, en parallèle sur Devin | Ticket 08 : extension, Nami dans le panneau latéral | Léon (Devin) | `docs/tickets/08-extension-panneau.md` |
| 2, en parallèle sur Devin | Ticket 09 : recherche du passeport dans un dossier local | Ali (Devin) | `docs/tickets/09-recherche-documents.md` |
| 3, si T9 réussit | Ticket 10 : l'agent de l'ordinateur cherche et dépose le passeport | Clément ou Ali | `docs/tickets/10-bureau.md` |
| 4 | Mode démo préparé (ticket à écrire après le verdict de T9) puis vidéo de secours | Nathan, Claude | à venir |

Échéances inchangées : vidéo de secours samedi 22 h, gel du code dimanche 11 h, rendu dimanche 14 h. Le ticket 06 et le ticket 08 partent de `main` après la fusion de la PR #14.

## 8. Ce qu'on ne fait pas

- Notre propre agent dans une extension (refaire HoloTab).
- Utiliser HoloTab elle-même : sans API, Nami ne peut pas la piloter.
- L'environnement `desktop` avec `shell: true` (préversion, lecture et écriture de fichiers par commandes).
- La recherche de documents en ligne : elle ne marche qu'en local, sur un dossier choisi.

## 9. Risques et replis

| Risque | Repli |
|---|---|
| Le pilotage local de H ne marche pas par notre serveur (T4 échoue) | Navigateur cloud de H, arrêt sur le formulaire pré-rempli montré au jury (cadrage 4.6) |
| L'agent ne sait pas déposer le fichier (T5 échoue) | Il demande à l'humain de choisir le fichier (`ask_user`) |
| T9 échoue | Option A |
| Le micro ne marche pas dans le panneau latéral | Nami ouvert dans une fenêtre à côté du Chrome piloté |
| L'agent de l'ordinateur voit Nami à l'écran et s'y perd | Nami sur un second écran ou réduit pendant l'action ; consigne « n'utilise que la fenêtre Chrome du site officiel » |
| Données à l'écran envoyées en capture chez H | Session macOS dédiée, rien d'autre d'ouvert, accord écrit du titulaire (obtenu) |

## 10. Pitch

« HoloTab clique pour toi. Nami sait **sur quoi** cliquer : le bon papier, le site officiel et pas le faux, tes documents, et il s'arrête avant de payer. » Chiffre d'appui inchangé : DGCCRF 2018, environ 1 million de personnes par an piégées par les faux sites administratifs (à dater à l'oral).
