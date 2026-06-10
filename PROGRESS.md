# Training Manager – Fortschritts-Erinnerung

> Zuletzt aktualisiert: 10. Juni 2026
> Status: ✅ Version B.0.58 – Mobile Nav-Politur, Testaccount entfernt, Datenschutz OAuth-Hinweis

---

## B.0.58 – Änderungen (10.06.2026, 20. Session) – Release-Vorbereitung

- [x] **Mobile Bottom-Nav**: alle 6 Items exakt gleich breit (`min-width: 0` auf
      `.mobile-nav-item`, "Einstellungen" → "Konto" gekürzt) – vorher sprengte der lange
      Text das Flex-Item und verschob die Icon-Abstände sichtbar.
- [x] **Mobile Abstände**: `.mobile-nav-wrap` Bottom-Padding 8px → 14px (Nav etwas vom
      unteren Rand abgesetzt), `.page-header`/`.dash-hero` Top-Padding reduziert (Begrüßung
      rückt näher an Statusleiste/Dynamic Island).
- [x] **Testaccount-Login entfernt** (letzter Release-Blocker): Route
      `POST /api/auth/test-login` (`app.py`), Button + `testLogin()` (`login.html`),
      `.btn-test-login`-Styles (`style.css`) komplett entfernt.
- [x] **Datenschutzerklärung ergänzt** (`privacy.html`): neuer Abschnitt 3 "Anmeldung über
      Google oder Microsoft" (OAuth-Datenweitergabe), Hinweis bei Passwort-Punkt ergänzt,
      nachfolgende Abschnitte 3-8 → 4-9 umnummeriert.
- [x] SW-Cache v11→v12, Version B.0.58 an allen 3 Stellen.

---

## B.0.57 – Änderungen (10.06.2026, 19. Session) – Mobile Registrierung als Step-Wizard

- [x] **Registrierung (Mobile ≤640px) als Step-Wizard**: `templates/login.html` –
      `#register-form` in `.reg-step`-Sektionen aufgeteilt (Rolle → Einladecode [nur Spieler]
      → Benutzername → E-Mail → Passwort → Datenschutz/Submit), je ein Feld pro Bildschirm
      mit Slide-Animation (`.reg-steps-track` + `transform: translateX()`).
- [x] Wizard-Chrome (Zurück-Pfeil, Progress-Dots, Step-Titel/Subtitle, "Weiter"-Buttons)
      nur auf Mobile sichtbar; Desktop/Tablet unverändert (`.reg-step { display: contents }`).
- [x] Tap auf Rollen-Karte (Trainer/Spieler/Privat) wählt Rolle + Auto-Advance zum nächsten
      Schritt. OAuth-Buttons + Testaccount-Button nur in Schritt 1 sichtbar.
- [x] Pro-Schritt-Validierung in JS (`regValidateField`) statt HTML5 `required`-Attributen –
      verhindert native Validierungs-Bubbles auf unsichtbaren/transformierten Feldern.
      `handleRegister()` validiert zusätzlich vor dem Absenden.
- [x] Login bleibt unverändert (kompaktes 2-Felder-Formular, kein Wizard).
- [x] Version B.0.57 an allen 3 Stellen (base/login/settings).

---

## B.0.56 – Änderungen (10.06.2026, 18. Session) – Play-Store-Release-Vorbereitung

- [x] **Konto-Löschung (Self-Service)**: Neue Route `DELETE /api/auth/account` (`app.py`) –
      löscht den User samt aller per `ON DELETE CASCADE`/`SET NULL` verknüpften Daten
      (Trainings, Teams, Spieler, Termine, Favoriten, geteilte Übungs-Links) und alle
      zugehörigen Profilbilder (User + Spieler). Bestätigung per Passwort, bei OAuth-Konten
      per eingetipptem Benutzernamen.
- [x] **Settings-UI**: Neue "Gefahrenzone"-Sektion (`detail-konto-loeschen`) in
      `templates/settings.html` mit Warntext, Bestätigungs-Modal (`confirmDeleteAccount`/
      `doDeleteAccount`) und Redirect nach `/login` bei Erfolg.
