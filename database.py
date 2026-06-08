import sqlite3
import hashlib
import secrets
import os

DATABASE = os.environ.get('DB_PATH', 'training.db')

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    db_dir = os.path.dirname(DATABASE)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            image_path TEXT,
            field_players INTEGER NOT NULL DEFAULT 0,
            goalkeepers INTEGER NOT NULL DEFAULT 0,
            core_competency TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            field_size TEXT NOT NULL,
            sport TEXT NOT NULL DEFAULT 'Fußball',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trainings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS training_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            training_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            order_index INTEGER DEFAULT 0,
            FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE,
            FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sport TEXT NOT NULL DEFAULT 'Fußball',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            team_id INTEGER,
            name TEXT NOT NULL,
            position TEXT NOT NULL DEFAULT 'Universal',
            number INTEGER,
            notes TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'fit',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS training_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            training_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            present INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
            UNIQUE (training_id, player_id)
        );
    ''')
    conn.commit()

    # Migration: add sport column for existing databases
    try:
        conn.execute("ALTER TABLE exercises ADD COLUMN sport TEXT NOT NULL DEFAULT 'Fußball'")
        conn.commit()
    except Exception:
        pass

    # Migration: add team_id to existing players
    try:
        conn.execute("ALTER TABLE players ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL")
        conn.commit()
    except Exception:
        pass

    # Migration: add avatar_path to users (Profilbild)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN avatar_path TEXT")
        conn.commit()
    except Exception:
        pass

    # Migration: add avatar_path to players (Spieler-Profilbild)
    try:
        conn.execute("ALTER TABLE players ADD COLUMN avatar_path TEXT")
        conn.commit()
    except Exception:
        pass

    # Migration: OAuth columns for social login (Google, Microsoft, ...)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN oauth_provider TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN oauth_id TEXT")
        conn.commit()
    except Exception:
        pass

    # Migration: birthday field on players
    try:
        conn.execute("ALTER TABLE players ADD COLUMN birthday TEXT")
        conn.commit()
    except Exception:
        pass

    # Migration: Many-to-Many player↔team memberships
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS player_team_memberships (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                team_id   INTEGER NOT NULL,
                FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
                FOREIGN KEY (team_id)   REFERENCES teams(id)   ON DELETE CASCADE,
                UNIQUE (player_id, team_id)
            )
        ''')
        conn.commit()
    except Exception:
        pass

    # Seed memberships from existing team_id column (one-time migration)
    try:
        conn.execute('''
            INSERT OR IGNORE INTO player_team_memberships (player_id, team_id)
            SELECT id, team_id FROM players WHERE team_id IS NOT NULL
        ''')
        conn.commit()
    except Exception:
        pass

    # Migration: role field on users (trainer/player/private)
    try:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'trainer'")
        conn.commit()
    except Exception:
        pass

    # Migration: invite_code on players (used to link player accounts)
    try:
        conn.execute("ALTER TABLE players ADD COLUMN invite_code TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_players_invite_code ON players(invite_code)")
        conn.commit()
    except Exception:
        pass

    # Migration: linked_user_id on players (the user account that claimed this player slot)
    try:
        conn.execute("ALTER TABLE players ADD COLUMN linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL")
        conn.commit()
    except Exception:
        pass

    # Migration: share_token on exercises (public share links)
    try:
        conn.execute("ALTER TABLE exercises ADD COLUMN share_token TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_share_token ON exercises(share_token)")
        conn.commit()
    except Exception:
        pass

    # Migration: exercise_favorites (user bookmarks)
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS exercise_favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                exercise_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
                UNIQUE (user_id, exercise_id)
            )
        ''')
        conn.commit()
    except Exception:
        pass

    # Migration: events (Spieltermine, Turniere, etc.)
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT,
                location TEXT,
                type TEXT NOT NULL DEFAULT 'spiel',
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        conn.commit()
    except Exception:
        pass

    # Migration: add team_id to events
    try:
        conn.execute("ALTER TABLE events ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL")
        conn.commit()
    except Exception:
        pass

    # Generate invite codes for all existing players that don't have one yet
    players_without_code = conn.execute('SELECT id FROM players WHERE invite_code IS NULL').fetchall()
    for row in players_without_code:
        while True:
            code = secrets.token_hex(4).upper()
            existing = conn.execute('SELECT id FROM players WHERE invite_code = ?', (code,)).fetchone()
            if not existing:
                break
        conn.execute('UPDATE players SET invite_code = ? WHERE id = ?', (code, row['id']))
    if players_without_code:
        conn.commit()

    # Mark any pre-existing exercises without sport tag
    conn.execute("UPDATE exercises SET sport='Fußball' WHERE sport IS NULL OR sport=''")
    conn.commit()

    _seed_exercises(conn)
    conn.close()


def _seed_exercises(conn):
    fussball = [
        ('Passspiel im Dreieck',
         'Drei Spieler bilden ein Dreieck mit ca. 10 m Abstand. Der Ball wird flach und präzise zugespielt. '
         'Variation: Direktes Spiel (1 Berührung), mit Laufweg nach dem Pass. Fokus auf Passqualität, Annahme und Kommunikation.',
         3, 0, 'Passspiel', 'Anfänger', 'Klein (10x10m)', 'Fußball'),
        ('Rondo 4 gegen 2',
         'Vier Spieler halten den Ball gegen zwei Verteidiger in einem ca. 8×8 m Quadrat. Verliert ein Angreifer den Ball, '
         'wechselt er mit dem Verteidiger. Schult Ballsicherheit, Übersicht und schnelles Kurzpassspiel.',
         6, 0, 'Passspiel', 'Fortgeschritten', 'Klein (10x10m)', 'Fußball'),
        ('Torschussübung aus dem Lauf',
         'Spieler startet aus 20 m, nimmt einen Querpass an und schließt aus der Bewegung ab. 5 Wiederholungen pro Spieler '
         'von links und rechts. Fokus auf Schuss aus dem Lauf und saubere Ballannahme.',
         4, 1, 'Torschuss', 'Fortgeschritten', 'Mittel (20x30m)', 'Fußball'),
        ('Dribbling-Parcours',
         'Hütchen-Parcours über 20 m mit Slalom, Richtungswechseln und Tunneln. Spieler dribbliert mit Tempo durch den Kurs. '
         'Variation: Links/rechts schwacher Fuß. Schult Ballführung, Körpertäuschung und Koordination.',
         1, 0, 'Dribbling', 'Anfänger', 'Klein (10x10m)', 'Fußball'),
        ('Pressing-Übung 3 gegen 3',
         'Zwei Teams spielen 3 gegen 3 auf einem 30×20 m Feld. Das Team ohne Ball presst koordiniert. '
         'Ziel: Ball innerhalb von 6 Sekunden zurückgewinnen. Schult Pressing-Organisation, Laufwege und Zweikampfverhalten.',
         6, 0, 'Pressing', 'Fortgeschritten', 'Mittel (20x30m)', 'Fußball'),
        ('Spielaufbau mit Torhüter',
         'Torhüter baut mit zwei Innenverteidigern und einem Mittelfeldspieler gegen 2 Presser auf. '
         'Ziel: Ball flach aus dem Pressing herausspielen und den freien Spieler finden. Schult Aufbau unter Druck.',
         5, 1, 'Spielaufbau', 'Fortgeschritten', 'Groß (40x30m)', 'Fußball'),
        ('Torwart Reaktionsübung',
         'Trainer schießt aus 7–11 m abwechselnd in verschiedene Ecken. Torhüter reagiert aus Grundstellung. '
         'Serie: 10 Schüsse, kurze Pause, wiederholen. Variation: Ball aus der Hand werfen für tiefere Bälle.',
         0, 1, 'Torwartspiel', 'Anfänger', 'Klein (10x10m)', 'Fußball'),
        ('11 gegen 11 Spielform',
         'Freies Spiel auf Großfeld. Schwerpunkt auf Spielprinzipien (z. B. Pressing nach Ballverlust, schnelles Umschalten). '
         'Trainer stoppt bei Situationen und erklärt. Dauer: 2×15 Minuten mit Pause.',
         10, 2, 'Spielintelligenz', 'Profi', 'Groß (Vollfeld)', 'Fußball'),
    ]

    tennis = [
        ('Vorhand-Grundschlag',
         'Grundübung für den Vorhandschlag. Spieler steht an der Grundlinie, Trainingspartner spielt Bälle zu. '
         'Fokus auf Schulterdrehung, Ausholbewegung und sauberen Treffpunkt. 3 Serien à 20 Schläge. '
         'Variation: mit Zielvorgabe (Ecken anvisieren).',
         1, 0, 'Schlagtechnik', 'Anfänger', 'Klein (10x10m)', 'Tennis'),
        ('Aufschlag-Ritual',
         'Systematisches Aufschlagtraining: Ballwurf, Trophäenposition, Streckbewegung. Zunächst ohne Ball üben, dann mit. '
         '5 Serien à 10 Aufschläge. Ziel: Konstanz ins T-Feld und in die Außenseite. Videoanalyse empfohlen.',
         1, 0, 'Aufschlag', 'Fortgeschritten', 'Mittel (20x30m)', 'Tennis'),
        ('Volley am Netz',
         'Zwei Spieler stehen je eine Seite am Netz. Kontrolliertes Volley-Spiel über kurze Distanz. '
         'Fokus auf weiche Hände, frühe Schlägerbereitstellung und stabiler Stand. '
         'Steigerung: Aus Grundlinie ans Netz sprinten und direkt Volley spielen.',
         2, 0, 'Netzspiel', 'Fortgeschritten', 'Klein (10x10m)', 'Tennis'),
        ('Grundlinien-Rallye cross',
         'Zwei Spieler spielen kontrollierte Grundlinien-Rallye diagonal (cross). Ziel ist Konsistenz über 20 Schläge am Stück. '
         'Fokus auf gute Positionierung, Beinarbeit und frühe Ballannahme. Zählen gemeinsam die Schläge laut mit.',
         2, 0, 'Grundlinienspiel', 'Anfänger', 'Mittel (20x30m)', 'Tennis'),
        ('Return-Training',
         'Trainingspartner oder Ballmaschine spielt schnelle erste Aufschläge. Returnspieler übt kompakten, reaktionsschnellen Return. '
         'Fokus: Schlägerführung verkürzen, Körperschwerpunkt tief, Schritt in den Ball. 3×10 Returns auf jede Seite.',
         2, 0, 'Return', 'Fortgeschritten', 'Mittel (20x30m)', 'Tennis'),
    ]

    floorball = [
        ('Passspiel in der Bewegung',
         'Drei Spieler in einer Linie laufen parallel die Längsseite des Feldes entlang und spielen sich dabei den Ball zu. '
         'Fokus auf harten, flachen Pass, Stick-Kontrolle in Bewegung und Timing. 5 Wiederholungen pro Gruppe.',
         3, 0, 'Passspiel', 'Anfänger', 'Mittel (20x30m)', 'Floorball'),
        ('Torschuss aus dem Kreis',
         'Spieler dribbelt aus verschiedenen Winkeln in den Schusskreis und schließt auf das Tor ab. Torhüter im Kasten. '
         'Fokus auf schnellen Schuss, Gewichtsverlagerung und Zielgenauigkeit. Je 10 Schüsse von links, mitte und rechts.',
         2, 1, 'Torschuss', 'Fortgeschritten', 'Mittel (20x30m)', 'Floorball'),
        ('Stickhandling-Parcours',
         'Hütchenparcours über 15 m mit engen Kurven und Hindernissen. Spieler dribbliert durch den Kurs mit Fokus auf '
         'niedrige Stockführung, Ball nah am Stock halten und kontrollierte Richtungswechsel. Zeitnahme für Motivation.',
         1, 0, 'Stickhandling', 'Anfänger', 'Klein (10x10m)', 'Floorball'),
        ('5 gegen 5 Spielform',
         'Freies Spiel 5 gegen 5 auf Halbfeld mit Toren. Schwerpunkt auf schnelles Umschalten und geordneten Spielaufbau. '
         'Trainer unterbricht bei wichtigen Situationen. Dauer: 2×10 Minuten mit 2 Minuten Pause.',
         10, 2, 'Spielaufbau', 'Fortgeschritten', 'Groß (Vollfeld)', 'Floorball'),
        ('Pressing und Balleroberung',
         'Team A baut auf, Team B presst koordiniert. Ziel: Ball in 8 Sekunden gewinnen. Trainer gibt Signal zum Pressen. '
         'Schult Pressingstruktur, Laufwege beim Pressing und Zweikampfverhalten im System.',
         8, 0, 'Pressing', 'Profi', 'Groß (40x30m)', 'Floorball'),
    ]

    basketball = [
        ('Dribbling mit Richtungswechsel',
         'Spieler dribbeln durch einen Hütchenparcours mit engen Kurven und abrupten Richtungswechseln. '
         'Fokus auf niedrige Ballführung, Blickkontrolle und Körpertäuschung. '
         'Variation: Wechsel zwischen starker und schwacher Hand nach jedem Hütchen. 3 Serien pro Spieler.',
         1, 0, 'Dribbling', 'Anfänger', 'Klein (10x10m)', 'Basketball'),
        ('Korblegger rechts und links',
         'Spieler startet von der Freiwurflinie, dribbelt diagonal zum Korb und legt links oder rechts ab. '
         'Je 15 Wiederholungen pro Seite. Fokus auf die korrekte Schrittfolge (2-Schritt-Rhythmus) und weichen Abschluss '
         'an das Brett. Variation: mit Gegner der leichten Druck gibt.',
         1, 0, 'Korbwurf', 'Anfänger', 'Klein (10x10m)', 'Basketball'),
        ('Freiwurf-Training',
         'Jeder Spieler absolviert 5 Serien à 10 Freiwürfe. Nach jedem Wurf kurze Routine (Dribbling, Ausatmen). '
         'Auswertung: Trefferquote notieren und mit Vorwoche vergleichen. '
         'Fokus auf konstante Wurfbewegung, Standfestigkeit und mentale Routine.',
         1, 0, 'Korbwurf', 'Anfänger', 'Mittel (20x30m)', 'Basketball'),
        ('Pick and Roll',
         'Zwei Spieler üben die Pick-and-Roll-Kombination: Screensetter stellt Block, Ballführer nutzt den Block '
         'und entscheidet situativ – Wurf oder Pass auf den abrollenden Spieler. '
         'Fokus auf Timing des Blocks, Kommunikation und die Entscheidungsfindung des Ballführers.',
         2, 0, 'Taktik', 'Fortgeschritten', 'Mittel (20x30m)', 'Basketball'),
        ('3 gegen 3 Halbfeld',
         'Zwei Teams spielen 3 gegen 3 auf einem Halbfeld. Angriff hat 24 Sekunden für einen Abschluss. '
         'Fokus auf Bewegung ohne Ball, Spacing (Abstände halten) und schnelles Umschalten nach Ballgewinn. '
         'Trainer kommentiert taktische Entscheidungen in Spielpausen.',
         6, 0, 'Spielform', 'Fortgeschritten', 'Mittel (20x30m)', 'Basketball'),
        ('Fastbreak-Training',
         '3 gegen 2 Überzahl-Fastbreak: Drei Angreifer starten nach Ballgewinn gegen zwei Verteidiger. '
         'Fokus auf schnellen Vorwärtstransport, Breite halten und den richtigen Moment für den Abschluss erkennen. '
         'Nach jedem Angriff Rollenwechsel. Ziel: Abschluss innerhalb von 5 Sekunden nach Halbfeld.',
         5, 0, 'Schnellangriff', 'Fortgeschritten', 'Groß (40x30m)', 'Basketball'),
        ('5 gegen 5 Vollfeld',
         'Freies Spiel auf Vollfeld mit regulären Regeln. Trainer setzt taktische Schwerpunkte: z. B. Zonenverteidigung, '
         'Mandeckung oder spezifische Angriffssysteme. Spielzeit 4×8 Minuten. '
         'Auswertung nach dem Spiel: Was hat funktioniert, was nicht?',
         10, 0, 'Spielform', 'Profi', 'Groß (Vollfeld)', 'Basketball'),
    ]

    volleyball = [
        ('Bagger – Unterarm-Annahme',
         'Spieler übt den Unterarm-Pass (Bagger) gegen die Wand oder mit einem Partner. '
         'Fokus auf tiefen Stand, gestreckten Armen und Treffpunkt vor dem Körper. '
         'Variation: Partner wirft Bälle aus verschiedenen Winkeln. 3 Serien à 20 Pässe.',
         2, 0, 'Annahme', 'Anfänger', 'Klein (10x10m)', 'Volleyball'),
        ('Pritschen – Oberes Zuspiel',
         'Zwei Spieler stehen sich gegenüber und spielen sich den Ball per Pritsch zu. Fokus auf Fingerstellung, '
         'stabiles Handgelenk und Kraftdosierung. Variation: Dreieck mit drei Spielern, präzises Zuspiel '
         'zur Antennenlinie. Zählen gemeinsam Fehlerfreie Pässe bis 20.',
         2, 0, 'Zuspiel', 'Anfänger', 'Klein (10x10m)', 'Volleyball'),
        ('Aufschlag-Training',
         'Jeder Spieler führt 5 Serien à 8 Aufschläge durch, abwechselnd Float- und Sprungaufschlag. '
         'Ziel: Aufschlag gezielt in die Zonen 1 und 5 des gegnerischen Feldes spielen. '
         'Fokus auf stabilen Ballabwurf, Anlaufrhythmus und Arm-Schnelligkeit.',
         1, 0, 'Aufschlag', 'Anfänger', 'Mittel (20x30m)', 'Volleyball'),
        ('Block-Training am Netz',
         'Zwei Spieler stehen auf gegenüberliegenden Seiten am Netz. Angreifer schlägt den Ball, '
         'Blocker arbeitet an Sprungzeit und Handstellung. Fokus auf Beinarbeit, Absprung-Timing '
         'und korrektes Übergreifen mit den Händen. 10 Serien pro Spieler.',
         2, 0, 'Block', 'Fortgeschritten', 'Klein (10x10m)', 'Volleyball'),
        ('Angriff – Smash und Aufschlag',
         'Zuspiel vom Zuspieler, Außenangreifer oder Mittelangreifer schlägt an. '
         'Trainer gibt vor: gerade oder diagonale Angriffsrichtung. Fokus auf Anlauf (3-Schritt), '
         'Absprung und Armschlagbewegung. 10 Angriffe von jeder Position.',
         4, 0, 'Angriff', 'Fortgeschritten', 'Mittel (20x30m)', 'Volleyball'),
        ('6 gegen 6 Spielform',
         'Vollständige Spielform auf Regulation-Feld mit allen Regeln (Rotation, Libero, etc.). '
         'Trainer stoppt bei taktischen Fehlern und erklärt. Schwerpunkt auf Serve-Receive-System '
         'und geordneten Angriffskombinationen. Dauer: 3 Sätze bis 15 Punkte.',
         12, 0, 'Spielform', 'Profi', 'Groß (Vollfeld)', 'Volleyball'),
    ]

    gym = [
        ('Kniebeugen – Grundlagen',
         'Basis-Übung für Bein- und Gesäßkraft. Füße schulterbreit, Zehen leicht nach außen. '
         'Hüfte wird bis auf Kniehöhe abgesenkt, Rücken bleibt gerade. '
         '4 Serien à 12 Wiederholungen. Variation: Goblet Squat mit Kurzhantel, Pause-Squat für mehr Intensität.',
         1, 0, 'Kraft', 'Anfänger', 'Klein (10x10m)', 'Gym'),
        ('Ausfallschritte (Lunges)',
         'Wechselnde Ausfallschritte vorwärts über eine 10-m-Strecke. Fokus auf aufrechten Oberkörper '
         'und 90-Grad-Winkel im vorderen Knie. 3 Serien à 20 Schritte (10 pro Bein). '
         'Variation: Rückwärts-Lunge, seitliche Lunge oder mit Kurzhanteln.',
         1, 0, 'Kraft', 'Anfänger', 'Klein (10x10m)', 'Gym'),
        ('Klimmzüge / Latzug',
         'Untergriff- oder Übergriff-Klimmzüge an der Stange. Körper hängt frei, Zug bis Kinn über die Stange. '
         'Für Einsteiger: Gummiband zur Unterstützung nutzen. 4 Serien bis zur Muskelermüdung. '
         'Variation: Enger Griff für mehr Bizep-Aktivierung, weiter Griff für Latissimus.',
         1, 0, 'Kraft', 'Fortgeschritten', 'Klein (10x10m)', 'Gym'),
        ('Plank – Rumpfstabilisierung',
         'Unterarmstütz: Körper bildet eine gerade Linie von Kopf bis Ferse. Bauch- und Gesäßmuskeln anspannen. '
         '4 Serien à 30–60 Sekunden mit 20 Sekunden Pause. Variation: Seitstütz, Plank mit Beinhebenoder '
         'Plank-Touches für mehr Schwierigkeit.',
         1, 0, 'Rumpfkraft', 'Anfänger', 'Klein (10x10m)', 'Gym'),
        ('HIIT-Zirkeltraining',
         '6 Stationen, je 40 Sekunden Arbeit / 20 Sekunden Pause: Burpees, Mountain Climbers, Jump Squats, '
         'Push-ups, High Knees, Russian Twists. 3 Runden mit 90 Sekunden Pause zwischen den Runden. '
         'Intensität anpassen durch Tempovariation.',
         1, 0, 'Ausdauer', 'Fortgeschritten', 'Mittel (20x30m)', 'Gym'),
        ('Box Jumps – Explosivkraft',
         'Beidbeiniger Absprung auf eine stabile Erhöhung (40–60 cm), sofort wieder hinuntersteigen. '
         'Fokus auf explosiven Absprung, weiche Landung auf beiden Füßen und aufrechte Körperhaltung. '
         '4 Serien à 8 Wiederholungen. Variation: einbeinig, Tiefsprung mit anschließendem Hochsprung.',
         1, 0, 'Explosivkraft', 'Fortgeschritten', 'Klein (10x10m)', 'Gym'),
        ('Intervall-Laufen',
         '6–8 Intervalle: 200 m bei 80-90% Maximalgeschwindigkeit, 90 Sekunden Pause dazwischen. '
         'Aufwärmen: 5 Min. lockeres Joggen. Abwärmen: 5 Min. Laufen + Dehnen. '
         'Ziel: Aerobe und anaerobe Kapazität verbessern. Tempo nach jeder Session steigern.',
         1, 0, 'Ausdauer', 'Anfänger', 'Groß (40x30m)', 'Gym'),
    ]

    allgemein = [
        ('Dynamisches Aufwärmen',
         'Allgemeines Aufwärmprogramm für das gesamte Team: 3 Minuten lockeres Einlaufen, dann dynamische '
         'Dehnungen in Bewegung – Ausfallschritte, Kniehebelauf, Anfersen, seitlicher Kreuzschritt. '
         'Danach 5 Minuten Koordinationsübungen (Skipping, Sidestepping). Dauer gesamt: 12–15 Minuten.',
         0, 0, 'Aufwärmen', 'Anfänger', 'Mittel (20x30m)', 'Allgemein'),
        ('Statisches Dehnen – Beine',
         'Dehnung der großen Beinmuskelgruppen nach dem Training: Oberschenkel vorne (Quadrizeps), '
         'hinten (Hamstrings), Waden und Hüftbeuger. Jede Position 30–45 Sekunden halten. '
         'Keine federnden Bewegungen. Ruhige Atmung. Idealerweise auf einer weichen Unterlage durchführen.',
         0, 0, 'Dehnen', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
        ('Statisches Dehnen – Oberkörper',
         'Dehnung von Schultern, Brust, Nacken und seitlicher Rumpfmuskulatur. '
         'Schulterdehnung: Arm über die Brust ziehen, 30 Sek. Brustdehnung: Hände hinter dem Rücken falten, '
         'Brust nach vorne öffnen. Nackenrollen langsam. Je 30 Sekunden pro Position, 2 Durchgänge.',
         0, 0, 'Dehnen', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
        ('Koordinationsleiter',
         'Koordinationsleiter flach auf dem Boden: Einzel- und Doppelschritte, seitliche Schritte, '
         'In-Out-Sprünge. Jede Übung 3 Mal durch die Leiter, dann Wechsel. Tempo steigern. '
         'Schult Fußarbeit, Koordination und schnelle Reaktion – ideal als Aufwärmübung für alle Sportarten.',
         1, 0, 'Koordination', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
        ('Rumpfstabilisierung – Basis',
         'Drei Grundübungen: Plank (3×30 Sek.), Seitstütz (3×20 Sek. pro Seite), Brücke/Glute Bridge '
         '(3×15 Wdh.). Kurze Pausen zwischen den Serien. Schult die tiefe Rumpfmuskulatur, '
         'verbessert Stabilität und beugt Verletzungen vor. Geeignet für alle Sportarten.',
         0, 0, 'Stabilisation', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
        ('Cool-down – Auslaufen',
         'Lockeres Auslaufen für 5–8 Minuten bei 40–50% der Maximalgeschwindigkeit. '
         'Anschließend gemeinsames Gehen im Kreis mit tiefem Atmen. Senkt die Herzfrequenz kontrolliert ab '
         'und leitet die Regenerationsphase ein. Danach direkt in statisches Dehnen übergehen.',
         0, 0, 'Abschluss', 'Anfänger', 'Mittel (20x30m)', 'Allgemein'),
        ('Regenerations-Dehnen',
         'Ausgiebiges Dehnen nach intensivem Training: Piriformis-Dehnung (Taubensitz), Hüftöffner, '
         'Schulter-Querdehnung und Brustwirbelsäulen-Mobilisation. Jede Position 45–60 Sekunden. '
         'Musik und ruhige Atmosphäre fördern die Entspannung. Dauer: 15 Minuten.',
         0, 0, 'Abschluss', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
        ('Sprunggelenk- und Knie-Mobilisation',
         'Aktivierungsübungen vor dem Training: Zehenstand und Absenkung (3×15), Kniekreisen (30 Sek. pro Seite), '
         'einbeiniges Balancieren (30 Sek. pro Seite), Fußgelenk-Rollen. '
         'Schützt vor Verletzungen und bereitet Gelenke auf Belastung vor. Dauer: 5–7 Minuten.',
         0, 0, 'Aufwärmen', 'Anfänger', 'Klein (10x10m)', 'Allgemein'),
    ]

    for sport_name, rows in [('Fußball', fussball), ('Tennis', tennis), ('Floorball', floorball),
                              ('Basketball', basketball), ('Volleyball', volleyball),
                              ('Gym', gym), ('Allgemein', allgemein)]:
        count = conn.execute('SELECT COUNT(*) FROM exercises WHERE sport=?', (sport_name,)).fetchone()[0]
        if count == 0:
            conn.executemany(
                'INSERT INTO exercises (title,description,field_players,goalkeepers,core_competency,difficulty,field_size,sport) '
                'VALUES (?,?,?,?,?,?,?,?)',
                rows
            )
            conn.commit()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split('$', 1)
    if len(parts) != 2:
        return False
    salt, key_hex = parts
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return key.hex() == key_hex
