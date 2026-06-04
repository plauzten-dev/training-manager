# Training Manager – Projekt-Kontext für Claude

> Diese Datei wird automatisch von Claude Code gelesen. Sie enthält alles was du brauchst,
> um sofort produktiv weiter zu arbeiten.

---

## Was ist dieses Projekt?

Eine **vollständige Web-App zur Trainingsplanung** für Sporttrainer.
Gebaut mit **Python 3.14 + Flask** (Backend), **SQLite** (Datenbank) und
**Vanilla HTML/CSS/JavaScript** (Frontend). Keine Build-Tools, kein Node.js nötig.

Die App läuft lokal auf **http://localhost:5000**.

---

## App starten

```
python app.py
```
oder Doppelklick auf `start.bat`.

Flask ist bereits installiert. Beim ersten Start wird `training.db` automatisch angelegt inkl. Seed-Daten.

---

## Dateistruktur

```
MaxiWebs/
├── app.py              ← Flask-Server mit ALLEN API-Routen + import datetime
├── database.py         ← DB-Schema, Migrations, Password-Hashing, Seed-Daten (46 Übungen, 7 Sportarten)
├── requirements.txt    ← Nur "flask"
├── start.bat           ← Doppelklick zum Starten
├── training.db         ← SQLite-Datenbank (auto-generiert, NICHT committen)
├── secret_key.txt      ← Session-Key (auto-generiert, NICHT committen)
├── uploads/            ← Hochgeladene Übungsbilder
│
├── templates/
│   ├── base.html            ← Sidebar + Mobile-Nav, globale Modal-/Toast-Funktionen
│   ├── dashboard.html       ← Startseite: Begrüßung, Stats, 4-Tage (Heute/Morgen/Übermorgen), Übungsvorschläge, Zitat
│   ├── login.html           ← Login + Registrierung (KEIN extends base.html!)
│   ├── exercises.html       ← Übungsdatenbank (7 Sport-Tabs + Filter-Sidebar + Mobile-Toggle)
│   ├── calendar.html        ← Trainingskalender
│   ├── training.html        ← Training-Detailseite
│   ├── training_print.html  ← PDF-Export (Standalone, kein extends base.html!)
│   ├── my_trainings.html    ← Alle Trainings (Monatsgruppen, Stats, Suche)
│   ├── settings.html        ← Konto-Einstellungen (Profil + Passwort)
│   ├── offline.html         ← Offline-Fallback-Seite (Service Worker)
│   └── privacy.html         ← DSGVO-Datenschutzerklärung (Pflicht Play Store)
│
├── static/
│   ├── css/style.css        ← GESAMTES Stylesheet inkl. responsiver Breakpoints
│   ├── manifest.json        ← PWA-Manifest (id, name, icons, shortcuts, categories)
│   ├── sw.js                ← Service Worker (Cache v2, Offline-Fallback auf /offline)
│   ├── icons/
│   │   ├── icon-192.svg     ← Original-SVG
│   │   ├── icon-512.svg     ← Original-SVG
│   │   ├── icon-192.png     ← PNG für Play Store + apple-touch-icon
│   │   └── icon-512.png     ← PNG für Play Store
│   ├── screenshots/         ← Leer – Store-Screenshots hier ablegen (390×844px)
│   └── js/
│       ├── exercises.js     ← Übungen: Filter, Sport-Tabs (localStorage), CRUD, Mobile-Filter-Toggle
│       ├── calendar.js      ← Kalender: Render, Navigation, Training-Erstellung
│       ├── training.js      ← Training-Detail: Drag & Drop (Mouse+Touch), Übungen, Notizen, PDF, Anwesenheit
│       ├── my_trainings.js  ← Meine Trainings: Gruppen, Stats, Suche, Wiederholen
│       └── players.js       ← Mein Team: Multi-Team-Tabs, Spielerkarten, Status-Toggle, Anwesenheit
│
├── PROGRESS.md         ← Vollständige Feature-Liste, Changelog, offene To-Dos (AKTUELL)
└── CLAUDE.md           ← Diese Datei
```