- [x] **Datenschutzerklärung** (`templates/privacy.html`): Domain auf
      `training-manager.fly.dev` korrigiert, Kontakt `mail.plauzten@gmail.com` ergänzt,
      Abschnitt 4 auf Fly.io + persistentes Volume aktualisiert, Abschnitt 5 verweist auf
      Self-Service-Löschung in den Einstellungen, Datum auf Juni 2026 aktualisiert.
- [x] **Consent-Checkbox** bei Registrierung (`templates/login.html` + `app.py`):
      Pflicht-Checkbox "Datenschutzerklärung akzeptieren" mit Link zu `/privacy`,
      serverseitige Validierung in `register()` (`accept_privacy` → 400 wenn fehlend).
- [x] SW-Cache `v10` → `v11`. Version B.0.56 an allen 3 Stellen (base/login/settings).

---

## B.0.55 – Änderungen (09.06.2026, 17. Session) – Edge-to-Edge dunkle Statusleiste

> Hinweis: dreht die Safe-Area-Entfernung aus B.0.54 teilweise zurück – `viewport-fit=cover`
> ist wieder aktiv, aber das Nav-Schweben wird jetzt anders verhindert (`position:fixed; inset:0`).

- [x] **Wunsch**: dunkler App-Hintergrund/Hero-Verlauf soll bis ganz oben hinter die Statusleiste
      laufen, Uhr/WLAN/Akku weiß, Dynamic Island eingeblendet.
- [x] `viewport-fit=cover` + `status-bar-style: black-translucent` wieder aktiv (base.html + login.html)
      → Web-View randlos, weiße Statusleisten-Symbole.
- [x] `.app-layout { position: fixed; inset: 0 }` statt `height: var(--app-height)` – pinnt das Layout
      exakt ans Viewport, **robust gegen die iOS-innerHeight-Unzuverlässigkeit mit cover** (das war die
      Ursache des Nav-Schwebens in B.0.53). + `background: #0f1f35` (= Hero-Verlauf-Startfarbe)
      + `padding-top: env(safe-area-inset-top)` → Navy füllt die Statusleisten-Fläche nahtlos.
- [x] `.main-wrapper` + `.mobile-nav-wrap`: heller Hintergrund (`var(--bg)`) → Content + Unterkante
      bleiben hell, nur die Statusleiste oben ist navy.
- [x] Nav angehoben: `.mobile-nav-wrap` padding-bottom `calc(env(safe-area-inset-bottom) + 16px)`;
      `.mt-fab` bottom `calc(96px + env(safe-area-inset-bottom))`.
- [x] SW-Cache v10→v11, Version B.0.55. Live verifiziert (cover, black-translucent, fixed+navy, v11).
- ⚠️ **iOS-Hinweis bleibt**: Statusleisten-Stil wird beim Home-Screen-Install gecacht → installierte
      PWA löschen + neu hinzufügen, damit `black-translucent` greift. Am iPhone gegenchecken.

**LEHRE iOS-PWA (final)**: Für „eigene Farbe hinter der Statusleiste" braucht es zwingend
`viewport-fit=cover` + `black-translucent`. Damit cover die Nav NICHT verschweben lässt, NICHT die
Höhe über innerHeight/dvh steuern, sondern `.app-layout { position: fixed; inset: 0 }`. Den Navy-Strip
oben = `app-layout`-Hintergrund + `padding-top: env(safe-area-inset-top)`; Content/Nav mit hellem
Hintergrund überdecken, damit nur oben navy bleibt.

---

## B.0.54 – Änderungen (09.06.2026, 17. Session) – Safe-Area-Refactor (großteils von B.0.55 abgelöst)

### Fix #5 (final): iOS-Nav schwebte trotz innerHeight-Fix zu hoch
- [x] **Architektur-Wechsel statt Safe-Area-Rechnerei**: `viewport-fit=cover` aus ALLEN Templates
      entfernt (`base.html`, `login.html`, `privacy.html`, `offline.html`) + `status-bar-style`
      von `black-translucent` auf `default`.
