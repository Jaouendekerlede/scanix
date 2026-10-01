from PIL import Image, ImageDraw

# Icône : feuille de papier avec coins de cadrage et trait de scan, sur fond turquoise.
def fond(size):
    img = Image.new("RGB", (size, size))
    haut, bas = (45, 212, 191), (12, 74, 90)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / size
        d.line([(0, y), (size, y)], fill=tuple(int(haut[i] + (bas[i] - haut[i]) * t) for i in range(3)))
    return img

def icone(size, echelle, maskable):
    img = fond(size).convert("RGBA")
    d = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    w, h = size * 0.40 * echelle, size * 0.52 * echelle
    gauche, haut, droite, bas = cx - w, cy - h, cx + w, cy + h
    # Feuille
    d.rounded_rectangle([gauche, haut, droite, bas], radius=size * 0.04, fill=(255, 255, 255, 245))
    # Lignes de texte
    for i, longueur in enumerate((0.80, 0.62, 0.74, 0.50)):
        y = haut + h * (0.34 + i * 0.26)
        d.rounded_rectangle([gauche + w * 0.22, y, gauche + w * 0.22 + (2 * w * 0.56) * longueur, y + size * 0.022 * echelle], radius=size * 0.01, fill=(12, 74, 90, 200))
    # Coins de cadrage
    marge = size * 0.07 * echelle
    epaisseur = max(2, int(size * 0.032 * echelle))
    long = size * 0.12 * echelle
    couleur = (255, 255, 255, 255)
    for (x, y, sx, sy) in ((gauche - marge, haut - marge, 1, 1), (droite + marge, haut - marge, -1, 1), (droite + marge, bas + marge, -1, -1), (gauche - marge, bas + marge, 1, -1)):
        d.line([(x, y), (x + sx * long, y)], fill=couleur, width=epaisseur)
        d.line([(x, y), (x, y + sy * long)], fill=couleur, width=epaisseur)
    # Trait de scan
    ys = cy + h * 0.05
    d.rounded_rectangle([gauche - marge * 0.6, ys, droite + marge * 0.6, ys + size * 0.026 * echelle], radius=size * 0.012, fill=(45, 212, 191, 255))
    if not maskable:
        masque = Image.new("L", (size, size), 0)
        ImageDraw.Draw(masque).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=255)
        sortie = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sortie.paste(img, (0, 0), masque)
        return sortie
    return img

for s in (192, 512):
    icone(s, 1.0, False).save(f"icons/icon-{s}.png")
    icone(s, 0.8, True).save(f"icons/icon-{s}-maskable.png")
# Icône Windows (.ico) pour le raccourci bureau.
icone(256, 1.0, False).save("icons/scanix.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("icons ok")
