# Refonte du panneau `/panel` : une étape à la fois, la vague, à la voix

Validée par Nathan le samedi 7 novembre vers 23 h 30 (« go », « oui pour Gambetta », « oui pour l'image »). Rien n'est codé à l'heure de cette fiche. Prime sur la section « écran épuré » du ticket 14 pour tout ce qu'elle reprend.

## Pourquoi

Retours de Nathan au passage à la voix du soir : « il y a toujours les questions par bloc, on est obligé de scroller, c'est pas du tout interactif, c'est pas du tout joli ». Il veut une interface pensée pour l'utilisateur, simple, belle, aux belles couleurs, et le moins de boutons possible : tout se fait à la voix.

## Méthode suivie (skill `taste`, vault de Nathan)

Lu en entier avant la direction : `vault/apprentissages/_business/gout-design-nathan.md`, `skills/_shared/BARRE.md`, `skills/_shared/execution-ui.md`, `skills/_shared/composition-moves.md` (anti-moves, A21), `vault/apprentissages/_business/pourquoi-un-site-est-beau.md`, `vault/apprentissages/_business/landing-page-anatomy.md`. Références regardées (images) : `mobile-tripstar-light`, `mobile-copilot-degrade-emoji`, `dash-whoop-donnee-sur-photo`, `mobile-gallery-dark-serif`, `mercury-hero-scene-verre`.

Mode de surface : **Operate** (outil qu'on utilise). La fiction ne prête que typo, palette, densité et UNE signature ; la mise en page suit les usages d'une vraie app.

## La fiction et la signature

« Nami » veut dire « vague » en japonais, et on part à Bali. Le panneau est un horizon : le ciel porte une seule phrase de Nami à la fois ; **la vague** (signature) est en bas, au-dessus des réponses, et dit qui a la parole : calme au repos, elle ondule quand Nami parle, s'anime quand elle écoute, roule vers la droite quand l'agent travaille. Le rivage garde ce qui est fait (passeport, photo, papiers).

| Référence | Ressort emporté | Signature écartée |
|---|---|---|
| TripStar | un objet central, une phrase, une action en bas | bouton bleu, carrousel |
| Copilot Money | message de l'assistant en carte flottante sur dégradé doux ; un objet par catégorie | anneaux, bleu, emojis |
| Whoop | la mesure posée sur son sujet (A21) | style des barres et anneaux |
| Gallery | mot pivot en italique serif (B9) | cartes inclinées en pile |
| Mercury | verre sur scène calme | bureau dans le paysage |

## Règles du vault appliquées

1. Usages d'une vraie app (verdict app NZT « ça fait pas application, tu codes au feeling ») : grand texte, action ancrée en bas, feuille qui monte.
2. La propreté est un plancher, la personnalité est notée (lot dashboards) : une couleur par papier (Ramp), dégradé doux de la marque en fond (Copilot, Attio), objet de contenu en couleur.
3. L'info utile saute au visage (BARRE 20) : la question en très grand, les réponses en gros boutons, pas d'air perdu.
4. Titre côté gain, dans les mots de l'utilisateur.
5. A21 : « ✓ 6 champs vérifiés » posé sur l'aperçu flouté du passeport.
6. Cohérence n°1 : une famille de polices, un accent, neutres teintés, jamais `#000` ni `#fff` purs, aucun gris neutre.
7. Motion de premier rang : la vague (signature justifiée) ; micro-interactions 200-300 ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, bouton `scale(0.97)` à l'appui ; jamais `transition-all`, aucun pulse sans état réel.
8. Peak-end et playbook hackathon (« construire la démo depuis le moment wow ») : « Ton visa est prêt » est un vrai moment.
9. Le titre se lit dès la première image : aucune animation d'apparition du texte principal.
10. Avant de montrer : juge aveugle (agent frais, deux temps), données du pire cas (« LE CALVEZ LEON PROSPER ERIC »), test en niveaux de gris, maquette dans le vrai panneau.

## Les 10 changements validés

1. **Un écran = une étape** : la phrase actuelle de Nami en grand (mot pivot en italique Gambetta : la destination), deux gros boutons « Oui » / « Non » ancrés en bas ; l'écran se remplace au lieu de s'empiler, rien à faire défiler.
2. **La vague** en bas : états repos, Nami parle (`speakLine`/file de lecture : `getQueue().speaking()`), écoute (`voice.status === "recording"`), agent au travail (`isAgentActive`).
3. **Une couleur par papier** : visa (teinte lagon), carte d'arrivée (teinte frangipanier/corail), reprise sur les étapes, les coches et le moment final ; fond en dégradé doux tiré du ciel de Bali, neutres teintés.
4. **Carte du passeport** : aperçu flouté (`/api/documents/preview?id=`), nom en grand, « ✓ 6 champs vérifiés » posé dessus (`mrz_verified.length`), un seul bouton « C'est bien moi ».
5. **Carte de l'agent** : étapes du formulaire en ligne (pays, motif, visa, passeport, photo) qui se cochent dans la couleur du papier (repérées dans `agent_steps` par mots-clés), phrase en cours en dessous, Stop.
6. **Moment final** : grande coche dans la couleur du papier, « Ton visa pour Bali est prêt. Vérifie-le et envoie-le. », puis la proposition suivante (carte d'arrivée, puis vol).
7. **Premier écran** : titre côté gain (« Dis-moi où tu pars, je m'occupe des papiers. »), micro en très grand, trois exemples en petit.
8. **Historique** replié sous « Ce qu'on s'est dit ».
9. **Micro-interactions** (point 7 des règles).
10. **Contrôle avant de montrer** (point 10 des règles).

## Mise en œuvre conseillée (code existant)

- Garder la logique de `components/panel/panel-screen.tsx` (parcours vocal du passeport, actions partagées `components/trip/use-trip-actions.ts`, traduction `lib/voice/translations.ts`, lecture des étapes de l'agent) ; remplacer seulement le rendu.
- Composant `FocusStage` dédié (plutôt que restyler `components/trip/conversation.tsx`) : il affiche l'élément en attente (`awaitsAnswer`) ou la dernière phrase de Nami, gère la réponse à la voix (`useVoiceInput`, `useListenAfterSpeech`, `shortAnswer`, `matchOption`) et remonte l'état « écoute » à la vague. La lecture à voix haute reste au niveau du panneau (`useConversationSpeech` sur toute la conversation traduite), une seule fois.
- Textes fixes (Oui, Non, Stop, « Ce qu'on s'est dit ») traduits comme le reste (`requestTranslations`).

## Police : Gambetta (Fontshare)

Licence FFL : usage commercial gratuit, **redistribution interdite** : ne jamais mettre les fichiers dans ce dépôt public. Charger la feuille Fontshare dans la page du panneau :

```html
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500,501&display=swap" />
```

Gambetta pour le mot pivot (italique) et éventuellement la grande phrase ; Helvetica reste la police du texte. Le manuscrit Snell Roundhand n'est plus utilisé dans le panneau (classé « faire-part de mariage » dans `skills/_shared/typo-naskell.md`).

## Image de fond (Nathan la génère, Gemini ou ChatGPT)

Règle appliquée (canonique des retours visuels, hackathon NZT) : un fond permanent se demande calme et doux dès le prompt. Format 9:16. Une fois l'image reçue : palette échantillonnée dedans, texte foncé sur la zone calme, aucun voile.

```
Vertical 9:16 painting of a calm dawn sky above the sea near Bali, seen from a quiet beach. The upper two thirds are open, calm sky: a very soft gradient from pale lagoon blue at the top to warm frangipani peach and a hint of coral near the horizon, with a few thin, high, wind-brushed clouds, extremely soft. The horizon sits low, at about 80% of the height: a thin band of calm sea in turquoise and silver light, and the faint outline of a distant volcano in haze on the right. Medium: a fine oil painting with gentle visible brushwork and a light grain, like a calm hand-painted travel poster, not a photograph. Very low contrast in the upper part so dark text stays readable on it. No people, no boats, no palm trees, no text, no sun disk, no lens flare. Avoid: saturated orange sunset, dramatic clouds, glossy CGI, HDR, vignette, frame, watermark.
```

## Critère de fin

Passage complet à la voix dans le panneau ouvert dans la fenêtre du Chrome de l'agent, sans défilement ; juge aveugle passé ; `npm test`, `npm run lint`, `npm run build` ; verdict de Nathan.
