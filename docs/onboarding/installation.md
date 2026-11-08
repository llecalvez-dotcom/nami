# Installer et faire tourner Nami, de zéro, pas à pas

Rédigé le 8 novembre 2026 à partir du banc réel (MacBook Air de Clément, macOS 26, Node 25.2.1, npm 11, Python 3.13, `hai-agents` 1.4.3, Google Chrome 156). Tout ce qui suit a été exécuté et vérifié sur ce banc ; quand une valeur dépend de la machine, c'est dit.

Si tu es un agent IA (Devin, Claude Code, Cursor...) : lis d'abord la section 14 (règles), puis suis les sections 1 à 9 dans l'ordre sans en sauter. Chaque section se termine par une vérification : ne passe pas à la suivante tant qu'elle n'est pas verte.

## 0. Ce qu'est Nami, en deux minutes

Nami est un agent de voyage à la voix, dans le panneau latéral de Chrome. L'utilisateur dit « Je pars à Bali lundi pour le mariage d'un ami » ; Nami comprend (Gladia pour la transcription, un modèle H pour le sens), pose les questions qui manquent, retrouve le passeport et la photo d'identité sur l'ordinateur, les lit, puis **un agent H (computer use) pilote un Chrome visible** pour :

1. remplir le visa e-VOA sur `evisa.imigrasi.go.id` jusqu'à l'étape 1 incluse (passeport et photo déposés), **sans jamais cliquer sur Submit ni payer** ;
2. remplir la carte d'arrivée All Indonesia sur `allindonesia.imigrasi.go.id`, **sans l'envoyer** ;
3. chercher un vol dans Google Flights (ville de départ, dates, critère : le moins cher, le plus rapide, sans escale, le meilleur compromis), proposer 2 ou 3 vols réellement lus dans la page, ouvrir celui choisi et **s'arrêter sur la page des options de réservation de Google, sans réserver**.

L'utilisateur garde le dernier mot pour tout envoi officiel ou paiement. C'est une règle du projet, pas une limite technique.

Trois machines à connaître :

- **Nami** : application Next.js 16 (`app/`, `components/`, `lib/`), lancée en local sur `http://localhost:3000`. Elle expose les routes API et la page `/panel`.
- **Le Chrome de l'agent** : un Google Chrome à part (profil `~/chrome-for-agents`, port de debug 9333, densité de pixels 1) que l'agent H pilote. L'extension Nami y est chargée et affiche `/panel` dans le panneau latéral.
- **Le pont** : `holo local browser` (paquet Python `hai-agents`), qui relie l'API H Agents à ce Chrome par le port 9333. Il se termine à la fin de chaque session H et est relancé en boucle par `scripts/lancer-demo.sh`.

## 1. Prérequis système

| Outil | Version vérifiée | Pourquoi | Installation macOS |
|---|---|---|---|
| macOS | 26.3.1 | Banc de démo. Linux marche pour les tests unitaires et le build ; la voix (`say`, `play`) et le script de démo sont faits pour macOS (Linux : Chrome trouvé par `google-chrome`, pas de voix). | |
| Google Chrome | 156 | Le Chrome de l'agent (profil dédié) et l'extension | https://www.google.com/chrome/ |
| Node.js | 25.2.1 (minimum **22** : le dépôt de fichiers par CDP utilise le `WebSocket` natif de Node 22+) | Nami, scripts de test | `brew install nvm` puis `nvm install 22` ou plus récent ; sur la VM Devin : `source ~/.nvm/nvm.sh` avant toute commande npm |
| npm | 11 | Dépendances | avec Node |
| Python | 3.13 (3.10 minimum) | Le pont `holo` | `brew install python` ou Anaconda (le banc utilise `/opt/anaconda3/bin/python3`) |
| `hai-agents[cli,browser]` | 1.4.3 | La commande `holo` (pont `holo local browser`) | `pip install "hai-agents[cli,browser]"` ; vérifier avec `which holo` |
| `sox` | 14.4 | Voix en flux par `play` (optionnel : sans `sox`, Nami parle avec `say` de macOS) | `brew install sox` |
| `lsof`, `curl`, `uuidgen` | fournis par macOS | Utilisés par `scripts/lancer-demo.sh` | |
| `git` | | | |

Vérification :

```bash
node -v        # v22 ou plus
npm -v
python3 --version
which holo && holo --help | head -3
which sox play  # optionnel
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version
```

## 2. Récupérer le code

```bash
git clone https://github.com/llecalvez-dotcom/nami.git ~/nami
cd ~/nami
npm install
```

Le banc de Clément est dans `~/nami`. Le chemin n'a pas d'importance, mais tous les exemples ci-dessous supposent `~/nami`.

