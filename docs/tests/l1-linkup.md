# Test L1 : Linkup en direct face à France Diplomatie

- **Date** : 7 nov. 2026, vers 13 h (Paris). Lancé par Devin pour Ali (ticket 03), avec la vraie clé `LINKUP_API_KEY`.
- **Code testé** : `findFormalities()` de `lib/formalities.ts` (même code que `POST /api/formalities`), branche `feat/03-papiers-documents`.
- **Requête** : passeport français, départ de France, court séjour touristique. `includeDomains` = `diplomatie.gouv.fr` + domaines gouvernementaux du pays (`go.xx`, `gov.xx`, `gouv.xx`, `gob.xx`, `govt.xx`, plus les hôtes connus pour l'Indonésie). Sortie structurée, `depth: "standard"`.
- **Référence** : page « Entrée / Séjour » de France Diplomatie de chaque pays (`https://www.diplomatie.gouv.fr/fr/information-par-pays/<pays>/conseils-aux-voyageurs-entree-sejour`), lue le même jour.
- **Deux passages** : passage 1 avec le premier jet du code, passage 2 après correction (réponse en anglais, « optional / exempted / recommended » lus comme non obligatoires, coût inconnu jamais deviné).
- **Critère du cockpit** : au moins 4 pays justes sur 5.

## Résultat : réussi, 5 pays justes sur 5 pour le papier principal (4 sur 5 complets au passage 2)

| Pays | France Diplomatie dit | Linkup (passage 2) | Verdict |
|---|---|---|---|
| Tanzanie | Visa obligatoire, en ligne sur le site du gouvernement ou à l'arrivée, 50 € ou 50 USD. Assurance locale obligatoire 44 USD : NIC sur le continent, ZIC si arrivée à Zanzibar. | Visa touristique, 50 USD, `visa.immigration.go.tz`, obligatoire. Assurance NIC 44 USD pour 92 jours, obligatoire ; son site `nicinsurance.co.tz` n'est pas un domaine gouvernemental : affiché « not official », non cliquable. En plus : carte d'arrivée (`immigration.go.tz`). | **Juste**. Manque le cas ZIC (arrivée à Zanzibar). |
| Chine | Exemption de visa jusqu'au 31 déc. 2026, séjour de 30 jours au plus (tourisme, affaires, famille, transit). Visa au-delà ou pour un autre motif. | Exemption de visa, gratuite, **non obligatoire**, 30 jours, `nia.gov.cn`. En plus : carte d'arrivée en ligne (`s.nia.gov.cn`), absente de la page Diplomatie. | **Juste**. Au passage 1, l'exemption était marquée « required » : corrigé. |
| Japon | Pas de visa pour un court séjour de 90 jours au plus. « Visit Japan Web » recommandé avant l'arrivée. | Visa non requis jusqu'à 90 jours (non obligatoire). Visit Japan Web, recommandé, non obligatoire, `vjw.digital.go.jp`. | **Juste**. Au passage 1, les deux étaient marqués « required » : corrigé. |
| Inde | Visa obligatoire (visa ou e-visa), refoulement sinon. « e-Arrival Card » obligatoire depuis le 1er oct. 2025, à remplir à partir de 72 h avant le vol (`indianvisaonline.gov.in/earrival`). | e-Tourist Visa obligatoire, `indianvisaonline.gov.in`, 48 USD selon le consulat de l'Inde à La Réunion, au moins 4 jours avant. Le second papier renvoyé est l'ETA du même e-visa (doublon). | **Juste pour le visa, incomplet** : l'e-Arrival Card manque au passage 2. Elle était trouvée au passage 1 (72 h avant, gratuite). |
| Kenya | Autorisation électronique de voyage (eTA) obligatoire, sur `etakenya.go.ke`, à présenter avant l'embarquement. | eTA obligatoire, `etakenya.go.ke`, approuvée avant le départ, valable 90 jours. Coût : « Not stated on the source » (Diplomatie ne le donne pas non plus ; le passage 1 disait 30 USD). | **Juste**. |

## Bali (corrigé : la table vérifiée à la main)

| Papier | Table (7 nov. 2026) | Linkup passage 1 | Linkup passage 2 |
|---|---|---|---|
| e-VOA | IDR 500,000, `evisa.imigrasi.go.id` | IDR 500,000, même domaine | IDR 500,000, même domaine |
| Carte d'arrivée | Gratuite, `allindonesia.imigrasi.go.id`, 72 h avant | « Free », même domaine, 72 h | Coût non donné (affiché maintenant « Free (not stated live; our last check) »), même domaine, 72 h |
| Taxe de Bali | IDR 150,000, `lovebali.baliprov.go.id` | IDR 150,000, même domaine | IDR 150,000, même domaine |

Les trois papiers sont trouvés aux deux passages, avec les bons domaines et les bons coûts : aucune différence réelle avec la table.

## Mesures

- **Durée** d'une recherche (Linkup + requêtes HEAD) : de 4,0 à 9,6 s, sous la limite de 15 s, au-delà de laquelle l'app passe sur la table.
- **Sources** : toutes sur `diplomatie.gouv.fr` ou un domaine gouvernemental (le filtre `includeDomains` tient). Le seul lien non officiel (assurance NIC) est bien affiché comme tel, sans lien cliquable.
- **Requêtes HEAD** : `www.mofa.go.jp` répond 403 aux robots et `visa.immigration.go.tz` ne répond pas depuis la machine de test ; dans ce cas l'app renvoie à la page d'accueil du domaine, comme prévu.

## Ce qu'on en retient

- Le papier principal (visa, exemption ou eTA) est juste pour les 5 pays. Les papiers secondaires varient d'un passage à l'autre (carte d'arrivée de l'Inde, cas ZIC de la Tanzanie) : d'où l'affichage « not verified by hand » et la mention « Automatic filling is validated country by country; Bali is the first » hors Bali.
- Linkup ne donne pas toujours le coût : l'app écrit alors « Not stated on the source » plutôt que d'inventer.
- Linkup peut ajouter des formalités hors page Diplomatie (cartes d'arrivée de Chine et de Tanzanie) : elles viennent de sites gouvernementaux, avec leur source affichée.
