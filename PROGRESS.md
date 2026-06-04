# Training Manager – Fortschritts-Erinnerung

> Zuletzt aktualisiert: 04. Juni 2026
> Status: ✅ Version B.0.47 – Anwesenheit-Persistenz, iOS-Fix, PDF-Bug

---

## B.0.47 – Änderungen (04.06.2026, 11. Session)

### Anwesenheit – Team-Auswahl persistieren
- [x] `training.js` – Team-Auswahl wird per `localStorage` unter `att_team_<TRAINING_ID>` gespeichert
- [x] `training.js` – Nach Reload wird das gespeicherte Team automatisch wiederhergestellt und Spielerliste direkt geladen
- [x] `training.js` – Falls gespeichertes Team nicht mehr existiert, wird die Auswahl stillschweigend zurückgesetzt

### Anwesenheit – Reload-Button
- [x] `training.js` – Reload-Button (Pfeil-Icon) im Anwesenheits-Header neben dem Zähler
- [x] `training.js` – Klick löst `loadAttendance()` aus + 700ms Spin-Animation auf dem Button
- [x] `style.css` – `.att-reload-btn` + `.att-reload-spinning` Styles

### iOS-Zoom auf Eingabefelder deaktiviert
- [x] `base.html` – Viewport-Meta: `maximum-scale=1.0` hinzugefügt → verhindert Pinch-Zoom global
- [x] `style.css` – `input, select, textarea { font-size: 16px !important }` im Mobile-Breakpoint ≤640px → iOS zoomt nicht mehr bei Input-Fokus (iOS-Trigger: font-size < 16px)

### Safe Area am unteren Bildschirmrand entfernt
- [x] `style.css` – `env(safe-area-inset-bottom)` aus allen 6 Vorkommen entfernt: Nav-Pill-Padding, `.dash-page`, `.training-page-layout`, `.settings-mob-home`, FAB-Button, `.players-scroll`
- [x] `style.css` – FAB-Button `bottom: 76px` (über der Nav-Pill, die ~68px hoch ist)

### Bugfix – PDF für Spieler bei Trainer-Trainings
- [x] `app.py` – Route `/training/<id>/pdf`: Spieler wurden zum Kalender umgeleitet, weil nur `WHERE user_id = eigene_id` geprüft wurde. Jetzt dieselbe Zugriffslogik wie die Detail-API: Spieler dürfen PDFs von Trainings ihres Trainers laden (via `linked_user_id` → `players.user_id`-Check)

---

## Nächste Session – Feature: Übung teilen (Ansatz 1 – Share-Link)

> **Startet direkt mit der Implementierung. Kein Brainstorming mehr nötig.**

**Ziel:** Trainer kann eine Übung per WhatsApp / Nachrichten / E-Mail teilen. Spieler öffnen den Link, sehen die Übung vollständig (ohne Login) und können sie per "In meine Übungen kopieren" übernehmen.

**Technischer Plan:**
1. `database.py` – Migration: Neue Spalte `share_token TEXT` in `exercises` (nullable, UNIQUE)
2. `app.py` – `POST /api/exercises/<id>/share` → generiert UUID-Token, speichert in DB, gibt `share_url` zurück
3. `app.py` – Neue öffentliche Route `GET /exercise/share/<token>` → rendert neue Template `exercise_share.html` (kein Login nötig)
4. `app.py` – `POST /api/exercises/import/<token>` → kopiert Übung in eigene exercises (Login nötig; Bild-URL wird übernommen)
5. `exercise_share.html` – Standalone-Template (kein `extends base.html`), zeigt Übungsdetails + "In meine Übungen kopieren"-Button
6. `exercises.js` – "Teilen"-Button pro Übung → ruft Share-API auf → Web Share API (`navigator.share()`) mit Link; Fallback: Link in Zwischenablage
7. `style.css` – Styles für Share-Button + öffentliche Share-Seite

