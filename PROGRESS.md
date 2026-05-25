# Training Manager – Fortschritts-Erinnerung

> Zuletzt aktualisiert: 25. Mai 2026
> Status: ✅ Version 1.3 – Responsive + Dashboard + 7 Sportarten

---

## v1.3 – Änderungen (25.05.2026, 3. Session)

- [x] **7 Sportarten** – Basketball, Volleyball, Gym, Allgemein hinzugefügt (Tabs + Farben + Seed-Daten)
- [x] **46 Seed-Übungen** – 28 neue Übungen: Basketball (7), Volleyball (6), Gym (7), Allgemein/Aufwärmen/Dehnen/Abschluss (8)
- [x] **Dashboard** (`/dashboard`) – Personalisierte Startseite mit Tageszeit-Begrüßung, 3 Stats-Karten, 4-Tage-Kalendervorschau, 3 zufällige Übungsvorschläge (aus Allgemein), täglichem Motivationszitat
- [x] **Mobile Navigation** – Bottom-Nav auf ≤640px (4 Tabs: Übersicht, Kalender, Übungen, Trainings)
- [x] **Responsives Design** – Alle Seiten mobile-optimiert: Grid-Layouts stacken, Sport-Tabs scrollen horizontal, Filter-Toggle auf Mobile, Modals als Bottom-Sheet
- [x] **Icon-only Sidebar** auf Tablet (≤900px)
- [x] `TEMPLATES_AUTO_RELOAD = True` gesetzt – Template-Änderungen ohne Server-Neustart
- [x] `import datetime` in app.py + `/api/dashboard` Endpunkt

---

## v1.2 – Änderungen (25.05.2026, 2. Session)

- [x] **PDF-Export** – Druckoptimierte HTML-Seite (`/training/<id>/pdf`) mit Browser-Print
- [x] **Übung direkt zu Training hinzufügen** – "Zu Training hinzufügen"-Button im Übungs-Detail-Modal
- [x] **Drag & Drop Reihenfolge** – Übungen in Training per Drag & Drop sortieren (gespeichert)
- [x] **Konto-Einstellungen** – `/settings`: Profil, Passwort (inkl. Stärkeanzeige), Konto-Info
- [x] **Meine Trainings** – `/my-trainings`: Monatsgruppen, Stats, Suche, Wiederholen-Funktion

---

## v1.1 – Änderungen (25.05.2026, 1. Session)

- [x] Login-Bug behoben
- [x] Emojis komplett durch inline SVG ersetzt
- [x] Sport-Kategorien als Tabs (Fußball / Tennis / Floorball)

---

## Alle erledigten Features (v1.3 vollständig)

### Benutzer-Konto-System
- [x] Registrierung, Login (Benutzername oder E-Mail), Logout
- [x] Sicheres Passwort-Hashing (PBKDF2-HMAC-SHA256 + Salt)
- [x] Flask-Sessions, Weiterleitung wenn nicht eingeloggt
- [x] Passwort ändern, Profilname + E-Mail ändern

### Übungsdatenbank
- [x] Übungen anlegen / bearbeiten / löschen (mit Bildupload)
- [x] Felder: Feldspieler, Torhüter, Kernkompetenz, Schwierigkeit, Spielfeldgröße, Sportart
- [x] Filterung + Volltextsuche mit Debounce
- [x] 7 Sport-Tabs: Alle / Fußball / Tennis / Floorball / Basketball / Volleyball / Gym / Allgemein
- [x] Detail-Modal: Bild + Metadaten + "Zu Training hinzufügen"-Button
- [x] 46 Seed-Übungen

### Dashboard (`/dashboard`)
- [x] Tageszeit-Begrüßung + Wochentag + Datum
- [x] 3 Stats-Karten: Trainings diesen Monat / Trainings gesamt / Übungen verfügbar
- [x] 4-Tage-Kalendervorschau (heute + 3 Tage) mit klickbaren Training-Pills
- [x] 3 zufällige Übungsvorschläge aus "Allgemein" (Aufwärmen/Dehnen/Abschluss)
- [x] Tägliches Motivationszitat (10 Quotes, rotiert per Kalendertag)
- [x] Animierter Count-up für Stats-Zahlen

### Trainingskalender
- [x] Monatlicher Kalender, Navigation, Heute-Hervorhebung
- [x] Tage mit Trainings grün markiert + Titel-Chip
- [x] Training aus Kalender erstellen / öffnen

### Training-Detailseite
- [x] Titel, Datum, Notizen (Auto-Save)
- [x] Übungsliste mit Drag & Drop Reihenfolge (gespeichert)
- [x] Übung hinzufügen (Picker-Modal) / entfernen
- [x] Training bearbeiten / löschen
- [x] PDF-Export → `/training/<id>/pdf`

