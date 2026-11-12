# Fischkasse

Web-App fürs iPhone, mit der du den Verkauf von Fischen, Garnelen, Schnecken & Co. festhältst: Umsatz, Ausgaben, Gewinn und Kassenstand – nach Monaten ausgewertet. Läuft komplett im Browser, ohne Server und ohne Konto. Nach dem ersten Öffnen funktioniert sie auch offline.

## Funktionen

| Bereich | Was du damit machst |
|---|---|
| **Kasse** (großer roter Knopf in der Mitte) | Artikel-Kacheln mit Foto antippen (+1 pro Tipp; −/+ und Mengeneingabe erscheinen direkt auf der Kachel). Unten schwebt der Warenkorb mit Summe. „Kassieren“ → Endbetrag (Rabatt möglich), Verkaufsweg, Datum, Notiz, Rückgeld-Rechner, „noch nicht bezahlt“ (Reservierung). Der Warenkorb bleibt erhalten, auch wenn du die App kurz verlässt. |
| **Nur Betrag / Einnahme** | Verkauf ohne Artikel zählen, z. B. 1,66 €. Gleiches Fenster für Ausgabe, Privatentnahme und Einlage, mit großem Ziffernblock. |
| **Artikel & Preise** (in der Kasse oben rechts oder unter „Mehr“) | Name, Stückpreis, Kategorie, Foto, Mengenrabatt („ab 10 Stück je 1,20 €“), Bestand (zählt bei Verkäufen automatisch runter), Link zur Anzeige. Preisänderungen gelten nur für neue Verkäufe; die letzten Preisänderungen werden angezeigt. Archivieren statt löschen, Reihenfolge der Kacheln sortierbar. |
| **Aus Anzeige übernehmen (KI)** | Prompt kopieren → in ChatGPT/Claude/Gemini mit Screenshots der Anzeige einfügen → Antwort zurück in die App kopieren → prüfen → übernehmen. Gibt es den Artikel schon (gleicher Name), wird nur der Preis aktualisiert. Die App selbst enthält keine KI und schickt nichts ins Internet. |
| **Messen & Börsen** | Messe mit Datum anlegen und entweder die Tageseinnahmen direkt eintragen oder im **Messe-Modus** jeden Verkauf in der Kasse zählen – er wird dann automatisch der Messe zugeordnet. Standgebühr und Fahrt werden als Kosten gebucht, die Messe zeigt ihren eigenen Gewinn. |
| **Start** | Kassenstand als „Becken“ (pro heutigem Verkauf schwimmt ein Fisch darin), Tagesumsatz, Schnellzugriffe, aktueller Monat mit Balken „wie viel vom Umsatz bleibt“, offene Reservierungen, letzte Einträge. |
| **Verlauf** | Alle Einträge nach Monaten, mit Filter und Suche. Antippen → Details, bearbeiten, löschen (mit „Rückgängig“). |
| **Statistik** | Jahr mit 12-Monats-Diagramm, Monatstabelle, Umsatz nach Verkaufsweg, Ausgaben nach Kategorie, meistverkaufte Artikel, Summen seit Beginn. |
| **Darstellung** | Hell, dunkel oder automatisch nach Systemeinstellung (unter „Mehr“). |
| **Kasse abgleichen** | Echtes Geld zählen, eintragen – die Differenz wird als Korrektur gebucht. |
| **Datensicherung** | Backup als Datei (inkl. Fotos) über das Teilen-Menü, Backup laden, CSV-Export für Excel/Numbers. Erinnerung, wenn das letzte Backup älter als 30 Tage ist. |

### So wird gerechnet

- **Umsatz** = alles, was Kunden tatsächlich bezahlt haben.
- **Gewinn** = Umsatz − Ausgaben.
- **Kassenstand** = Einlagen + Umsatz − Ausgaben − Privatentnahmen ± Abgleich.
- Privatentnahmen und Einlagen ändern nur den Kassenstand, nicht den Gewinn.
- Reservierte (noch nicht bezahlte) Verkäufe zählen erst ab „bezahlt“.
- Alle Beträge werden intern in Cent gerechnet, es gibt also keine Rundungsfehler.

## Auf GitHub Pages veröffentlichen

1. Repository auf GitHub öffnen → **Settings** → **Pages**.
2. Bei **Source** „Deploy from a branch“ wählen, den Branch mit diesen Dateien (z. B. `main`) und den Ordner **`/ (root)`** einstellen → **Save**.
3. Nach ca. 1 Minute ist die App unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

Hinweis: GitHub Pages ist bei einem kostenlosen Konto nur für **öffentliche** Repositories verfügbar. Öffentlich ist dann nur der Programmcode – deine Verkaufsdaten liegen ausschließlich auf deinem iPhone.

## Auf dem iPhone installieren

1. Den Pages-Link in **Safari** öffnen.
2. **Teilen** → **Zum Home-Bildschirm** → Hinzufügen.
3. Ab dann nur noch das Icon benutzen. Safari und die Home-Bildschirm-App haben **getrennte Speicher**.

## Wichtig zur Datensicherheit

- Es gibt keine Cloud. Die Daten liegen nur im Speicher der App auf diesem Gerät (IndexedDB, zusätzlich eine Sicherheitskopie ohne Fotos).
- **Löschst du das Icon vom Home-Bildschirm, löscht iOS auch die Daten.** Vorher immer ein Backup machen.
- Ein Backup lässt sich auf einem anderen Gerät über „Backup laden“ einspielen. Eine automatische Synchronisierung zwischen Geräten gibt es nicht.

## Technik

Reines HTML/CSS/JavaScript (ES-Module), ohne Build-Schritt und ohne externe Bibliotheken.

```
index.html             Einstieg
manifest.webmanifest   App-Name, Icons, Vollbild
sw.js                  Offline-Cache (Service Worker)
css/app.css            Gestaltung („Becken“-Design, hell/dunkel)
js/app.js              Start, Navigation, Tab-Leiste, Darstellung
js/store.js            Daten, Speicherung, Auswertungen
js/model.js            Kategorien, Rechenregeln
js/ai.js               KI-Prompt und Parser für die Antwort
js/sheets.js           Formulare (Verkauf, Ausgabe, Messe, Abgleich …)
js/products.js         Artikel-Editor und KI-Import
js/backup.js           Backup, Wiederherstellung, CSV
js/views/*.js          Bildschirme
```

Lokal testen: `python3 -m http.server` im Projektordner, dann `http://localhost:8000` öffnen.

Nach Änderungen an den Dateien: Die installierte App lädt Updates im Hintergrund und zeigt sie beim nächsten Start an. Neue Dateien müssen zusätzlich in `sw.js` (Liste `ASSETS`) eingetragen werden; bei größeren Änderungen die Cache-Version (`CACHE`) in `sw.js` hochzählen, damit alle Dateien gemeinsam wechseln.

Die App ist eine Übersicht für dich und kein steuerliches Kassenbuch.