**Wichtige Details:**
- Token = `uuid.uuid4().hex` (32 Zeichen, kryptographisch sicher)
- Bild: Cloudinary-URL direkt übernehmen (kein Re-Upload nötig)
- "Kopieren"-Button nur wenn eingeloggt, sonst → Login-Hinweis
- Token bleibt dauerhaft (kein Ablaufdatum) – Trainer kann Teilen durch Löschen der Übung widerrufen

---

## B.0.46 – Änderungen (03.06.2026)

### Issue #5 – Geburtsdatum + Altersberechnung (optionales Spielerprofil-Feld)
- [x] `database.py` – Migration: `birthday TEXT` Spalte zu `players`
- [x] `app.py` – `create_player` + `update_player` akzeptieren `birthday`; API gibt `birthday` zurück
- [x] `players.js` – Geburtstagsfeld im Spieler-Modal (`type="date"`, optional), Hilfsfunktionen `isBirthdayToday()`, `calcAge()`, `formatBirthdayDisplay()`
- [x] `players.js` – Alters-Chip ("24 J.") neben dem Spielernamen auf der Karte
- [x] `players.js` + `style.css` – Birthday Easter Egg: Goldener Glimmrand (CSS-Animation `bd-glow`), warmgoldener Farbverlauf im Card-Header, Konfetti-Punkte-Animation (`:before`/`:after`), "Heute Geburtstag!"-Banner mit Kuchen-Icon

### Issue #7 – Spieler mehreren Teams zuordnen
- [x] `database.py` – Neue Tabelle `player_team_memberships (player_id, team_id, UNIQUE)`, Migration: bestehende `team_id`-Daten in Memberships übertragen
- [x] `app.py` – `GET /api/players?team_id=X`: JOIN über Memberships statt direkter `team_id`-Spalte; API gibt `team_ids: [...]` pro Spieler zurück
- [x] `app.py` – `POST/PUT /api/players`: akzeptieren `team_ids: [...]`, Memberships werden synchronisiert; `team_id` Spalte = erstes Team (für Backwards-Compat)
- [x] `app.py` – Neuer Endpoint `DELETE /api/players/<id>/teams/<team_id>` – Spieler aus einem Team entfernen ohne ihn zu löschen
- [x] `app.py` – Attendance-Routen nutzen Memberships-JOIN statt `team_id`-Filter
- [x] `players.js` – Spieler-Modal: Multi-Team-Checkboxen (alle eigenen Teams, aktive vorgehakt) wenn mehr als 1 Team vorhanden
- [x] `players.js` – Spielerkarte: Team-Badges für andere Teams; "Aus Team entfernen"-Dialog (smart: letztes Team → vollständige Löschung); "Spieler löschen" in Bearbeiten-Modal
- [x] `style.css` – Styles für Alters-Chip, Other-Team-Badges, Birthday-Glow/Konfetti/Banner, Multi-Team-Checkboxes, `.form-optional`

---

## Weit-Zukunft-Ideen (nicht geplant)

### Erweiterte Terminorganisation (vorgeschlagen von: **mad-directory**, GitHub Issue #8)
> **Wichtig: Sehr weit in der Zukunft – nicht in naher Roadmap.**
> Idee: Serientermine, Spiele, Turniere, sonstige Termine mit Uhrzeiten und Standorten.
> Diese Funktion würde die App grundlegend um einen zweiten Kalender-Typ erweitern.
> Aufwand: Hoch (neues DB-Schema, Kalender-Erweiterung, neue UI-Typen, Standortverwaltung).

---

## v0.25 – Änderungen (27.05.2026, 9. Session)

### Mobile Nav – Breite & Positionierung
- [x] `style.css` – Nav-Breite: `width: max-content` + `left:50%/translateX(-50%)` → `left:12px; right:12px; width:auto`; Items `flex:1` für gleichmäßige Verteilung (6 Tabs passen in jeden Screen)
- [x] `style.css` – `bottom: calc(env(safe-area-inset-bottom, 0px) + 6px)` für safe-area-Offset