- [x] Wirkung: iOS hält die Web-View automatisch zwischen Statusleiste (Uhr) und Home-Indikator.
      `window.innerHeight` = exakt nutzbare Fläche → `.app-layout` füllt sie voll, Nav am echten
      unteren Rand, kein weißer Block, keine Uhr-Überlappung – ganz ohne `env(safe-area-inset-*)`.
- [x] Alle `env(safe-area-inset-*)` entfernt: `style.css` (`.app-layout` padding-top, `.mobile-nav-wrap`
      padding-bottom, `.mt-fab` bottom) + `privacy.html` padding.
- [x] `sw.js` Cache `v9` → `v10` (PWA zieht neues CSS/JS).
- [x] Version B.0.54 (base/login/settings). Live verifiziert: cover weg, status-bar=default, SW=v10.
- ⚠️ **iOS-Hinweis**: `apple-mobile-web-app-*`-Meta + Statusleisten-Stil werden von iOS beim
      „Zum Home-Bildschirm" gecacht → installierte PWA muss **gelöscht und neu installiert** werden,
      damit die Änderung greift. Am iPhone gegenchecken.

---

## B.0.53 – Änderungen (09.06.2026, 17. Session) – Bugfixes

### Fix #3/#15: Settings-Buttons & Profilbild-Upload (JS-SyntaxError)
- [x] `settings.html` Zeile ~918: typografische Anführungszeichen `‘ … ’` (U+2018/U+2019) statt
      gerader `'` als String-Delimiter → **gesamter `<script>`-Block** wurde nicht geparst →
      ALLE Funktionen (`showSettingDetail`, `uploadUserAvatar`, `submitProfile` …) undefiniert.
- [x] Root Cause für GitHub-Issue #15 (Profilbild-Upload) UND "Buttons nicht klickbar" zugleich.
- [x] Verifiziert: Funktionen jetzt definiert, Avatar-Upload-Endpoint liefert 200.

### Fix #14: Bildupload bei Übungen (stille Fehler + HEIC)
- [x] `app.py` `ALLOWED_EXTENSIONS` um `heic`, `heif` erweitert (iPhone-Standardformat)
- [x] `app.py` `_upload_image()`: HEIC/HEIF → bei Cloudinary `format='jpg'` (web-darstellbar);
      `ext`-Ermittlung crasht nicht mehr bei fehlender Extension
- [x] `app.py` `create_exercise`/`update_exercise`: ungültiges Format → klare **400** statt stiller
      Erfolg-ohne-Bild; `_upload_image` in try/except → 400 statt 500-HTML
- [x] `exercises.js` `submitExercise`: robustes JSON-Parsing (kein Hängen bei 413/Nicht-JSON),
      Button wird immer zurückgesetzt, spezielle Meldung bei 413 ("Bild zu groß")
- [x] `settings.html` Avatar-Input `accept="image/*"` (vorher HEIC ausgeschlossen)

### Fix #4: Kalender-Kacheln scheinen unter Wochentag-Leiste durch (Mobile)
- [x] `style.css` Mobile-Breakpoint: `.cal-day-name { position: static }` – auf Mobile scrollt die
      ganze Seite (`.calendar-layout` overflow:auto), `.calendar-card`/`.calendar-grid` sind
      `overflow:visible`. Sticky-Header in einem overflow:visible-Kind eines anderen Scroll-Containers
      erzeugte den Durchscheine-Artefakt. Verifiziert per Screenshot.

### Fix #5: Weißer Block unten auf iOS, Nav nach ganz unten
- [x] `base.html` Viewport-JS: `--app-height` wieder = `window.innerHeight` (statt
      `visualViewport.height`). visualViewport schließt die untere Safe-Area aus → `.app-layout` zu
      kurz → Body-Hintergrund scheint als weißer Block durch. innerHeight enthält im Standalone die
      volle Bildschirmhöhe inkl. Safe-Area → app-layout füllt den Screen, Nav (In-Flow) sitzt ganz
      unten, `padding-bottom: env(safe-area-inset-bottom)` hält die Pill über dem Home-Indikator.