### Meine Trainings (`/my-trainings`)
- [x] Alle Trainings nach Monat gruppiert
- [x] Stats-Leiste: Gesamt, Diesen Monat, Übungen gesamt
- [x] Echtzeit-Suche nach Trainingstitel
- [x] "Wiederholen" → kopiert Training + Übungen für neues Datum

### Design & UX
- [x] Dark-Sidebar (Desktop/Tablet), Bottom-Nav (Mobile)
- [x] Einheitliches Design-System, kein Emoji – nur inline SVG
- [x] Animierte Modals, Toast-Notifications, Hover-Effekte, Spinner
- [x] Skeleton-Loader auf Dashboard

### Responsives Design (Mobile-first)
- [x] ≤900px: Icon-only Sidebar
- [x] ≤640px: Bottom-Nav, gestackte Layouts, Filter-Toggle, horizontale Sport-Tab-Scroll
- [x] ≤380px: Kompaktere Grid-Spalten

---

## Nächste Schritte – PWA-Roadmap

### Phase 2 – PWA-Setup (NÄCHSTE SESSION)
- [ ] `static/manifest.json` erstellen
- [ ] Meta-Tags in `base.html` (theme-color, apple-mobile-web-app-capable etc.)
- [ ] App-Icons generieren (192×192, 512×512, 180×180 Apple)
- [ ] Service Worker für Offline-Fallback (`static/sw.js`)
- [ ] Route `/static/manifest.json` in Flask servieren (oder als statische Datei)

### Phase 3 – Hosting
- [ ] Backend auf Railway oder Render.com deployen
- [ ] `gunicorn` in requirements.txt hinzufügen
- [ ] `SECRET_KEY` als Umgebungsvariable
- [ ] Datei-Uploads → Cloudinary (persistenter Storage)
- [ ] `.gitignore` für training.db, secret_key.txt, uploads/

### Funktions-Features (parallel möglich)
- [ ] Trainingsvorlagen – Training als Vorlage markieren und wiederverwenden
- [ ] Statistiken-Dashboard – Diagramme mit SVG/Canvas (kein Chart-Framework)
- [ ] Spieler-Verwaltung – Spieler anlegen, Anwesenheitsliste pro Training
- [ ] Touch-Drag & Drop auf Mobilgeräten

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
| GET | `/api/exercises` | Liste mit Filtern (sport, field_players, goalkeepers, core_competency, difficulty, field_size, search) |
| GET | `/api/exercises/<id>` | Einzelne Übung |
| POST | `/api/exercises` | Neue Übung (multipart/form-data + Bild) |
| PUT | `/api/exercises/<id>` | Bearbeiten |
| DELETE | `/api/exercises/<id>` | Löschen |
| GET | `/api/filter-options?sport=` | Dropdown-Optionen |

### Trainings
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/trainings` | Alle eigenen Trainings (opt. ?month=YYYY-MM) |
| POST | `/api/trainings` | Neues Training |
| GET | `/api/trainings/<id>` | Training + zugehörige Übungen |
| PUT | `/api/trainings/<id>` | Bearbeiten |
| DELETE | `/api/trainings/<id>` | Löschen |
| POST | `/api/trainings/<id>/duplicate` | Kopie für neues Datum |
| POST | `/api/trainings/<id>/exercises` | Übung hinzufügen |
| DELETE | `/api/trainings/<id>/exercises/<eid>` | Übung entfernen |
| PUT | `/api/trainings/<id>/exercises/reorder` | Reihenfolge speichern (body: {order: [id,...]}) |

### Dashboard & sonstiges
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/dashboard` | Stats + 4-Tage + Übungsvorschläge |

### Seiten-Routen
| Route | Template | Beschreibung |
|-------|----------|-------------|
| `/` | – | Redirect → Dashboard (eingeloggt) oder Login |
| `/dashboard` | dashboard.html | Startseite mit Stats + Vorschau |
| `/login` | login.html | Login + Registrierung (kein extends base.html!) |
| `/calendar` | calendar.html | Trainingskalender |
| `/exercises` | exercises.html | Übungsdatenbank |
| `/training/<id>` | training.html | Training-Detail |
| `/training/<id>/pdf` | training_print.html | PDF-Druck (kein extends base.html!) |
| `/my-trainings` | my_trainings.html | Trainings-Übersicht |
| `/settings` | settings.html | Konto-Einstellungen |

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
oder `start.bat` doppelklicken → Browser: **http://localhost:5000**