### Mobile Nav – Positionierungs-Bug (iOS PWA) ⚠️ NOCH OFFEN
- Problem: Nav rendert beim App-Öffnen und Tab-Wechsel zu hoch (mitten im Content), Home-Indicator-Bereich darunter sichtbar. Nach manuellem Runterziehen korrekt positioniert.
- Ursache: iOS berechnet `window.innerHeight` in Standalone-PWA beim ersten Render zu groß → `position:fixed; bottom:0` landet nicht am echten Screen-Rand
- Versuchte Fixes (alle nicht ausreichend):
  - v0.23: `void nav.offsetTop` Reflow-Trick → kein Effekt auf `env()`-Variablen
  - v0.24: Wrapper-Ansatz (`padding-bottom: env(safe-area-inset-bottom)` + `scrollTo(0,1)`) → Wrapper-CSS korrekt, Bug bleibt
  - v0.25: Nav in `.app-layout` als letztes Flex-Child verschoben (`flex-direction:column`), kein `position:fixed` mehr → `position:static`, korrekt laut DevTools, aber auf echtem Gerät noch nicht vollständig getestet / Bug möglicherweise noch aktiv
- **Aktueller Stand:** Nav ist `position:static` im Flex-Flow von `.app-layout { height:100dvh; flex-direction:column }`. Kein JS-Workaround aktiv.

### Mein Team – Mobile Layout Fixes
- [x] `style.css` – `team-header-row`: `flex-direction:column` auf Mobile (Info + Actions gestapelt)
- [x] `style.css` – `team-header-actions`: `flex-wrap:wrap`; Ghost-Buttons `flex:1 1 0` (teilen Zeile 1); Primary-Button `width:100%` (Zeile 2 allein)
- [x] `style.css` / `players.html` – `players-page` in zwei Zonen aufgeteilt:
  - `.players-top` (`overflow:visible`) – Titel + Team-Tabs; negative Margins auf `.team-tabs-row` greifen jetzt (kein overflow-Clipping mehr)
  - `.players-scroll` (`overflow-y:auto`) – scrollbarer Content (Header, Stats, Grid)
- [x] `style.css` – `team-tabs-row` auf Mobile: `margin:-16px; padding:16px` (voll-breit bis Bildschirmrand)

### Mein Team – Position-Filter einklappbar (Mobile)
- [x] `players.js` – `renderContent()`: Filter-Row bekommt Klasse `collapsed` beim Rendern
- [x] `players.js` – `setPosFilter()`: Aktiven Button antippen → `collapsed` togglen; anderen wählen → setzen + `collapsed` setzen
- [x] `style.css` – `.team-filter-row.collapsed .pos-filter-btn:not(.active) { display:none }` (nur Mobile)
- [x] `style.css` – Chevron `▾`/`▴` auf aktivem Button je nach collapsed-Zustand

---

## v0.22 – Änderungen (27.05.2026, 8. Session)

### Bugfixes & UX-Verbesserungen
- [x] `style.css` – Suchleiste Players-Page: `max-width: 300px`, Selektor auf `input.team-search-input` erhöht (behebt CSS-Spezifitätsbug)
- [x] `style.css` – `#team-content { display: flex; flex-direction: column; gap: 24px }` – gleichmäßige Abstände
- [x] `style.css` – Attendance Summary Modal: neue `.sum-*`-Klassen

### Anwesenheits-Übersicht (Mein Team)
- [x] `app.py` – Neuer Endpoint `GET /api/teams/<id>/attendance-summary`
- [x] `players.js` – Button "Anwesenheits-Übersicht" im Team-Header
- [x] `players.js` – `showAttendanceSummary()`: Modal mit Fortschrittsbalken pro Spieler

### Mobile Nav – Floating Pill Redesign
- [x] `base.html` – Icons in `<span class="nav-icon">` gewrappt
- [x] `style.css` – Nav-Bar neu: frei schwebend, `border-radius:24px`, Frosted-Glass, Box-Shadow
- [x] `style.css` – Aktiver Tab: `.nav-icon` bekommt `background: rgba(37,99,235,0.12)`

---

## v0.21 – Änderungen (27.05.2026, 7. Session)