- [x] Verifiziert (Desktop): --app-height=innerHeight, app-layout=volle Höhe, Body nicht scrollbar,
      Nav-Unterkante am unteren Rand. iOS-Safe-Area-Verhalten nur am Gerät final prüfbar.

### Version
- [x] B.0.53 an allen 3 Stellen: `base.html` Splash, `login.html` Splash, `settings.html` Hilfe-Karte

---

## B.0.52 – Änderungen (08.06.2026, 16. Session)

### Fix: Encoding-Bug in allen Templates (Mojibake komplett behoben)
- [x] `base.html` – Alle kaputten UTF-8-Sequenzen korrigiert: `Ãœ→Ü`, `Ã¶→ö`, `Ã¤→ä`, `Ã¼→ü`, `Ã–→Ö`, `ÃŸ→ß`
- [x] `login.html` – Alle Mojibake-Sequenzen korrigiert + Emoji `âš½` durch App-SVG ersetzt + Version B.0.52
- [x] `settings.html` – 20+ Encoding-Fehler in Texten und JS-Strings behoben
- [x] Ursache: Dateien waren irgendwann falsch kodiert gespeichert worden (Latin-1-Bytes als UTF-8 interpretiert)

### Deployment: Render.com → Fly.io migriert
- [x] `Dockerfile` erstellt (python:3.12-slim, gunicorn, Port 8080)
- [x] `fly.toml` erstellt (Region: FRA, 256MB RAM, Volume-Mount `/data`)
- [x] Fly.io App `training-manager` deployt: `https://training-manager.fly.dev`
- [x] Persistentes Volume `training_data` (1GB, Frankfurt) erstellt + gemountet
- [x] Secrets gesetzt: `SECRET_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- [x] `DB_PATH=/data/training.db` via `fly.toml` gesetzt – SQLite überlebt jetzt Restarts
- [x] Auto-Deploy via GitHub-Integration bei jedem `git push`

### Fix: Kalender-Buttons nach Rolle (Spieler/Privat dürfen keine Termine erstellen)
- [x] `calendar.html` – Header-Buttons "Termin" + "Neues Training" in `{% if user_role == 'trainer' %}` gewrapped
- [x] `calendar.html` – `const USER_ROLE = '{{ user_role }}';` als JS-Variable gesetzt (vor calendar.js)
- [x] `calendar.js` – Sidebar: "Termin hinzufügen"-Button nur wenn `USER_ROLE === 'trainer'`; "Training hinzufügen" bleibt für alle Rollen sichtbar
- [x] `calendar.js` – Wochenansicht: `cal-wk-add`-Button (Training) für alle Rollen sichtbar (war irrtümlich eingeschränkt – korrigiert)

### Berechtigungsmatrix Kalender (Endstand)
| Aktion | Trainer | Spieler | Privat |
|--------|---------|---------|--------|
| Termin erstellen | ✓ | ✗ | ✗ |
| Training erstellen | ✓ | ✓ | ✓ |
| Trainings/Events lesen | ✓ | ✓ (eigene Teams) | ✓ |

---

## B.0.51 – Änderungen (08.06.2026, 15. Session)

### Feature: Favoriten-Button in Page-Header (Übungen)
- [x] `exercises.html` – Herz-Button `#fav-toggle-btn` im Page-Header (vor "Via Link"), Icon-only auf Mobile
- [x] `exercises.html` – "Meine Favoriten"-Tab aus Sport-Tab-Leiste entfernt
- [x] `exercises.html` – "Meine Favoriten"-Option aus mobilem Sport-Dropdown entfernt
- [x] `exercises.js` – `toggleFavoritesView()` – Toggle zwischen Favoriten und Alle
- [x] `exercises.js` – `updateFavToggleBtn(sport)` – Herz-Button rot/gefüllt wenn aktiv
- [x] `exercises.js` – `setSport()` + `init()` rufen `updateFavToggleBtn()` auf
- [x] `exercises.js` – `updateSportSelMobile()` zeigt "Alle Sportarten" wenn Favoriten-Modus aktiv
- [x] `style.css` – `.fav-toggle-btn`, `.fav-toggle-btn.fav-toggle-active`, `.fav-toggle-label/.via-link-label { display:none }` auf ≤640px

