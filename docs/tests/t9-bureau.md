# Test T9 : l'agent H pilote l'ordinateur entier

Responsable : **Ali**, sur son Mac. Durée : 30 minutes, chrono compris. Décide entre l'option A et l'option C du recadrage (`docs/specs/2026-11-07-recadrage-computer-use.md`, section 5).

## Avant de commencer

- L'agent voit **tout l'écran** et envoie une capture à H après chaque geste. Fermer tout le reste (mails, messageries, mots de passe, onglets personnels). Idéalement, une session macOS à part.
- **Aucun vrai document** pour ce test : un faux passeport (le spécimen de test du dépôt, ou une image quelconque renommée).
- Aucun vrai site officiel : on teste le dépôt de fichier sur une page locale (étape 2).
- Pour arrêter l'agent à tout moment : **deux fois Échap**, ou `holo local stop` dans un terminal.

## Installation (une fois)

```bash
python3 -m venv ~/.venvs/holo && source ~/.venvs/holo/bin/activate
pip install "hai-agents[cli,desktop]"
export HAI_API_KEY=...   # la clé H de l'équipe, à taper soi-même, jamais dans un fichier du dépôt
```

Préparer :
1. Créer `~/Documents/Voyage-test/` et y mettre trois fichiers : `facture-edf.pdf` (n'importe quel PDF), `photo-vacances.jpg` (n'importe quelle photo), `passeport-scan.jpg` (le faux passeport).
2. Créer `~/Desktop/upload-test.html` avec ce contenu :

```html
<!doctype html>
<meta charset="utf-8">
<title>Upload test</title>
<h1>Passport upload</h1>
<p>Upload a scan of the identity page of your passport.</p>
<input type="file" id="passport" accept="image/*,.pdf">
<p id="result">No file yet.</p>
<script>
  document.getElementById("passport").addEventListener("change", (e) => {
    const f = e.target.files[0];
    document.getElementById("result").textContent = f ? "Uploaded: " + f.name : "No file yet.";
  });
</script>
```

## Étape 1 : trouver le passeport dans le Finder

```bash
holo -a h/holo-desktop "Open Finder, go to Documents, then the Voyage-test folder. Find the file that is a passport scan. Do not open any other folder. Answer with the exact file name only."
```

Si cette forme ne marche pas : `holo local desktop` dans un terminal (le laisser ouvert), puis la commande `holo run … -o 'agent.environments[kind=desktop].session_id=<id affiché>'` de https://hub.hcompany.ai/agents-api/your-desktop.md.

Au premier lancement, macOS demande des autorisations (Accessibilité, Enregistrement de l'écran) pour le terminal : les donner, relancer.

**Réussi si** : la réponse est `passeport-scan.jpg`, sans avoir ouvert d'autre dossier. Noter la durée et le nombre d'étapes.

## Étape 2 : déposer ce fichier dans une page web

```bash
holo -a h/holo-desktop "Open the file upload-test.html on the Desktop in Google Chrome. Click the file input, and in the file picker choose Documents, then Voyage-test, then passeport-scan.jpg. Stop when the page shows Uploaded. Do not do anything else."
```

**Réussi si** : la page affiche « Uploaded: passeport-scan.jpg ». Noter la durée.

## Résultat (à remplir)

| Étape | Réussi ? | Durée | Étapes de l'agent | Remarques (autorisations, erreurs, gestes inattendus) |
|---|---|---|---|---|
| Installation et autorisations | | | | |
| 1. Trouver le passeport | | | | |
| 2. Déposer le fichier | | | | |

**Verdict** (une ligne) : les deux étapes réussies → option C ; sinon → option A.

Après le test : supprimer `~/Documents/Voyage-test/` et `~/Desktop/upload-test.html`.