### Multi-Team + Spielerverwaltung
- [x] `database.py` – Neue Tabellen: `teams`, `players`, `training_attendance`
- [x] `app.py` – CRUD-Routen Teams + Spieler + Anwesenheit
- [x] `templates/players.html` + `static/js/players.js` – Komplett neu: Multi-Team-Tabs, Sportart-Auswahl-Grid, sportspezifische Positionen, Spielerkarten mit Status-Toggle

---

## v1.6 – Änderungen (26.05.2026, 6. Session)

### QoL-Verbesserungen
- [x] `exercises.js` – Sport-Tab via `localStorage` merken
- [x] `dashboard.html` – 4-Tage-Vorschau zeigt "Heute", "Morgen", "Übermorgen"

### Play Store Vorbereitung
- [x] PNG-Icons, erweitertes manifest.json, Service Worker v2, `/offline`, `/privacy`, `/.well-known/assetlinks.json`

---

## v1.5 – Änderungen (26.05.2026, 5. Session)

- [x] Statistiken-Dashboard (SVG-Balkendiagramm, Top-5-Übungen)
- [x] Touch Drag & Drop für Training-Übungen auf Mobile

---

## v1.4 – Änderungen (25.05.2026, 4. Session)

- [x] PWA: manifest.json, Service Worker, Icons
- [x] Hosting: Render.com, gunicorn, Cloudinary

---

## v1.3 – Änderungen (25.05.2026, 3. Session)

- [x] 7 Sportarten + 46 Seed-Übungen
- [x] Dashboard, Mobile Navigation, Responsives Design

---

## Nächste Schritte – Offene Features & Bugs

### Bug – Höchste Priorität
- [ ] **iOS PWA Nav-Position** – Nav springt beim App-Öffnen/Tab-Wechsel. Aktueller Fix: Nav ist `position:static` im `flex-direction:column` `.app-layout`. Falls Bug noch aktiv: Nächster Ansatz = VisualViewport API (`window.visualViewport.height`) zur JS-Positionierung nutzen, ODER auf echtem Gerät debuggen (Safari Web Inspector via USB).

### Mittel priorisiert
- [ ] **Trainingsvorlagen** – Training als Vorlage markieren und wiederverwenden
- [ ] **Saison-/Wochenplanung** – Überblick über geplante Trainingswochen

### Nice-to-have
- [ ] Admin-Modus für Übungen
- [ ] Bild-Zuschnitt beim Upload (Canvas API)
- [ ] Render Disk ($0,25/Monat) für persistente SQLite-DB

### Play Store (wenn release-bereit)
- [ ] Screenshots (390×844px) → `static/screenshots/`
- [ ] [pwab.com](https://pwab.com) → AAB herunterladen
- [ ] SHA-256-Fingerprint in `assetlinks.json` eintragen

---

## Vollständige Dateistruktur

```
MaxiWebs/
├── app.py              ← Flask + alle API-Routen
├── database.py         ← Schema, Migrations, Seed-Daten
├── requirements.txt
├── start.bat
├── templates/
│   ├── base.html            ← Sidebar + Mobile-Nav (v0.25: Nav in app-layout)
│   ├── dashboard.html
│   ├── login.html
│   ├── exercises.html
│   ├── calendar.html
│   ├── training.html
│   ├── training_print.html
│   ├── my_trainings.html
│   ├── settings.html
│   ├── players.html         ← v0.25: players-top + players-scroll Trennung
│   ├── offline.html
│   └── privacy.html
├── static/
│   ├── css/style.css        ← Gesamtes Stylesheet
│   ├── manifest.json
│   ├── sw.js
│   ├── icons/
│   └── js/
│       ├── exercises.js
│       ├── calendar.js
│       ├── training.js
│       ├── my_trainings.js
│       └── players.js       ← v0.25: collapsed Filter, setPosFilter überarbeitet
└── PROGRESS.md
```

---

## Technischer Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Python 3.14 + Flask 3.x |
| Datenbank | SQLite3 |
| Auth | Flask Sessions + PBKDF2-HMAC-SHA256 |
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (ES6+) |
| Icons | Nur inline SVG |
| Fonts | Google Fonts – Inter |

## App starten

```
python app.py
```
oder `start.bat` → Browser: **http://localhost:5000**