### Feature: Termine – Team-Auswahl
- [x] `database.py` – Migration: `ALTER TABLE events ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL`
- [x] `app.py` – `GET /api/events`: Spieler-Rolle lädt Trainer-Events gefiltert nach eigenem Team (via `player_team_memberships`)
- [x] `app.py` – `POST /api/events`: akzeptiert `team_id`, validiert Zugehörigkeit zum User
- [x] `app.py` – `PUT /api/events/<id>`: akzeptiert `team_id`, validiert Zugehörigkeit zum User
- [x] `app.py` – Alle Event-Queries mit `LEFT JOIN teams` → gibt `team_name` zurück
- [x] `calendar.js` – `loadTeams()` – lädt Teams via `/api/teams`
- [x] `calendar.js` – `eventFormHTML(dateVal, ev, teams)` – Team-Dropdown (optional, "Kein Team" als Default)
- [x] `calendar.js` – `showCreateEventModal()` + `showEditEventModal()` laden Teams parallel
- [x] `calendar.js` – `submitEvent()` sendet `team_id` mit
- [x] `calendar.js` – Sidebar zeigt `team_name` im Event-Meta

---

## B.0.50 – Änderungen (08.06.2026, 14. Session)

### Feature: Übungs-Favoriten
- [x] `database.py` – Migration: `exercise_favorites` Tabelle (`user_id`, `exercise_id`, UNIQUE)
- [x] `app.py` – `GET /api/exercises` gibt jetzt `is_favorite`-Flag zurück (LEFT JOIN), unterstützt `?favorites=1`-Filter
- [x] `app.py` – `POST /api/exercises/<id>/favorite` → Toggle (fügt hinzu oder entfernt)
- [x] `exercises.html` – "Meine Favoriten"-Tab in der Sport-Tab-Leiste (rot, Herz-Icon)
- [x] `exercises.html` – "Meine Favoriten"-Option im mobilen Sport-Selektor
- [x] `exercises.js` – `toggleFavorite(event, id, btn)` – API-Call, Herz-Button wird rot/gefüllt
- [x] `exercises.js` – `setSport()` und `fetchExercises()` unterstützen `'favorites'` als Sonderfall
- [x] `exercises.js` – `cardHTML()` – Herz-Button auf jeder Übungskarte (oben rechts, stopPropagation)
- [x] `style.css` – `.fav-btn`, `.fav-btn.fav-active`, `.sport-tab-favorites` Styles

### Feature: Kalender-Terminerweiterung (Spiele, Turniere, Sonstiges)
- [x] `database.py` – Migration: `events` Tabelle (`user_id`, `title`, `date`, `time`, `location`, `type`, `notes`)
- [x] `app.py` – `GET /api/events?month=` – Events eines Monats laden
- [x] `app.py` – `POST /api/events` – Termin erstellen
- [x] `app.py` – `PUT /api/events/<id>` – Termin bearbeiten
- [x] `app.py` – `DELETE /api/events/<id>` – Termin löschen
- [x] `app.py` – Dashboard-API: `upcoming`-Einträge enthalten jetzt `events`-Array pro Tag
- [x] `calendar.html` – "Termin"-Button im Header (neben "Neues Training")
- [x] `calendar.js` – `eventsMap` parallel zu `trainingsMap`, `fetchEvents()` lädt Events
- [x] `calendar.js` – Monatsansicht: Event-Chips in Orange/Lila/Grau je nach Typ, `has-event` Punkt-Indikator
- [x] `calendar.js` – Wochenansicht: Events mit farbiger linker Kante
- [x] `calendar.js` – Sidebar: Events mit Badge, Uhrzeit, Ort, Löschen-Button, "Termin hinzufügen"-Button
- [x] `calendar.js` – `showCreateEventModal()`, `showEditEventModal()`, `submitEvent()`, `deleteEventFromModal()`, `deleteEventFromSidebar()`
- [x] `dashboard.html` – 4-Tage-Vorschau zeigt Events als orangefarbene Pill neben Trainings
- [x] `style.css` – Event-Chip, Event-Badge, Kalender-Event-Styles, Dashboard-Event-Pill

