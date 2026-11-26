# Fotowand (Arbeitstitel)

Die Kinder fotografieren auf dem iPad ihre Arbeit, die Fotos erscheinen als Wand an der Tafel. Technik wie in der Antwort-Runde (PeerJS/WebRTC, kein eigener Server, keine Konten). Gestaltung: `DESIGN.md`.

| Seite | Wofür |
|---|---|
| `index.html` | Tafel oder Lehrer-iPad. Hier startet die Lehrkraft. |
| `foto.html` | iPad der Kinder (per QR-Code oder 4 Buchstaben) |
| `fern.html` | Fernbedienung auf einem zweiten Lehrer-Gerät (per eigenem QR-Code) |

- **Ohne Fernbedienung** (Standard) erscheinen Fotos sofort. **Mit** bleiben sie verborgen, bis die Fernbedienung sie freigibt.
- Kopplung: QR-Code scannen, dann an der Tafel die angezeigte Zahl antippen. Nur ein Gerät.
- Fotos liegen nur im Arbeitsspeicher. Neuladen oder Schließen der Tafel-Seite löscht sie, spätestens nach 4 Stunden verfallen sie. Gespeichert werden nur Einstellungen, Code und Kopplungsschlüssel.
- Darstellung im Menü: geordnet oder bunter Fotostapel. Die erwartete Zahl der Fotos bestimmt die Größe.
- Namen: nur Fantasienamen.
- Der Name der App steht in `js/common.js` (`FW.NAME`), zusätzlich in den `<title>`-Zeilen.
- Lokal testen: `python3 -m http.server 8765`, dann `index.html?net=bc`, die anderen Seiten im selben Browser.

© 2026 Walteroelf · Work in Progress · [CC BY-NC-SA 4.0](LICENSE.md)