---

## Datenbankschema

```sql
users (id, username, email, password_hash, created_at)

exercises (
  id, title, description, image_path,
  field_players, goalkeepers,
  core_competency, difficulty, field_size,
  sport,           -- 'Fußball' | 'Tennis' | 'Floorball' | 'Basketball' | 'Volleyball' | 'Gym' | 'Allgemein'
  created_at
)

trainings (id, user_id, title, date, notes, created_at)

training_exercises (id, training_id, exercise_id, order_index)

teams (
  id, user_id,
  name TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'Fußball',  -- 7 Sportarten
  created_at
)

players (
  id, user_id,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,  -- nullable
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'Universal',
  number INTEGER,  -- Trikotnummer, nullable
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'fit',  -- 'fit' | 'krank' | 'verletzt'
  created_at
)

training_attendance (
  id, training_id, player_id,
  present INTEGER NOT NULL DEFAULT 1,  -- 1=anwesend, 0=fehlt
  UNIQUE(training_id, player_id)
)
```

---

## Vollständige API-Übersicht

### Auth
| Method | Route | Beschreibung |
|--------|-------|-------------|
| POST | `/api/auth/register` | Registrierung |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Eingeloggter User |
| PUT | `/api/auth/change-password` | Passwort ändern |
| PUT | `/api/auth/change-profile` | Username + E-Mail ändern |

### Übungen
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/exercises` | Liste (Filter: sport, field_players, goalkeepers, core_competency, difficulty, field_size, search) |
| GET | `/api/exercises/<id>` | Einzelne Übung |
| POST | `/api/exercises` | Neue Übung (multipart/form-data, inkl. Bild) |
| PUT | `/api/exercises/<id>` | Übung bearbeiten |
| DELETE | `/api/exercises/<id>` | Übung löschen |
| GET | `/api/filter-options?sport=` | Dropdown-Optionen |

### Trainings
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/trainings` | Alle eigenen Trainings (opt. ?month=YYYY-MM) |
| POST | `/api/trainings` | Neues Training |
| GET | `/api/trainings/<id>` | Training + zugehörige Übungen |
| PUT | `/api/trainings/<id>` | Bearbeiten |
| DELETE | `/api/trainings/<id>` | Löschen |
| POST | `/api/trainings/<id>/duplicate` | Kopie mit neuem Datum erstellen |
| POST | `/api/trainings/<id>/exercises` | Übung hinzufügen |
| DELETE | `/api/trainings/<id>/exercises/<eid>` | Übung entfernen |
| PUT | `/api/trainings/<id>/exercises/reorder` | Reihenfolge speichern (body: {order: [id,...]}) |

### Teams
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/teams` | Alle Teams des Users (inkl. player_count) |
| POST | `/api/teams` | Neues Team (name, sport) |
| PUT | `/api/teams/<id>` | Team bearbeiten |
| DELETE | `/api/teams/<id>` | Team löschen (Spieler bleiben, team_id → NULL) |
| GET | `/api/teams/<id>/attendance-summary` | Anwesenheitsstatistik pro Spieler (present_count, absent_count, marked_count) |

### Spieler
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/players` | Alle Spieler (opt. ?team_id=X) |
| POST | `/api/players` | Neuer Spieler |
| PUT | `/api/players/<id>` | Spieler bearbeiten |
| DELETE | `/api/players/<id>` | Spieler löschen |
| PUT | `/api/players/<id>/status` | Status schnell ändern (body: {status}) |

### Anwesenheit
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/trainings/<id>/attendance` | Spielerliste + Anwesenheitsstatus (opt. ?team_id=X) |
| PUT | `/api/trainings/<id>/attendance` | Einzelnen Spieler markieren (body: {player_id, present}) |
| PUT | `/api/trainings/<id>/attendance/all` | Ganzes Team markieren (body: {present, team_id}) |

### Dashboard
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/dashboard` | Stats + 4-Tage-Vorschau + Übungsvorschläge |

