"""Synthetic test documents for Nami: SPECIMEN passports (fictional people, valid ICAO 9303 MRZ check digits)
and neutral ID photos. Not replicas of any real passport design: plain cards, watermarked SPECIMEN."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

WEIGHTS = [7, 3, 1]


def char_value(c: str) -> int:
    if c.isdigit():
        return int(c)
    if c == "<":
        return 0
    return ord(c) - ord("A") + 10


def check_digit(s: str) -> str:
    return str(sum(char_value(c) * WEIGHTS[i % 3] for i, c in enumerate(s)) % 10)


def pad(s: str, n: int) -> str:
    return (s + "<" * n)[:n]


def mrz(doc_no, nationality, surname, given, birth, sex, expiry, issuer=None, optional=""):
    issuer = issuer or nationality
    names = surname.replace(" ", "<") + "<<" + given.replace(" ", "<")
    line1 = pad("P<" + issuer + names, 44)
    doc = pad(doc_no, 9)
    opt = pad(optional, 14)
    parts = [doc + check_digit(doc), birth + check_digit(birth), expiry + check_digit(expiry), opt + check_digit(opt)]
    composite = check_digit("".join(parts))
    line2 = doc + check_digit(doc) + nationality + birth + check_digit(birth) + sex + expiry + check_digit(expiry) + opt + check_digit(opt) + composite
    assert len(line1) == 44 and len(line2) == 44, (line1, line2)
    return line1, line2


# Self-test against the public ICAO 9303 example (line 2 must be reproduced exactly).
_, icao2 = mrz("L898902C3", "UTO", "ERIKSSON", "ANNA MARIA", "740812", "F", "120415", optional="ZE184226B")
assert icao2 == "L898902C36UTO7408122F1204159ZE184226B<<<<<10", icao2


def font(size, mono=False):
    for name in (["consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"] if mono else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def head_photo(path: Path, skin: str, hair: str, shirt: str):
    w, h = 600, 800  # 3:4, like an ID photo
    img = Image.new("RGB", (w, h), "#eef1f4")
    d = ImageDraw.Draw(img)
    d.ellipse([90, 560, 510, 980], fill=shirt)  # shoulders
    d.rectangle([255, 470, 345, 600], fill=skin)  # neck
    d.ellipse([170, 170, 430, 500], fill=skin)  # face
    d.chord([160, 140, 440, 380], 180, 360, fill=hair)  # hair
    d.ellipse([235, 300, 265, 325], fill="#2b2b2b")
    d.ellipse([335, 300, 365, 325], fill="#2b2b2b")
    d.arc([255, 380, 345, 430], 20, 160, fill="#7a3e2e", width=5)
    d.text((20, 20), "SPECIMEN - TEST PHOTO", fill="#c0392b", font=font(28))
    img.save(path, quality=92)
    return img


def passport(path: Path, p: dict, photo: Image.Image):
    w, h = 1250, 880
    img = Image.new("RGB", (w, h), "#f7f4ec")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 90], fill="#2d3e50")
    d.text((30, 22), "TEST TRAVEL DOCUMENT - SPECIMEN - NOT VALID", fill="white", font=font(38))
    img.paste(photo.resize((300, 400)), (40, 130))
    label, value = font(22), font(34)
    rows = [
        ("Type / Code / Passport No.", f"P   {p['issuer']}   {p['doc_no']}"),
        ("Surname", p["surname"]),
        ("Given names", p["given"]),
        ("Nationality", p["nationality_label"]),
        ("Date of birth", p["birth_h"]),
        ("Sex", p["sex"]),
        ("Date of expiry", p["expiry_h"]),
    ]
    y = 130
    for k, v in rows:
        d.text((380, y), k, fill="#5a5a5a", font=label)
        d.text((380, y + 24), v, fill="#111", font=value)
        y += 66
    d.rectangle([0, h - 170, w, h], fill="#ffffff")
    mono = font(46, mono=True)
    d.text((30, h - 150), p["mrz"][0], fill="#000", font=mono)
    d.text((30, h - 85), p["mrz"][1], fill="#000", font=mono)
    wm = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(wm).text((260, 330), "SPECIMEN", fill=(192, 57, 43, 70), font=font(190))
    img = Image.alpha_composite(img.convert("RGBA"), wm.rotate(18, center=(w / 2, h / 2))).convert("RGB")
    img.save(path, quality=92)


PEOPLE = [
    # Fictional travellers. UTO is the ICAO code reserved for specimen documents.
    dict(key="fr-camille-test", issuer="FRA", nationality="FRA", nationality_label="FRANCAISE / TEST", doc_no="TST000001",
         surname="TESTEUR", given="CAMILLE", birth="900315", birth_h="15 03 1990", sex="F", expiry="320115", expiry_h="15 01 2032",
         case="French passport: Bali e-VOA and China", photo=("#e8c4a0", "#5b3a29", "#3d6fa8")),
    dict(key="td-ahmat-test", issuer="TCD", nationality="TCD", nationality_label="TCHADIENNE / TEST", doc_no="TST000002",
         surname="TESTEUR", given="AHMAT", birth="880702", birth_h="02 07 1988", sex="M", expiry="300630", expiry_h="30 06 2030",
         case="Chadian passport: Schengen tourist visa for France", photo=("#7a4b2a", "#1d1d1d", "#4a7c59")),
    dict(key="uto-short-validity", issuer="UTO", nationality="UTO", nationality_label="UTOPIAN / SPECIMEN", doc_no="TST000003",
         surname="SPECIMEN", given="ALEX", birth="851120", birth_h="20 11 1985", sex="X", expiry="270105", expiry_h="05 01 2027",
         case="Passport expiring too soon (6-month rule must warn)", photo=("#d9a77c", "#8a5a2b", "#7d4f9e")),
]

manifest = []
for p in PEOPLE:
    p["mrz"] = mrz(p["doc_no"], p["nationality"], p["surname"], p["given"], p["birth"], p["sex"], p["expiry"], p["issuer"])
    photo_path = OUT / f"photo-{p['key']}.jpg"
    photo = head_photo(photo_path, *p["photo"])
    passport_path = OUT / f"passport-{p['key']}.jpg"
    passport(passport_path, p, photo)
    manifest.append({
        "case": p["case"], "passport": passport_path.name, "photo": photo_path.name,
        "expected": {"surname": p["surname"], "given_names": p["given"], "nationality": p["nationality"],
                     "passport_number": p["doc_no"], "sex": p["sex"],
                     "birth_date": f"19{p['birth'][:2]}-{p['birth'][2:4]}-{p['birth'][4:]}",
                     "expiry_date": f"20{p['expiry'][:2]}-{p['expiry'][2:4]}-{p['expiry'][4:]}"},
        "mrz": list(p["mrz"]),
    })

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
(OUT / "README.md").write_text(
    "# Synthetic test documents\n\n"
    "Fictional people, generated by a script. Every image is marked SPECIMEN; none is a replica of a real passport design "
    "and none may be used as an identity document. The machine-readable lines (MRZ) follow ICAO 9303 with valid check "
    "digits, so Nami's reader and MRZ checks run on them like on a real scan. `manifest.json` lists the expected fields.\n\n"
    "Never upload these to a real government site: use them with the local copies of the forms only.\n",
    encoding="utf-8")
print("\n".join(f"{m['passport']}  {m['mrz'][1]}" for m in manifest))