Si `npm install` échoue ou si des tests échouent avec « Cannot find package » (par exemple `i18n-iso-countries`, `d3-geo`), c'est que `node_modules` est en retard sur `package.json` : relancer `npm install` (ou `npm ci`).

Vérification :

```bash
npm test          # vitest : tous les fichiers verts (1018 tests le 8 novembre, 1 fichier volontairement ignoré)
npm run lint
npm run build     # génère aussi .next/types, nécessaire à tsc
npx tsc --noEmit  # rien à afficher
```

`npx tsc --noEmit` lancé **avant** le premier `npm run build` échoue sur `app/trip/[id]/page.tsx` (types `PageProps` absents) : ce n'est pas une erreur du code, lancer `npm run build` (ou `npx next typegen`) d'abord.

## 3. Les clés et les comptes

Aucune clé n'est dans le dépôt. Elles vont dans `.env.local` (ignoré par Git) ou dans les secrets de l'organisation Devin pour le cloud. **Ne jamais commiter `.env.local`, ne jamais coller une clé dans une PR, un message ou un journal.**

| Variable | Fournisseur | Obligatoire | Sert à |
|---|---|---|---|
| `HAI_API_KEY` | H Company (https://hcompany.ai, console de l'API) | **oui** | Agent (H Agents API `https://agp.eu.hcompany.ai/api/v2`), compréhension des phrases (H Models API), lecture du passeport (vision), pont `holo` (il lit la même variable, ou `~/.config/hai/.env` écrit par `holo login --key`) |
| `GLADIA_API_KEY` | Gladia (https://app.gladia.io) | **oui** pour la voix | `/api/voice/transcribe` |
| `LINKUP_API_KEY` | Linkup (https://app.linkup.so) | oui pour `/api/formalities` | Vérification en direct des papiers d'entrée et formalités des pays hors Bali |
| `ANTHROPIC_API_KEY` | Anthropic | non | Repli de compréhension (`LLM_PROVIDER=anthropic`) ou lecture du passeport (`PASSPORT_READER=anthropic`) |
| `ELEVENLABS_API_KEY` | ElevenLabs | non | Voix de Nami par ElevenLabs au lieu de `say` (décision de Clément le 8 novembre : on reste sur la voix actuelle, Nathan s'en charge) |

## 4. `.env.local`, variable par variable

```bash
cp .env.example .env.local
```

Puis éditer. Toutes les variables lues par le code, avec les valeurs du banc :

### Obligatoires pour la démo

| Variable | Valeur du banc | Explication |
|---|---|---|
| `HAI_API_KEY` | la clé H | Voir section 3 |
| `GLADIA_API_KEY` | la clé Gladia | Voix |
| `LINKUP_API_KEY` | la clé Linkup | Papiers en direct |
| `PASSPORT_READER` | `h` | Fournisseur autorisé à lire la photo du passeport : `off` (défaut, aucune lecture), `h`, `anthropic`. Sans cette variable, Nami refuse de lire le passeport (consentement exigé par le serveur). |
| `NAMI_DOCUMENTS_DIR` | `/Users/<toi>/Documents/nami-demo` (chemin absolu, à adapter) | Dossier où Nami cherche le passeport, la photo et le billet retour (section 6). Désactivé en production. |
| `NAMI_AGENT_CHROME_PORT` | `9333` | Port de debug du Chrome de l'agent. Doit être égal au `--debug-port` du pont. 9222 par défaut dans le code, **9333 sur le banc** pour ne pas entrer en conflit avec un Chrome personnel. |
| `NAMI_LOCAL_SESSION_ID` | UUID écrit par `scripts/lancer-demo.sh` | Identifiant du canal du pont `holo local browser`. Le script le génère la première fois, le garde dans `~/.config/nami/local-browser-session-id` et **l'écrit lui-même dans `.env.local`**. Ne pas le changer à la main : un nouvel identifiant oblige H à ouvrir un nouveau canal, ce qui est refusé (429) quand le compte est saturé. |
| `NAMI_BRIDGE_LOG` | chemin écrit par le script, en général `/var/folders/.../T/nami-demo/holo-local-browser.log` (`$TMPDIR/nami-demo/holo-local-browser.log`) | Journal du pont. Nami le lit pour savoir si le pont a reçu un `destroy` depuis son dernier démarrage (chromedriver mort) et le relance avant chaque session. Écrit par le script. |

### Optionnelles

| Variable | Défaut | Explication |
|---|---|---|
| `HAI_MODEL` | `holo4-27b` | Modèle H Models API pour comprendre les phrases (`/api/trip/parse`, `/api/voice/intent`, `/api/translate`). Repli automatique sur `holo4-35b-a3b` au second essai. Le 8 novembre à 4 h, `holo4-27b` ne répondait plus (plus de 25 s) et `HAI_MODEL=holo4-35b-a3b` a été mis **temporairement** dans le `.env.local` du banc : à retirer quand H est revenu à la normale. |
| `HAI_VISION_MODEL` | `HAI_MODEL` puis `holo4-27b` | Modèle de lecture du passeport |
| `HAI_AGENT_NAME` | nom interne | Libellé de l'agent inline créé chez H (mis en kebab-case) |
| `NAMI_AGENT_MODEL` | `holo4-27b` | Modèle de l'agent H Agents API (`holo4-27b`, `holo4-35b-a3b`, `holo3-1-35b-a3b`, `holo3-122b-a10b`) |
| `NAMI_AGENT_REASONING` | `medium` | `disabled`, `low`, `medium`, `xhigh` (seul `holo4-27b` suit les niveaux) |
| `NAMI_AGENT_SETTLE_S` | `0.5` | Pause après chaque action de l'agent avant la capture ; `1` si Google Flights charge lentement |
| `NAMI_AGENT_MARKDOWN` | activé | `off` désactive les observations en markdown de l'agent H (`browserSettings` dans `lib/h-agent.ts`) |
| `LLM_PROVIDER` | `h` | `h` ou `anthropic` pour la compréhension |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Repli Anthropic |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` | | Voix ElevenLabs (sinon `say` de macOS) |
| `NAMI_MAC_VOICE` | activée sur macOS hors production | `off` coupe la voix lue par le Mac (`macSayEnabled`) |
| `NAMI_STREAM_PLAYER` | `play` de sox s'il existe | Lecteur audio en flux ; `off` pour désactiver |
| `NAMI_ACCESS_CODE` | vide | Code d'accès des routes payantes. **Doit rester vide en démo locale** : le cookie `nami_access` est `SameSite=Strict` et serait refusé dans l'iframe du panneau. Obligatoire en production (jamais déployée à ce jour). |
| `NAMI_CDP_SMOKE`, `NAMI_CDP_PORT` | | Tests du script de démo sur une VM, ne pas utiliser sur le banc |

Variables des scripts de test (section 10) : `NAMI_URL`, `NAMI_RUNS_DIR`, `NAMI_DEMO_EMAIL`, `NAMI_DEMO_PHONE`, `NAMI_DEMO_ADDRESS`, `NAMI_FLIGHT_DESTINATION`, `NAMI_FLIGHT_DEPART`, `NAMI_FLIGHT_RETURN`, `NAMI_FLIGHT_TRAVELLERS`, `NAMI_FLIGHT_ORIGIN`.

Le `.env.local` du banc compte 15 lignes : `ANTHROPIC_MODEL`, `GLADIA_API_KEY`, `HAI_AGENT_NAME`, `HAI_API_KEY`, `HAI_MODEL`, `LINKUP_API_KEY`, `LLM_PROVIDER`, `NAMI_AGENT_CHROME_PORT`, `NAMI_BRIDGE_LOG`, `NAMI_DOCUMENTS_DIR`, `NAMI_LOCAL_SESSION_ID`, `PASSPORT_READER`, plus des commentaires.

Vérification : `grep -c '^HAI_API_KEY=.' .env.local` affiche `1` ; ne jamais afficher la valeur.

## 5. Le Chrome de l'agent

L'agent H clique dans **un Chrome dédié**, jamais dans le Chrome personnel. Il est lancé par `scripts/lancer-demo.sh` (section 7) avec exactement ces options :

```
--remote-debugging-port=9333
--force-device-scale-factor=1          # Retina : sans ça, les clics de H tombent au double des coordonnées (mesuré le 7 novembre)
--user-data-dir=$HOME/chrome-for-agents
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
--disable-background-timer-throttling   # la fenêtre cachée continue de tourner
--disable-features=Translate            # pas de bulle de traduction qui gêne l'agent
--no-first-run
```

Le script refuse de continuer si le port 9333 est occupé par un autre navigateur (par exemple un Chrome personnel lancé avec ce port) ou si la densité de pixels du Chrome n'est pas 1 : fermer ce Chrome et relancer le script. Conséquence voulue de la densité 1 : l'affichage est un peu flou sur un écran Retina.

Au premier lancement, le profil `~/chrome-for-agents` est vide : pas de compte Google, pas d'extension. C'est normal.

**Règle des onglets, à respecter à chaque passage** : avant de lancer un agent, le Chrome de l'agent doit contenir **un seul onglet, sur `about:blank`**, plus le panneau Nami. Tout autre onglet (`chrome://extensions`, `options.html`, `chrome://newtab`, un ancien site) fait échouer la session : Nami arrête l'agent dès qu'une page du Chrome est hors du domaine officiel du papier (« Agent stopped: it left the official site »). Ne pas ouvrir ni fermer d'onglet pendant qu'une session tourne (le pont perd son chromedriver).

Pour nettoyer sans toucher à la souris, par l'API DevTools :

```bash
curl -s http://127.0.0.1:9333/json | python3 -c "import sys,json; [print(t['id'], t['url']) for t in json.load(sys.stdin) if t['type']=='page']"
curl -s "http://127.0.0.1:9333/json/close/<id de l'onglet à fermer>"
curl -s -X PUT "http://127.0.0.1:9333/json/new?about:blank"
```

(Le panneau apparaît comme une page `chrome-extension://.../panel.html` : le garder.)

## 6. Les documents de démo

Nami cherche dans `NAMI_DOCUMENTS_DIR` :

| Document | Nom sur le banc | Exigences |
|---|---|---|
| Passeport | `passeport-scan.jpg` (utilisé) et `passeport.jpg` (photo au téléphone, gardée pour mémoire) | **Scan à plat de la page photo, droit, MRZ en bas, JPEG.** Le lecteur du site e-VOA refuse une photo prise au téléphone. Nami lit la MRZ et compare aux champs imprimés ; une divergence est signalée, jamais corrigée en silence. |
| Photo d'identité | `photo.jpg` | JPEG (un HEIC est converti par Nami). Le site n'affiche pas d'aperçu, c'est normal. |
| Billet retour (optionnel, étape 2 du visa, hors borne de la démo) | PDF dont le nom contient `billet`, `ticket`, `retour`, `return` ou `flight` | |

**Ces fichiers sont de vrais documents** : accord écrit du titulaire obtenu, jamais dans Git (le dossier `private/` du dépôt est ignoré, mais le banc utilise un dossier hors du dépôt), jamais lisibles dans une capture, une vidéo ou un message. Supprimer les sessions H et les documents après la démo.

Si le passeport ou la photo n'est pas trouvé, le panneau le dit et affiche une zone glisser-déposer (« Choose a file ») : le fichier déposé est copié dans `NAMI_DOCUMENTS_DIR` et le parcours reprend.

Vérification (Nami lancée, section 7) : `curl -s "http://localhost:3000/api/documents/find?kind=passport"` renvoie le fichier ; idem `kind=photo`.

## 7. Lancer la démo : `npm run demo`

```bash
cd ~/nami
npm run demo            # = bash scripts/lancer-demo.sh (--port 9333 par défaut)
```

Le script, dans l'ordre :

1. Prend `HAI_API_KEY` dans l'environnement ou `.env.local` (sans jamais l'afficher) ; sinon s'arrête : « No H key ».
2. Trouve `holo` (`HOLO_BIN`, `PATH`, ou `~/.venvs/holo/bin/holo`).
3. Fixe l'identifiant de session du pont (`NAMI_LOCAL_SESSION_ID`, sinon `.env.local`, sinon `~/.config/nami/local-browser-session-id`, sinon un nouvel UUID).
4. Lance le Chrome de l'agent (section 5) ou réutilise celui qui écoute déjà sur 9333 si c'est bien le profil de l'agent en densité 1.
5. Lance `holo local browser --session-id <uuid> --debug-port 9333`, journal dans `$TMPDIR/nami-demo/holo-local-browser.log`, et le **relance en boucle** chaque fois qu'il s'arrête (il s'arrête à la fin de chaque session H ; au repos il affiche « H bridge stopped (code 0), restarting in 1 s » toutes les ~20 s, c'est normal). Après 3 échecs d'affilée, il arrête tout.
6. Écrit `NAMI_LOCAL_SESSION_ID` et `NAMI_BRIDGE_LOG` dans `.env.local`.
7. Lance Nami (`npm run dev`, Next.js en mode développement, `http://localhost:3000`), sauf si elle tourne déjà. Si une autre application occupe le port 3000, il s'arrête.

Ctrl+C arrête le pont et Nami ; le Chrome de l'agent reste ouvert.

Sur le banc, on le lance détaché avec un journal unique, ce qui permet de lire tout ce qui se passe (routes Nami, pont, erreurs `h-agent`) :

```bash
nohup npm run demo >> ~/nami-demo.log 2>&1 &
tail -f ~/nami-demo.log
```

Pour tout redémarrer proprement (à faire après un `git checkout` d'une autre branche, après un changement de `.env.local`, ou quand l'état en mémoire de Nami est douteux) :

```bash
pkill -f lancer-demo; pkill -f "next dev"; pkill -f "holo local browser"; sleep 2
nohup npm run demo >> ~/nami-demo.log 2>&1 &
```

Attention : `pkill -f` tue tout processus dont la ligne de commande contient le motif, y compris un shell qui contiendrait ce texte. Ne pas lancer ces `pkill` depuis un script dont la commande contient les mêmes mots.

Vérification :

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/panel   # 200
pgrep -fl "holo local browser" | head -1                                # un processus, avec --session-id et --debug-port 9333
curl -s http://127.0.0.1:9333/json/version | head -c 200               # le Chrome de l'agent répond
tail -3 "$(grep ^NAMI_BRIDGE_LOG .env.local | cut -d= -f2)"            # dernières lignes du pont
```

Au premier démarrage, Next.js compile les routes à la demande : la première requête de chaque route prend quelques secondes.

## 8. L'extension Nami dans le Chrome de l'agent

Détails complets dans `extension/README.md`. L'essentiel :

1. Dans le Chrome de l'agent (pas le Chrome personnel), ouvrir `chrome://extensions`, activer le **mode développeur**, **Load unpacked**, choisir le dossier `~/nami/extension`.
2. Épingler l'icône Nami. Un clic sur l'icône ouvre le panneau latéral, qui affiche `http://localhost:3000/panel` dans une iframe.
3. **Micro** : clic droit sur l'icône Nami, **Options**, bouton **Allow the microphone**, accepter dans la bulle de Chrome, puis fermer et rouvrir le panneau. Autoriser le micro sur `localhost:3000` dans un onglet normal ne suffit pas : l'autorisation appartient à l'extension. Tant que ce n'est pas fait, le panneau affiche « Microphone access was refused » et propose « Type instead ».
4. Si l'adresse de Nami n'est pas `http://localhost:3000`, la changer dans les mêmes options (« Nami address »).
5. **Après toute mise à jour du code de `extension/`** (par exemple après un `git pull` qui touche `extension/manifest.json`, `panel.js`, `agent-state.js`...), cliquer sur le bouton ↻ de la carte Nami dans `chrome://extensions`, **puis fermer l'onglet `chrome://extensions`** (sinon il fait échouer le passage suivant, section 5), puis rouvrir le panneau.

Pourquoi le panneau doit être dans le Chrome de l'agent : la couche visuelle (souris violette, contour du champ, cadre « Nami is filling this in ») est injectée dans les onglets officiels par l'extension et pilotée par le panneau ; dans un autre Chrome, rien ne s'affiche. Et le `localStorage` de l'iframe est séparé de celui d'un onglet normal : tout le parcours se fait dans le panneau.

Vérification : panneau ouvert, bouton micro visible ; clic sur le micro : il écoute (pas de message de refus).

## 9. Le parcours de démo, et ce qui doit se passer

État de départ (à refaire avant chaque passage) : Nami et le pont tournent (section 7), Chrome de l'agent avec un seul onglet `about:blank` + le panneau (section 5), extension rechargée si le code a changé (section 8), micro du Mac en entrée (pas l'iPhone en Continuité : Gladia devinerait une autre langue), aucune autre page de Nami ouverte ailleurs (elle parlerait aussi).

1. Dans le panneau, **« + »** en haut à droite : nouveau voyage (repart de zéro).
2. Micro, puis : « Je pars à Bali lundi pour le mariage d'un ami ». Nami comprend (2 à 4 s), déduit la date, propose le visa.
3. « Oui » (ou « ouais carrément », « je suis chaud », « yes sure »... : listes fermées puis interprétation par le modèle H). Nami cherche le passeport, le lit (3 à 5 s), le lit à voix haute, demande confirmation ; trouve la photo ; pas de billet retour.
4. « Create my visa » : l'agent H démarre (le pont est relancé frais juste avant, 1,5 s). Ligne d'état sous les coches : ce que fait l'agent. Dans l'onglet : 4 menus (FRANCE, General, Tourism, B1), Detail & Apply, Apply, étape 1, passeport déposé et lu par le site, photo déposée. **Arrêt à l'étape 1**, aucun Next, rien envoyé. 60 à 125 s selon H. Le panneau coche « Visa ».
5. Carte d'arrivée proposée, « oui » : l'agent remplit All Indonesia et **s'arrête avant Submit**. L'utilisateur peut finir à la main dans l'onglet ; le panneau attend.
6. Vol proposé, « oui » : Nami demande **la ville de départ** (« Which city do you fly from? », Paris au clic ou une ville à la voix), confirme les dates, demande le critère (« le moins cher et le plus rapide » = meilleur compromis). L'agent ouvre Google Flights (URL pré-remplie, `hl=en` : en français Google n'ouvre pas la recherche), accepte les cookies, Nami lit elle-même les vols dans la page (13 s dans le meilleur passage), propose 2 ou 3 vols en boutons courts, l'utilisateur choisit (clic ou « le deuxième, celui de Qatar »), l'agent ouvre le vol et **s'arrête sur la page des options de réservation** (31 s au total le 8 novembre). Rien de réservé.
7. Les coches Visa, Carte d'arrivée, Flight sont cliquables : elles ramènent au premier plan **l'onglet où l'agent a travaillé** (jamais une nouvelle page tant qu'un onglet du site existe ; si l'onglet a été fermé, le site est rouvert et la ligne d'état le dit).