### Seiten-Routen
| Route | Beschreibung |
|-------|-------------|
| `/` | Redirect → Dashboard (eingeloggt) oder Login |
| `/dashboard` | Startseite mit Stats, Kalendervorschau, Übungsvorschläge |
| `/login` | Login + Registrierung |
| `/calendar` | Trainingskalender |
| `/exercises` | Übungsdatenbank |
| `/training/<id>` | Training-Detailseite |
| `/training/<id>/pdf` | Druckoptimierte PDF-Ansicht |
| `/my-trainings` | Trainings-Übersicht (alle) |
| `/settings` | Konto-Einstellungen |
| `/players` | Multi-Team Spielerverwaltung |
| `/offline` | Offline-Fallback (Service Worker) |
| `/privacy` | DSGVO-Datenschutzerklärung |
| `/.well-known/assetlinks.json` | TWA-Verknüpfung für Android/Play Store |

---

## Design-System

**Keine externen UI-Bibliotheken** – alles custom in `style.css`.

```css
--sidebar-bg: #0f1f35    /* Dunkles Sidebar */
--primary: #2563eb       /* Blau – Buttons, Links */
--success: #16a34a       /* Grün */
--danger: #dc2626        /* Rot – Löschen */
--bg: #f1f5f9            /* Seiten-Hintergrund */
--surface: #ffffff       /* Karten */
--border: #e2e8f0        /* Linien */

/* Sport-Farben (Karten-Gradienten) */
.sport-bg-fussball   → grün   (#14532d → #16a34a)
.sport-bg-tennis     → orange (#7c2d12 → #ea580c)
.sport-bg-floorball  → blau   (#1e3a8a → #3b82f6)
```

**Icons:** Nur inline SVGs. **Fonts:** Inter. **Kein Emoji.**

---

## Live-Deployment (v1.4)