---

## B.0.49 – Änderungen (04.06.2026, 13. Session)

### Fix: Formular Sport-Dropdown (Übung erstellen/bearbeiten)
- [x] `exercises.js` – `toggleExSportDropdown()` nutzt jetzt `position: fixed` + `getBoundingClientRect()` → kein Overflow-Clipping durch `modal-box` mehr
- [x] `exercises.js` – Panel spannt die gesamte Modal-Breite auf (`modal.getBoundingClientRect()` als Referenz)
- [x] `style.css` – `.ex-sport-panel`: `position: fixed; z-index: 9999; background: var(--card)` (war `absolute` + `var(--surface)` → transparent)

### Feature: Mobiler Sport-Selektor (≤640px)
- [x] `exercises.html` – Neuer `<div class="sport-sel-mob">` Block mit Trigger-Button + 2-Spalten-Panel (8 Sport-Optionen)
- [x] `exercises.js` – `toggleSportSelMobile()` + `updateSportSelMobile(sport)` – Trigger zeigt aktive Sportfarbe, Panel mit Farbdots
- [x] `exercises.js` – `setSport()` unterstützt `null` als Element (mobile Aufrufe), aktualisiert Desktop-Tabs + Mobile-Selektor synchron
- [x] `style.css` – `.sport-sel-mob*`-Klassen; auf Mobile (≤640px): `.sport-tabs-bar { display: none }`, `.sport-sel-mob { display: block }`

### Fix: Filter-Button Design (Mobile)
- [x] `style.css` – `.mobile-filter-btn`: schlichtes Pill-Element (inline, border-radius: 999px, transparent bg) statt voller weißer Balken

### Fix: Filter-Panel vollständig (Mobile)
- [x] `style.css` – Filter-Panel füllt gesamte verbleibende Höhe (`flex: 1; overflow-y: auto; padding-bottom: 82px`)
- [x] `style.css` – Übungskarten werden versteckt wenn Filter offen: `.filter-sidebar.mobile-open ~ .exercises-main { display: none }`
- [x] `style.css` – `exercises-layout` auf Mobile: `flex: 1; overflow: hidden` damit Flex-Kind `.filter-sidebar` korrekte Höhe erhält

---

## B.0.48 – Änderungen (04.06.2026, 12. Session)

### Feature: Übung teilen via Share-Link
- [x] `database.py` – Migration: `share_token TEXT` Spalte in `exercises` (nullable, UNIQUE Index)
- [x] `app.py` – `POST /api/exercises/<id>/share` → generiert UUID-Token, speichert in DB, gibt `share_url` zurück (Token wird wiederverwendet wenn bereits vorhanden)
- [x] `app.py` – Öffentliche Route `GET /exercise/share/<token>` → rendert `exercise_share.html` (kein Login nötig)
- [x] `app.py` – `POST /api/exercises/import/<token>` → kopiert Übung in eigene Collection (Login nötig)
- [x] `templates/exercise_share.html` – Standalone-Template (kein `extends base.html`): Sport-Farbgradient, Meta-Grid, Badges, "In meine Übungen kopieren"-Button (nur eingeloggt), "Link kopieren"-Fallback, Login-Hinweis für Gäste, "Erstellt mit Training Manager"-Branding
- [x] `exercises.js` – "Teilen"-Button im Detail-Modal (neben Bearbeiten), `shareExercise()`: ruft Share-API auf → Web Share API (`navigator.share()`) wenn verfügbar, Fallback: Link in Zwischenablage
- [x] Button-Feedback: grüner "Kopiert"-Status nach erfolgreichem Import

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

## Nächste Session – Mögliche nächste Features

- **Trainingsvorlagen** – Training als Vorlage markieren und wiederverwenden
- **Saison-/Wochenplanung** – Überblick über geplante Trainingswochen
- **Share-Link widerrufen** – `DELETE /api/exercises/<id>/share` um Token zu löschen

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