Ce que Nami fait toute seule quand H est lent (PR #101) : lecture du passeport réessayée une fois, puis « H did not answer » (pas « document illisible ») avec « Try again » sur le même fichier ; session que H ouvre sans jamais piloter le navigateur en 45 s : abandonnée et **relancée une fois automatiquement** avec les mêmes réponses (« H is slow, starting again »), puis bouton de relance manuelle ; un « Stop agent » libère le navigateur tout de suite (plus de 409). Une relance du Vol ne repose ni la ville, ni les dates, ni le critère (PR #103).

## 10. Les scripts de test réel (sans la voix)

Ils rejouent exactement les appels du panneau, en gardant les données du passeport en mémoire (rien d'écrit en clair). Prérequis : section 7 et section 5 (onglet unique). Les journaux vont dans `~/nami-runs/` (`NAMI_RUNS_DIR`).

```bash
# Visa : un passage complet jusqu'à l'étape 1 (60 à 125 s). Avec un nombre : « Stop agent » après N étapes.
node scripts/passage-evoa.mjs passage-1
node scripts/passage-evoa.mjs passage-stop 2

# Vol : critère cheapest | fastest | fewest_stops | best, choix du vol 1 à 3, arrêt après N étapes.
node scripts/passage-vol.mjs vol-1 cheapest 1
node scripts/passage-vol.mjs vol-2 fastest 2
node scripts/passage-vol.mjs vol-3 best 1 12
```

Les scripts annulent la session dès que l'agent appelle `report_ready`, dès que l'onglet atteint une URL de paiement, et ne répondent jamais à la place de l'utilisateur (une `ask_user` attend un fichier `<label>-answer-N.txt`). macOS n'a pas la commande `timeout` : pour borner un script, le lancer en arrière-plan et lire son fichier de sortie.

Résultats attendus consignés dans `docs/tests/` (un fichier par test réel : `f1-evoa.md`, `g1-vols.md`, `2026-11-08-*.md`).

## 11. Lire les journaux

| Journal | Contenu | Lignes utiles |
|---|---|---|
| `~/nami-demo.log` (si lancé comme en section 7) | Routes Nami (`POST /api/papers/start 201 in 700ms`), erreurs `h-agent: ...`, pont `[local-bridge] bridge refreshed (pid a -> b, ready, 1600 ms)`, boucle `[lancer-demo] ...` | `grep -E "papers/start|flights/start|cancel|h-agent|bridge refreshed|4[0-9][0-9] in|5[0-9][0-9] in" ~/nami-demo.log` |
| `$NAMI_BRIDGE_LOG` | Le pont : `serving session id`, `command observation_bundle`, `command destroy`, erreurs httpx vers `agp.eu.hcompany.ai` | `tail -f` pendant un passage : s'il ne reçoit **aucune commande** après le démarrage de la session, c'est H qui ne pilote pas, pas le banc |
| `$TMPDIR/nami-demo/chrome.log` | Le Chrome de l'agent | |
| `~/nami-runs/<label>.out` | Sortie des scripts de test | |

État des sessions H, directement (la clé n'est jamais affichée) :

```bash
K=$(grep ^HAI_API_KEY .env.local | cut -d= -f2)
curl -s -H "Authorization: Bearer $K" "https://agp.eu.hcompany.ai/api/v2/sessions?limit=50" | python3 -c "import sys,json; [print(s['id'], s['status'], s.get('created_at','')[:19]) for s in json.load(sys.stdin)]"
curl -s -H "Authorization: Bearer $K" "https://agp.eu.hcompany.ai/api/v2/sessions/<id>"
curl -s -X DELETE -H "Authorization: Bearer $K" "https://agp.eu.hcompany.ai/api/v2/sessions/<id>"   # 204
```

## 12. Dépannage : tous les pièges rencontrés, et la parade

| Symptôme | Cause | Parade |
|---|---|---|
| « Agent stopped: it left the official site (chrome-extension / chrome://extensions / newtab) » dès le début | Un onglet autre que `about:blank` et le panneau dans le Chrome de l'agent | Section 5 : un seul onglet `about:blank` + panneau, fermer `chrome://extensions` après le rechargement |
| « A step failed, the agent retries » en boucle, pont : « Max retries exceeded » / « Connection refused » sur un port local | Le pont garde un chromedriver mort après le `destroy` de la session précédente | Depuis les PR #92 et #99, Nami relance le pont avant chaque session d'après son journal (`NAMI_BRIDGE_LOG` doit être renseigné). Sinon : `pkill -f "holo local browser"`, la boucle le relance |
| « Un autre agent Nami utilise ce navigateur » (409) | Une session précédente encore considérée active | Corrigé par la PR #101 (Stop ou abandon libère le navigateur localement). Si ça arrive encore : redémarrer Nami (section 7) |
| « Busy, try again in a moment. » (429) | Un lancement de même type encore en cours (un seul `papers/start` à la fois ; création de session H bornée à 30 s) | Attendre ; le panneau réessaie tout seul pendant 45 s (PR #101) |
| « Too many requests. Try again in N seconds. » (429) | Quota en mémoire d'une route (`lib/api-guard.ts`, par 10 minutes ; `papers` 30, `formalities` 60, `extract` 30, `say` 1200...) | Attendre le délai indiqué, ou redémarrer `next dev` (compteurs à zéro). L'ancien message reste dans le voyage : « + » nouveau voyage |
| « All H agent slots are busy » (429 venant de H) ou pont « platform rate-limited channel setup » | **Côté H** : des sessions du compte restent `running` avec 0 step pendant des heures ; `DELETE` répond 204 sans effet ; aucun autre point d'arrêt n'existe (`cancel`, `stop`, `interrupt` : 404 ; `PATCH` : 405) | Rien à faire côté Nami. Demander à H Company de purger les sessions `running` du compte ou de relever la limite. Vu le 8 novembre à 5 h avec 6 sessions fantômes. Changer `NAMI_LOCAL_SESSION_ID` n'aide pas (nouveau canal refusé) |
| La session démarre (« Agent started in your Chrome ») puis plus rien pendant 45 s, « The agent stopped answering », pont sans aucune `command` | H n'a pas piloté la session (API dégradée) | Nami relance une fois toute seule ; sinon attendre 2 à 3 minutes et réessayer |
| Lecture du passeport : « H did not answer » ou 502 après 30 s | Modèle de vision H lent ou en panne | Réessai automatique puis « Try again » ; si `holo4-27b` ne répond plus, `HAI_MODEL=holo4-35b-a3b` temporairement (recharge d'environnement par un redémarrage de Nami) |
| Compréhension des phrases très lente ou « Nami n'a pas compris » | Modèle `holo4-27b` lent | Idem, repli `holo4-35b-a3b` (automatique au second essai) |
| « Microphone access was refused » | Micro non autorisé pour l'extension | Section 8, point 3 |
| Le micro s'ouvre tout seul ou Nami s'entend parler | Ancien comportement, supprimé le 8 novembre (PR #87) : le micro ne s'ouvre que sur un clic | Mettre à jour le code |
| Gladia transcrit dans une autre langue | Micro de l'iPhone en Continuité, ou bruit | Micro du Mac en entrée |
| Rien ne s'affiche dans l'onglet (pas de souris violette) | Panneau ouvert dans un autre Chrome, ou extension non rechargée | Section 8 |
| Les clics de l'agent tombent à côté | Densité de pixels différente de 1 | Le script refuse de démarrer dans ce cas ; fermer le Chrome et relancer `npm run demo` |
| Google Flights s'ouvre sur l'accueil sans résultats | URL en français | Corrigé (PR #97) : `hl=en` ; ne pas changer |
| Après un `git checkout`, une route répond avec l'ancien code (« Unsupported document kind ») ou `TypeError: ... .set is not a function` | `next dev` resté en vie garde des modules ou des registres `globalThis` périmés | Redémarrer Nami (section 7) |
| `npx tsc --noEmit` : `PageProps` / `LayoutProps` introuvables | `.next/types` pas généré | `npm run build` d'abord |
| Tests : « Cannot find package » | `node_modules` en retard | `npm install` |
| Le site e-VOA refuse le passeport déposé | Photo prise au téléphone | Scan à plat (section 6) |
| « Return Ticket is empty » à l'étape 2 du visa | Pas de billet retour PDF | Hors borne de la démo (arrêt à l'étape 1) ; sinon un PDF nommé comme en section 6 |
| Les voyages créés dans un onglet n'apparaissent pas dans le panneau | `localStorage` partitionné par l'extension | Tout faire dans le panneau |

## 13. Architecture du code, pour s'y retrouver

```
app/                      pages et routes API Next.js 16 (App Router)
  page.tsx                accueil (voyage d'exemple « Sample data »)
  panel/page.tsx          LE panneau latéral : tout le parcours à la voix
  trip/[id]/page.tsx      écran voyage complet (dossier, cartes)
  trips/, map/, access/   liste, carte, code d'accès (production)
  api/
    trip/parse            phrase -> demande structurée (modèle H, repli Anthropic)
    voice/transcribe      audio -> texte (Gladia)
    voice/intent          réponse libre -> oui / non / option (modèle H)
    voice/say             voix de Nami (ElevenLabs ou say, lecture par play)
    translate             textes de l'interface dans la langue de l'utilisateur
    formalities           papiers d'entrée en direct (Linkup) + domaines officiels
    documents/find|preview|extract|extract-found|upload   passeport et photo (recherche, aperçu, lecture, dépôt)
    papers/start          crée la session H pour un papier (visa, carte d'arrivée)
    flights/start         crée la session H pour le Vol (Google Flights)
    agent/[id]/changes    long-poll des événements H, garde-fous (domaine, stall, arrêt)
    agent/[id]/answer|fill|pick|flights|screen|cancel   outils que l'agent appelle, capture, Stop agent
    access                code d'accès
components/
  panel/                  panel-screen.tsx (orchestration du panneau), focus-stage.tsx (une étape à la fois, options, boutons), status line
  trip/                   use-trip-actions.ts (actions : créer le visa, relancer, Vol...), use-agent-run.ts (suivi d'une session)
  voice/, home/, ui/      micro, accueil, composants shadcn
lib/
  contracts.ts            schémas zod (Trip, AgentRun, FlightOption...)
  trip-state.ts           état d'un voyage et conversation
  planner/                questions à poser, modules à proposer
  bali-papers.ts, official-sites.ts   papiers de Bali relevés à la main, domaines officiels
  h-agent.ts              client H Agents API (créer, changes, cancel, steps ; délais par appel)
  paper-agent.ts, flights-agent.ts, agent-task.ts   consignes et outils de l'agent par papier et pour le Vol
  agent-preflight.ts      vérifications avant une session (Chrome joignable, navigateur libre)
  agent-stall.ts          détection d'une session muette, registres abandonnée / libérée
  local-bridge.ts         relance du pont holo d'après son journal
  passport.ts, passport-extraction.ts, mrz.ts   lecture du passeport (vision H ou Anthropic), MRZ
  flights/                flow.ts (conversation Vol), extract.ts (lecture de la page Google), rank.ts (classement, libellés)
  voice/                  intent.ts, short-answers.ts, mac-say.ts
  api-guard.ts            quotas, concurrence, tailles des routes
  official-tab.ts, panel-focus.ts   coches -> onglet du papier, ligne d'état
extension/                extension Chrome (voir extension/README.md)
scripts/                  lancer-demo.sh, passage-evoa.mjs, passage-vol.mjs
docs/                     cadrage, tickets, checklist, tests réels, ce dossier
data/                     données d'exemple
private/                  vrais documents, ignoré par Git (vide dans le dépôt)
```

Flux d'une session agent : le panneau appelle `/api/papers/start` (ou `/api/flights/start`) ; le serveur vérifie Chrome et le navigateur libre (`preflightBrowser`), relance le pont si son journal montre un `destroy` (`local-bridge.ts`), crée la session H (`createSession`, 30 s au plus) avec les outils du papier ; le panneau fait ensuite du long-poll sur `/api/agent/[id]/changes` (20 s) qui applique les garde-fous (domaine officiel, session muette, arrêt avant paiement) et renvoie les étapes affichées ; les outils que l'agent appelle (`ask_user`, `upload_file`, `pick_option`, `fill_field`, `report_flights`, `report_ready`) sont servis par les routes `agent/[id]/*`. L'état du voyage vit dans le `localStorage` du panneau.

## 14. Règles pour un agent IA qui travaille sur ce dépôt

1. Lire `AGENTS.md` (règles Next.js 16 générées par `next dev` : lire la doc dans `node_modules/next/dist/docs/` avant de toucher au code Next) et `CLAUDE.md`.
2. `source ~/.nvm/nvm.sh` avant npm sur la VM Devin ; `npm install` si `node_modules` manque ; `npm run build` avant `npx tsc --noEmit`.
3. Pas de Prettier (le dépôt ne l'utilise pas). Lint = `eslint` via `npm run lint`.
4. Une branche et une PR par chantier vers `main`. **Jamais de fusion par un agent** sans l'accord explicite de la personne qui tient le projet (Clément fusionne, ou donne un « go » explicite). La PR explique exactement tout ce qui a été fait, avec tout le contexte, et nomme les fichiers.
5. Mettre à jour `docs/equipe/checklist.md` à chaque PR fusionnée (ligne F-suivante, même format) ; un fichier `docs/tests/<date>-<sujet>.md` pour chaque test réel ou diagnostic.
6. Aucun tiret cadratin ni demi-cadratin dans les textes de l'interface.
7. Aucune clé, aucun vrai document, aucune capture lisible de passeport dans Git, les PR, les journaux ou les messages.
8. L'agent H ne clique jamais sur l'envoi final ni sur le paiement ; aucun résultat inventé présenté comme lu sur un site réel. Ne pas changer ces règles sans décision explicite.
9. Sur le banc : ne jamais utiliser le Chrome personnel ; ne pas manipuler les onglets pendant une session ; tester en réel avec les scripts de la section 10 avant de dire qu'une correction marche ; un test unitaire n'est pas une validation du parcours.
10. Quand H est en panne (section 12), le dire clairement : ce n'est pas un bug de Nami.