- **Live-URL:** `https://training-manager-nwga.onrender.com`
- **GitHub:** `plauzten-dev/training-manager` (branch: main)
- **Hosting:** Render.com Free-Tier (Python 3, gunicorn)
- **Bilder:** Cloudinary (Env-Vars in Render: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- **DB:** SQLite ephemer – Daten gehen bei Redeploy verloren, Seed-Übungen kommen automatisch zurück
- **PWA:** Auf iOS via Safari → Teilen → "Zum Home-Bildschirm" installierbar

### Neue Version deployen
```powershell
git add .
git commit -m "Beschreibung"
git push
```

---

## Was bereits vollständig funktioniert (B.0.49)

- Benutzer-Accounts (Register, Login, Logout, Profil + Passwort ändern)
- Übungsdatenbank: Erstellen/Bearbeiten/Löschen, Bildupload (Cloudinary), Suche, Filter, Sport-Tabs
- Übungs-Detail-Modal: "Zu Training hinzufügen" + "Teilen"-Button direkt aus der Detailansicht
- **Übung teilen**: Share-Link generieren (`POST /api/exercises/<id>/share`), öffentliche Seite (`/exercise/share/<token>`), In-App Import via "Via Link"-Button im Übungs-Header
- Trainingskalender: monatlich, Navigation, Training erstellen/öffnen
- Training-Detailseite: Übungen per Drag & Drop sortieren (gespeichert), Notizen (Auto-Save), PDF-Export
- Meine Trainings (`/my-trainings`): alle Trainings nach Monat, Stats-Leiste, Suche, "Wiederholen"
- Konto-Einstellungen (`/settings`): Profil, Passwort mit Stärkeanzeige, Konto-Info
- **7 Sportarten**: Fußball, Tennis, Floorball, Basketball, Volleyball, Gym, Allgemein
- **46 Seed-Übungen** inkl. Aufwärmen, Dehnen, Cool-down (Allgemein-Kategorie)
- **Dashboard** (`/dashboard`): Begrüßung, Stats, 4-Tage-Vorschau, Übungsvorschläge, Motivation
- **Multi-Team Spielerverwaltung** (`/players`):
  - Beliebig viele Teams pro User, jedes mit eigener Sportart
  - Sportspezifische Positionen im Spieler-Modal (je nach Teamsport)
  - Spielerkarten mit direkten Status-Toggle-Chips (Fit/Krank/Verletzt), optimistisches UI
  - Team-Tabs mit Sportfarben, Sportart-Auswahl-Grid im Modal
  - Position-Filter auf Mobile: eingeklappt (nur aktiver Filter + Chevron), aufklappbar per Tap
- **Anwesenheit pro Training**: Team-Selektor (persistiert per localStorage), Einzelmarkierung, Bulk-Button, Reload-Button
- **Anwesenheits-Übersicht**: Fortschrittsbalken pro Spieler im Modal (grün ≥75%, orange ≥50%, rot darunter); nutzt `player_team_memberships` JOIN
- **Responsives Design + Mobile-Nav**: Bottom-Nav (≤640px) als Floating Pill, Sidebar auf Tablet (≤900px)
- **PWA**: manifest.json, Service Worker (Cache v2), Apple-Meta-Tags – auf iOS & Android installierbar
- **Play Store Basis**: PNG-Icons, erweitertes Manifest, `/offline`, `/privacy`, `/.well-known/assetlinks.json`
- **QoL**: Sport-Tab-Auswahl wird per localStorage gespeichert; Dashboard-Vorschau zeigt "Heute"/"Morgen"/"Übermorgen"
- **iOS-Fixes**: kein Auto-Zoom bei Input-Fokus, kein Pinch-Zoom, keine Safe-Area am unteren Rand
- **PDF für Spieler**: Spieler können PDFs von Trainer-Trainings öffnen (nicht nur eigene)

### Sport-Farben (vollständig)
```css
.sport-bg-fussball   → grün    (#14532d → #16a34a)
.sport-bg-tennis     → orange  (#7c2d12 → #ea580c)
.sport-bg-floorball  → blau    (#1e3a8a → #3b82f6)
.sport-bg-basketball → lila    (#4c1d95 → #7c3aed)
.sport-bg-volleyball → amber   (#78350f → #d97706)
.sport-bg-gym        → grau    (#1f2937 → #4b5563)
.sport-bg-allgemein  → teal    (#134e4a → #0d9488)
```

---

## Mobile / PWA – Roadmap

**Ziel:** App als PWA installierbar auf iOS & Android, Backend auf einem Server hosten.

### Phase 1 – Responsives Design ✅ (erledigt)
- Bottom-Navigation auf Mobile (≤640px): Übersicht, Kalender, Übungen, Trainings
- Alle Grid-Layouts stacken vertikal auf Mobile
- Exercises-Filterleiste: Toggle-Button auf Mobile
- Sport-Tabs: horizontal scrollbar auf Mobile
- Modals: Bottom-Sheet-Stil auf Mobile

### Phase 2 – PWA-Setup ✅ (erledigt)
- manifest.json, SVG-Icons (192+512), Service Worker, Apple-Meta-Tags

### Phase 3 – Hosting ✅ (erledigt)
- Render.com Free-Tier, gunicorn, Cloudinary, SECRET_KEY als Env-Var

### Phase 4 – Native App (optional, viel Aufwand)
- [ ] **Capacitor** (Ionic) wrappen – benötigt Node.js, verpackt HTML/CSS/JS als native App
- [ ] Backend-URL in JS konfigurierbar machen (nicht hardcoded localhost)

---

## Offene To-Dos (Funktionen)

### ✅ Bug behoben (B.0.27) – iOS PWA weißer Bereich unter der Nav
- [x] **iOS PWA Viewport-Bug** – Beim App-Öffnen und Tab-Wechsel entstand unter der Nav ein weißer Bereich (iPhone) bzw. ein wegwischbarer Bereich (iPad), weil `100dvh` im Standalone-Modus größer als das echte Viewport berechnet wurde → `.app-layout` überragte den Bildschirm → `<body>` wurde scrollbar.
  - **Lösung:** Inline-JS in `base.html` (`<head>`) misst `visualViewport.height || innerHeight` und setzt CSS-Var `--app-height`, aktualisiert bei `resize`/`orientationchange`/`pageshow`/`visualViewport.resize`. `.app-layout { height: var(--app-height, 100dvh) }`. Zusätzlich `body { position:fixed; inset:0; overflow:hidden; overscroll-behavior:none }` als App-Shell-Lock (Login per `.login-body` ausgenommen → bleibt scrollbar).

### Play Store (wenn App release-bereit)
- [ ] Screenshots erstellen (390×844px) → `static/screenshots/dashboard.png` + `exercises.png`
- [ ] [pwab.com](https://pwab.com) → Live-URL → Android AAB herunterladen
- [ ] Google Play Developer-Konto anlegen ($25 Einmalgebühr)
- [ ] SHA-256-Fingerprint aus Play Console → in `app.py` bei `assetlinks.json` eintragen (Placeholder ersetzen)
- [ ] Store-Listing: Datenschutz-URL = `https://training-manager-nwga.onrender.com/privacy`

### Nächste Session – Mögliche Features
- [ ] **Trainingsvorlagen** – Training als Vorlage markieren und wiederverwenden
- [ ] **Testaccount entfernen** – Release-Blocker (3 Stellen: app.py, login.html, style.css)
- [ ] **Share-Link widerrufen** – `DELETE /api/exercises/<id>/share` um Token zu löschen

### Mittel priorisiert
- [ ] **Trainingsvorlagen** – Training als Vorlage markieren und wiederverwenden
- [ ] **Saison-/Wochenplanung** – Überblick über geplante Trainingswochen

### Nice-to-have
- [ ] Admin-Modus für Übungen (andere User können keine Übungen anlegen)
- [ ] Bild-Zuschnitt beim Upload (Canvas API)
- [ ] Render Disk ($0,25/Monat) für persistente SQLite-DB → `DB_PATH=/data/training.db`

---

## Wichtige Hinweise für Claude

1. **Python-Befehl**: Immer `python` (nicht `python3`) – Python 3.14.
2. **Pip**: Immer `python -m pip`.
3. **PowerShell**: Kein `&&` in PS 5.1 – stattdessen `;` oder `if ($?) { ... }`.
4. **Kein Node.js** – keine npm/webpack/vite möglich.
5. **Keine externen CSS/JS-Bibliotheken** – alles in den bestehenden Dateien.
6. **DB-Migrationen**: `try/except` wrappen (ALTER TABLE schlägt fehl wenn Spalte existiert).
7. **Emojis**: NICHT verwenden – ausschließlich inline SVG.
8. **Preview**: `.claude/launch.json` konfiguriert → `preview_start` mit Name "Training Manager".
9. **Server-Neustart nötig** nach Änderungen an `app.py` (neue Routen werden sonst nicht geladen).
10. **Template-Auto-Reload**: `TEMPLATES_AUTO_RELOAD = True` gesetzt – Template-Änderungen werden ohne Restart erkannt.
11. **Nested `<a>` vermeiden**: Niemals `<a>` in `<a>` – für klickbare Elemente in Links stattdessen `<div onclick="...">` verwenden.
12. **Responsive Breakpoints**: ≤640px = Mobile (Bottom-Nav), ≤900px = Tablet (Icon-Sidebar), ≤380px = Kleines Phone.
13. **init_db() läuft beim Import**: Außerhalb von `__main__` – wird auch unter gunicorn ausgeführt.
14. **Bildupload**: `_upload_image()` + `_delete_image()` in app.py – Cloudinary wenn Env-Vars gesetzt, sonst lokal.
15. **image_path**: Kann lokaler Dateiname (z.B. `abc123.jpg`) ODER volle Cloudinary-URL sein – JS prüft `startsWith('http')`.
16. **Mobile Nav Layout (B.0.47+)**: Nav nutzt `position:fixed; bottom:0; left:0; right:0` – schwebt immer am unteren Bildschirmrand. `.mobile-nav-wrap { pointer-events:none }`, `.mobile-nav { pointer-events:all }` damit Klicks neben der Pill durchgehen. Alle Scroll-Container (`.dash-page`, `.training-page-layout`, `.settings-mob-home`, `.players-scroll`) haben im Mobile-Breakpoint `padding-bottom: 82px` (kein `env(safe-area-inset-bottom)` mehr – Safe Area wurde B.0.47 komplett entfernt). FAB-Button: `bottom: 76px`. `--app-height` (JS: `window.innerHeight`) bleibt für `.app-layout` erhalten.
18. **iOS-Zoom deaktiviert (B.0.47)**: Viewport hat `maximum-scale=1.0`. Alle `input, select, textarea` haben im Mobile-Breakpoint `font-size: 16px !important` – iOS zoomt bei Input-Fokus wenn font-size < 16px, daher !important nötig.
19. **PDF-Zugriff für Spieler (B.0.47)**: Route `/training/<id>/pdf` erlaubt Spielern das Öffnen von Trainer-Trainings (via `linked_user_id → players.user_id`-Check), nicht nur eigene Trainings.
20. **Sport-Dropdown Übungsformular (B.0.48)**: Schwebendes Custom-Dropdown (`.ex-sport-wrap`/`.ex-sport-trigger`/`.ex-sport-panel`). `updateCompetencyOptions()` liest von `<input type="hidden" id="form-sport">`, NICHT von einem `<select>`. `selectExSport(sport)` schließt Panel + aktualisiert Competencies. Alle 7 Sportarten + Kernkompetenzen in `SPORT_COMPETENCIES` in exercises.js.
21. **Share-Link (B.0.48)**: `exercises.share_token` (UNIQUE, nullable). Route `/exercise/share/<token>` braucht KEIN `@login_required`. Import-Route `POST /api/exercises/import/<token>` kopiert Übung ohne `share_token`. Preview-Server: Immer prüfen ob nur EIN Prozess auf Port 5000 läuft (`netstat -ano | findstr ":5000"`), sonst antwortet alter Code.
17. **Players Page Struktur (v0.25)**: `players.html` hat zwei Zonen: `.players-top` (kein overflow → Team-Tabs können voll-breit scrollen) und `.players-scroll` (overflow-y:auto → scrollbarer Content). Bei Änderungen an der Players-Page beide Zonen berücksichtigen.
22. **Mobile Sport-Selektor (B.0.49)**: Auf ≤640px wird `.sport-tabs-bar { display:none }` und `.sport-sel-mob { display:block }`. `setSport(null, sport)` aufrufen für mobile Auswahl (el=null). `updateSportSelMobile(sport)` synchronisiert Trigger-Farbe + Panel-Aktiv-Status. Dropdown-Panel `position: absolute` relativ zu `.sport-sel-mob`.
23. **Ex-Sport-Panel (B.0.49)**: `position: fixed; z-index: 9999; background: var(--card)` – `var(--surface)` ist NICHT definiert (wäre transparent). In `toggleExSportDropdown()` werden `top/left/width` via `getBoundingClientRect()` des Triggers gesetzt; Breite = Modal-Breite minus 16px Rand.
24. **Mobile Filter-Panel (B.0.49)**: `.filter-sidebar.mobile-open { flex: 1; padding-bottom: 82px }` + `.exercises-layout { flex:1; overflow:hidden }` damit der Filter den vollen Platz füllt. `.filter-sidebar.mobile-open ~ .exercises-main { display:none }` versteckt Übungskarten wenn Filter offen.
