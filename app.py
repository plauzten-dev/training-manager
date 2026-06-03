from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
import sqlite3
import os
import datetime
import uuid
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from functools import wraps
from authlib.integrations.flask_client import OAuth
from database import get_db, init_db, hash_password, verify_password
import secrets

app = Flask(__name__)

# SECRET_KEY: Env-Var hat Vorrang (Produktion), Fallback auf Datei (lokale Dev)
_secret = os.environ.get('SECRET_KEY')
if _secret:
    app.secret_key = _secret
else:
    SECRET_KEY_FILE = 'secret_key.txt'
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE) as f:
            app.secret_key = f.read().strip()
    else:
        key = secrets.token_hex(32)
        with open(SECRET_KEY_FILE, 'w') as f:
            f.write(key)
        app.secret_key = key

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# HTTPS-Proxy-Fix für Render/gunicorn (damit OAuth-Callbacks mit https:// generiert werden)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Lokale Entwicklung: OAuth erlaubt HTTP (kein SECRET_KEY in env = nicht auf Render)
if not os.environ.get('SECRET_KEY'):
    os.environ.setdefault('AUTHLIB_INSECURE_TRANSPORT', '1')

# OAuth-Manager
_oauth = OAuth(app)
_google_enabled    = bool(os.environ.get('GOOGLE_CLIENT_ID'))
_microsoft_enabled = bool(os.environ.get('MICROSOFT_CLIENT_ID'))

if _google_enabled:
    _oauth.register(
        name='google',
        client_id=os.environ.get('GOOGLE_CLIENT_ID'),
        client_secret=os.environ.get('GOOGLE_CLIENT_SECRET'),
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'},
    )

if _microsoft_enabled:
    _oauth.register(
        name='microsoft',
        client_id=os.environ.get('MICROSOFT_CLIENT_ID'),
        client_secret=os.environ.get('MICROSOFT_CLIENT_SECRET'),
        server_metadata_url='https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'},
    )

# Cloudinary – nur aktiv wenn alle drei Env-Vars gesetzt sind
_cloudinary_enabled = all([
    os.environ.get('CLOUDINARY_CLOUD_NAME'),
    os.environ.get('CLOUDINARY_API_KEY'),
    os.environ.get('CLOUDINARY_API_SECRET'),
])
if _cloudinary_enabled:
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(
        cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
        api_key=os.environ.get('CLOUDINARY_API_KEY'),
        api_secret=os.environ.get('CLOUDINARY_API_SECRET'),
        secure=True,
    )


def _upload_image(file):
    """Lädt Bild hoch – Cloudinary wenn konfiguriert, sonst lokal. Gibt gespeicherten Pfad zurück."""
    if _cloudinary_enabled:
        result = cloudinary.uploader.upload(file, folder='training-manager')
        return result['secure_url']
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    return filename


def _delete_image(image_path):
    """Löscht Bild – Cloudinary-URL oder lokale Datei."""
    if not image_path:
        return
    if image_path.startswith('http'):
        if _cloudinary_enabled:
            # public_id = letztes Segment ohne Extension, inkl. Ordner
            parts = image_path.split('/')
            public_id_with_ext = parts[-1]
            public_id = 'training-manager/' + public_id_with_ext.rsplit('.', 1)[0]
            try:
                cloudinary.uploader.destroy(public_id)
            except Exception:
                pass
    else:
        path = os.path.join(app.config['UPLOAD_FOLDER'], image_path)
        if os.path.exists(path):
            os.remove(path)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Nicht eingeloggt'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated


@app.context_processor
def inject_current_avatar():
    """Stellt Profilbild und Rolle des eingeloggten Users allen Templates bereit."""
    if 'user_id' not in session:
        return {}
    conn = get_db()
    row = conn.execute('SELECT avatar_path, role FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    return {
        'current_avatar': row['avatar_path'] if row else None,
        'user_role': row['role'] if row else 'trainer',
    }


# ── PWA ──────────────────────────────────────────────────────────────────────

@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static', 'sw.js')
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response

# ── Page routes ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard_page'))
    return redirect(url_for('login_page'))


@app.route('/dashboard')
@login_required
def dashboard_page():
    return render_template('dashboard.html', username=session.get('username'))


@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('dashboard_page'))
    oauth_error = request.args.get('oauth_error')
    return render_template('login.html',
                           google_enabled=_google_enabled,
                           microsoft_enabled=_microsoft_enabled,
                           oauth_error=oauth_error)


# ── OAuth-Hilfsfunktion ───────────────────────────────────────────────────────
def _oauth_finish(provider, oauth_id, email, display_name):
    conn = get_db()
    try:
        user = conn.execute(
            'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
            (provider, str(oauth_id))
        ).fetchone()

        if not user and email:
            # E-Mail bereits registriert → OAuth-Konto verknüpfen
            user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
            if user:
                conn.execute(
                    'UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?',
                    (provider, str(oauth_id), user['id'])
                )
                conn.commit()

        if not user:
            # Neues Konto erstellen
            base = (display_name or (email.split('@')[0] if email else 'user'))[:20]
            base = ''.join(c for c in base if c.isalnum() or c == '_') or 'user'
            username = base
            n = 1
            while conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone():
                username = f"{base}{n}"
                n += 1
            conn.execute(
                'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id)'
                ' VALUES (?, ?, ?, ?, ?)',
                (username, email or '', '', provider, str(oauth_id))
            )
            conn.commit()
            user = conn.execute(
                'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
                (provider, str(oauth_id))
            ).fetchone()

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['user_role'] = user['role'] if user['role'] else 'trainer'
        return redirect('/dashboard')
    except Exception:
        return redirect('/login?oauth_error=1')
    finally:
        conn.close()


# ── Google OAuth ─────────────────────────────────────────────────────────────
@app.route('/auth/google')
def auth_google():
    if not _google_enabled:
        return redirect('/login?oauth_error=1')
    redirect_uri = url_for('auth_google_callback', _external=True)
    return _oauth.google.authorize_redirect(redirect_uri)


@app.route('/auth/google/callback')
def auth_google_callback():
    if not _google_enabled:
        return redirect('/login?oauth_error=1')
    try:
        token = _oauth.google.authorize_access_token()
        info  = token.get('userinfo') or {}
        return _oauth_finish('google', info.get('sub', ''), info.get('email', ''), info.get('name', ''))
    except Exception:
        return redirect('/login?oauth_error=1')


# ── Microsoft OAuth ───────────────────────────────────────────────────────────
@app.route('/auth/microsoft')
def auth_microsoft():
    if not _microsoft_enabled:
        return redirect('/login?oauth_error=1')
    redirect_uri = url_for('auth_microsoft_callback', _external=True)
    return _oauth.microsoft.authorize_redirect(redirect_uri)


@app.route('/auth/microsoft/callback')
def auth_microsoft_callback():
    if not _microsoft_enabled:
        return redirect('/login?oauth_error=1')
    try:
        token = _oauth.microsoft.authorize_access_token()
        info  = token.get('userinfo') or {}
        name  = info.get('name') or info.get('preferred_username', '')
        return _oauth_finish('microsoft', info.get('sub', ''), info.get('email', ''), name)
    except Exception:
        return redirect('/login?oauth_error=1')


@app.route('/exercises')
@login_required
def exercises_page():
    return render_template('exercises.html', username=session.get('username'))


@app.route('/calendar')
@login_required
def calendar_page():
    return render_template('calendar.html', username=session.get('username'))


@app.route('/my-trainings')
@login_required
def my_trainings_page():
    return render_template('my_trainings.html', username=session.get('username'))


@app.route('/players')
@login_required
def players_page():
    return render_template('players.html', username=session.get('username'))


@app.route('/settings')
@login_required
def settings_page():
    conn = get_db()
    user = conn.execute('SELECT id, username, email, created_at, avatar_path, oauth_provider FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.close()
    return render_template('settings.html', username=session.get('username'), user=dict(user))


@app.route('/training/<int:training_id>')
@login_required
def training_page(training_id):
    return render_template('training.html', username=session.get('username'), training_id=training_id)


@app.route('/training/<int:training_id>/pdf')
@login_required
def training_pdf_page(training_id):
    conn = get_db()
    training = conn.execute(
        'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])
    ).fetchone()
    if not training:
        conn.close()
        return redirect(url_for('calendar_page'))

    exercises = conn.execute(
        """SELECT e.*, te.order_index FROM exercises e
           JOIN training_exercises te ON e.id = te.exercise_id
           WHERE te.training_id = ? ORDER BY te.order_index""",
        (training_id,)
    ).fetchall()
    conn.close()

    training_dict = dict(training)
    training_dict['exercises'] = [dict(e) for e in exercises]
    return render_template('training_print.html', training=training_dict)


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/offline')
def offline_page():
    return render_template('offline.html')


@app.route('/privacy')
def privacy_page():
    return render_template('privacy.html')


@app.route('/.well-known/assetlinks.json')
def assetlinks():
    """Verknüpft die Domain mit der Android-App (TWA). SHA-Fingerprint nach Play-Store-Upload eintragen."""
    links = [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "com.trainingmanager.app",
                "sha256_cert_fingerprints": [
                    "PLACEHOLDER_SHA256_FINGERPRINT_AFTER_PLAY_STORE_UPLOAD"
                ]
            }
        }
    ]
    from flask import jsonify
    response = jsonify(links)
    response.headers['Content-Type'] = 'application/json'
    return response


# ── Auth API ──────────────────────────────────────────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username    = (data.get('username') or '').strip()
    email       = (data.get('email') or '').strip()
    password    = data.get('password') or ''
    role        = (data.get('role') or 'trainer').strip()
    invite_code = (data.get('invite_code') or '').strip().upper()

    if role not in ('trainer', 'player', 'private'):
        role = 'trainer'

    if not username or not email or not password:
        return jsonify({'error': 'Alle Felder müssen ausgefüllt sein'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Passwort muss mindestens 6 Zeichen lang sein'}), 400
    if role == 'player' and not invite_code:
        return jsonify({'error': 'Als Spieler ist ein Einladecode erforderlich'}), 400

    conn = get_db()
    try:
        # Validate invite code for players
        player_row = None
        if role == 'player':
            player_row = conn.execute(
                'SELECT * FROM players WHERE invite_code = ?', (invite_code,)
            ).fetchone()
            if not player_row:
                conn.close()
                return jsonify({'error': 'Einladecode ungültig oder nicht gefunden'}), 400
            if player_row['linked_user_id']:
                conn.close()
                return jsonify({'error': 'Dieser Einladecode wurde bereits verwendet'}), 400

        conn.execute(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            (username, email, hash_password(password), role)
        )
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()

        if role == 'player' and player_row:
            conn.execute(
                'UPDATE players SET linked_user_id = ? WHERE id = ?',
                (user['id'], player_row['id'])
            )
            conn.commit()

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['user_role'] = role
        return jsonify({'message': 'Registrierung erfolgreich', 'username': username})
    except sqlite3.IntegrityError as e:
        msg = str(e)
        if 'username' in msg:
            return jsonify({'error': 'Benutzername bereits vergeben'}), 400
        if 'email' in msg:
            return jsonify({'error': 'E-Mail bereits registriert'}), 400
        return jsonify({'error': 'Registrierung fehlgeschlagen'}), 400
    finally:
        conn.close()


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    conn = get_db()
    user = conn.execute(
        'SELECT * FROM users WHERE username = ? OR email = ?', (username, username)
    ).fetchone()
    conn.close()

    if not user or not verify_password(password, user['password_hash']):
        return jsonify({'error': 'Ungültige Anmeldedaten'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['user_role'] = user['role'] if user['role'] else 'trainer'
    return jsonify({'message': 'Anmeldung erfolgreich', 'username': user['username']})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Abgemeldet'})


# TODO: VOR RELEASE ENTFERNEN
@app.route('/api/auth/test-login', methods=['POST'])
def test_login():
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE username = ?', ('TEST',)).fetchone()
    if not user:
        conn.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                     ('TEST', 'test@test.de', hash_password('test1234')))
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE username = ?', ('TEST',)).fetchone()
    conn.close()
    session['user_id'] = user['id']
    session['username'] = user['username']
    session['user_role'] = 'trainer'
    return jsonify({'message': 'Testaccount eingeloggt'})


@app.route('/api/auth/change-password', methods=['PUT'])
@login_required
def change_password():
    data = request.get_json()
    current = data.get('current_password') or ''
    new_pw  = data.get('new_password') or ''

    if len(new_pw) < 6:
        return jsonify({'error': 'Neues Passwort muss mindestens 6 Zeichen lang sein'}), 400

    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    if not user['password_hash']:
        conn.close()
        return jsonify({'error': 'Dieses Konto nutzt einen externen Anbieter (Google/Microsoft) – kein Passwort vorhanden'}), 400
    if not verify_password(current, user['password_hash']):
        conn.close()
        return jsonify({'error': 'Aktuelles Passwort ist falsch'}), 400

    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (hash_password(new_pw), session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Passwort erfolgreich geändert'})


@app.route('/api/auth/change-profile', methods=['PUT'])
@login_required
def change_profile():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    email    = (data.get('email') or '').strip()

    if not username or not email:
        return jsonify({'error': 'Benutzername und E-Mail dürfen nicht leer sein'}), 400

    conn = get_db()
    try:
        conn.execute('UPDATE users SET username = ?, email = ? WHERE id = ?',
                     (username, email, session['user_id']))
        conn.commit()
        session['username'] = username
        return jsonify({'message': 'Profil aktualisiert', 'username': username})
    except sqlite3.IntegrityError as e:
        msg = str(e)
        if 'username' in msg:
            return jsonify({'error': 'Benutzername bereits vergeben'}), 400
        if 'email' in msg:
            return jsonify({'error': 'E-Mail bereits registriert'}), 400
        return jsonify({'error': 'Fehler beim Speichern'}), 400
    finally:
        conn.close()


@app.route('/api/auth/me')
def me():
    if 'user_id' not in session:
        return jsonify({'authenticated': False}), 401
    return jsonify({'authenticated': True, 'username': session['username'], 'user_id': session['user_id']})


@app.route('/api/auth/avatar', methods=['POST'])
@login_required
def upload_user_avatar():
    if 'image' not in request.files:
        return jsonify({'error': 'Kein Bild übermittelt'}), 400
    file = request.files['image']
    if not file or not file.filename:
        return jsonify({'error': 'Kein Bild übermittelt'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Ungültiges Dateiformat'}), 400
    conn = get_db()
    old = conn.execute('SELECT avatar_path FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    new_path = _upload_image(file)
    conn.execute('UPDATE users SET avatar_path = ? WHERE id = ?', (new_path, session['user_id']))
    conn.commit()
    conn.close()
    if old and old['avatar_path']:
        _delete_image(old['avatar_path'])
    return jsonify({'avatar_path': new_path})


@app.route('/api/auth/avatar', methods=['DELETE'])
@login_required
def delete_user_avatar():
    conn = get_db()
    old = conn.execute('SELECT avatar_path FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    conn.execute('UPDATE users SET avatar_path = NULL WHERE id = ?', (session['user_id'],))
    conn.commit()
    conn.close()
    if old and old['avatar_path']:
        _delete_image(old['avatar_path'])
    return jsonify({'message': 'Profilbild entfernt'})


# ── Exercises API ─────────────────────────────────────────────────────────────

@app.route('/api/exercises', methods=['GET'])
@login_required
def get_exercises():
    field_players = request.args.get('field_players')
    goalkeepers = request.args.get('goalkeepers')
    core_competency = request.args.get('core_competency')
    difficulty = request.args.get('difficulty')
    field_size = request.args.get('field_size')
    search = request.args.get('search', '')

    query = 'SELECT * FROM exercises WHERE 1=1'
    params = []

    sport       = request.args.get('sport')
    if sport:
        query += ' AND sport = ?'
        params.append(sport)
    if field_players:
        query += ' AND field_players = ?'
        params.append(int(field_players))
    if goalkeepers:
        query += ' AND goalkeepers = ?'
        params.append(int(goalkeepers))
    if core_competency:
        query += ' AND core_competency = ?'
        params.append(core_competency)
    if difficulty:
        query += ' AND difficulty = ?'
        params.append(difficulty)
    if field_size:
        query += ' AND field_size = ?'
        params.append(field_size)
    if search:
        query += ' AND (title LIKE ? OR description LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])

    query += ' ORDER BY created_at DESC'

    conn = get_db()
    exercises = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return jsonify(exercises)


@app.route('/api/exercises/<int:exercise_id>', methods=['GET'])
@login_required
def get_exercise(exercise_id):
    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE id = ?', (exercise_id,)).fetchone()
    conn.close()
    if not exercise:
        return jsonify({'error': 'Übung nicht gefunden'}), 404
    return jsonify(dict(exercise))


@app.route('/api/exercises', methods=['POST'])
@login_required
def create_exercise():
    title = (request.form.get('title') or '').strip()
    description = (request.form.get('description') or '').strip()
    field_players = request.form.get('field_players', 0)
    goalkeepers = request.form.get('goalkeepers', 0)
    core_competency = (request.form.get('core_competency') or '').strip()
    difficulty = (request.form.get('difficulty') or '').strip()
    field_size = (request.form.get('field_size') or '').strip()

    if not all([title, description, core_competency, difficulty, field_size]):
        return jsonify({'error': 'Alle Pflichtfelder ausfüllen'}), 400

    sport = (request.form.get('sport') or 'Fußball').strip()

    image_path = None
    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename and allowed_file(file.filename):
            image_path = _upload_image(file)

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO exercises (title, description, image_path, field_players, goalkeepers, core_competency, difficulty, field_size, sport) VALUES (?,?,?,?,?,?,?,?,?)',
        (title, description, image_path, int(field_players), int(goalkeepers), core_competency, difficulty, field_size, sport)
    )
    conn.commit()
    exercise = dict(conn.execute('SELECT * FROM exercises WHERE id = ?', (cursor.lastrowid,)).fetchone())
    conn.close()
    return jsonify(exercise), 201


@app.route('/api/exercises/<int:exercise_id>', methods=['PUT'])
@login_required
def update_exercise(exercise_id):
    title = (request.form.get('title') or '').strip()
    description = (request.form.get('description') or '').strip()
    field_players = request.form.get('field_players', 0)
    goalkeepers = request.form.get('goalkeepers', 0)
    core_competency = (request.form.get('core_competency') or '').strip()
    difficulty = (request.form.get('difficulty') or '').strip()
    field_size = (request.form.get('field_size') or '').strip()
    sport = (request.form.get('sport') or 'Fußball').strip()

    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE id = ?', (exercise_id,)).fetchone()
    if not exercise:
        conn.close()
        return jsonify({'error': 'Übung nicht gefunden'}), 404

    image_path = exercise['image_path']
    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename and allowed_file(file.filename):
            _delete_image(image_path)
            image_path = _upload_image(file)

    conn.execute(
        'UPDATE exercises SET title=?,description=?,image_path=?,field_players=?,goalkeepers=?,core_competency=?,difficulty=?,field_size=?,sport=? WHERE id=?',
        (title, description, image_path, int(field_players), int(goalkeepers), core_competency, difficulty, field_size, sport, exercise_id)
    )
    conn.commit()
    exercise = dict(conn.execute('SELECT * FROM exercises WHERE id = ?', (exercise_id,)).fetchone())
    conn.close()
    return jsonify(exercise)


@app.route('/api/exercises/<int:exercise_id>', methods=['DELETE'])
@login_required
def delete_exercise(exercise_id):
    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE id = ?', (exercise_id,)).fetchone()
    if not exercise:
        conn.close()
        return jsonify({'error': 'Übung nicht gefunden'}), 404

    _delete_image(exercise['image_path'])

    conn.execute('DELETE FROM exercises WHERE id = ?', (exercise_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Übung gelöscht'})


# ── Trainings API ─────────────────────────────────────────────────────────────

@app.route('/api/trainings', methods=['GET'])
@login_required
def get_trainings():
    month = request.args.get('month')
    conn = get_db()

    if month:
        rows = conn.execute(
            """SELECT t.*, COUNT(te.id) as exercise_count
               FROM trainings t
               LEFT JOIN training_exercises te ON t.id = te.training_id
               WHERE t.user_id = ? AND strftime('%Y-%m', t.date) = ?
               GROUP BY t.id ORDER BY t.date""",
            (session['user_id'], month)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT t.*, COUNT(te.id) as exercise_count
               FROM trainings t
               LEFT JOIN training_exercises te ON t.id = te.training_id
               WHERE t.user_id = ?
               GROUP BY t.id ORDER BY t.date DESC""",
            (session['user_id'],)
        ).fetchall()

    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/trainings', methods=['POST'])
@login_required
def create_training():
    data = request.get_json()
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    notes = data.get('notes') or ''

    if not title or not date:
        return jsonify({'error': 'Titel und Datum erforderlich'}), 400

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO trainings (user_id, title, date, notes) VALUES (?,?,?,?)',
        (session['user_id'], title, date, notes)
    )
    conn.commit()
    training = dict(conn.execute('SELECT * FROM trainings WHERE id = ?', (cursor.lastrowid,)).fetchone())
    conn.close()
    return jsonify(training), 201


@app.route('/api/trainings/<int:training_id>', methods=['GET'])
@login_required
def get_training(training_id):
    conn = get_db()
    training = conn.execute(
        'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])
    ).fetchone()
    if not training:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    exercises = conn.execute(
        """SELECT e.*, te.order_index FROM exercises e
           JOIN training_exercises te ON e.id = te.exercise_id
           WHERE te.training_id = ? ORDER BY te.order_index""",
        (training_id,)
    ).fetchall()
    conn.close()

    result = dict(training)
    result['exercises'] = [dict(e) for e in exercises]
    return jsonify(result)


@app.route('/api/trainings/<int:training_id>', methods=['PUT'])
@login_required
def update_training(training_id):
    data = request.get_json()
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    notes = data.get('notes') or ''

    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    conn.execute('UPDATE trainings SET title=?,date=?,notes=? WHERE id=?', (title, date, notes, training_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Training aktualisiert'})


@app.route('/api/trainings/<int:training_id>', methods=['DELETE'])
@login_required
def delete_training(training_id):
    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    conn.execute('DELETE FROM trainings WHERE id = ?', (training_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Training gelöscht'})


@app.route('/api/trainings/<int:training_id>/duplicate', methods=['POST'])
@login_required
def duplicate_training(training_id):
    data = request.get_json()
    new_date  = (data.get('date') or '').strip()
    new_title = (data.get('title') or '').strip()

    if not new_date:
        return jsonify({'error': 'Datum fehlt'}), 400

    conn = get_db()
    original = conn.execute(
        'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])
    ).fetchone()
    if not original:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    if not new_title:
        new_title = original['title']

    cursor = conn.execute(
        'INSERT INTO trainings (user_id, title, date, notes) VALUES (?,?,?,?)',
        (session['user_id'], new_title, new_date, '')
    )
    new_id = cursor.lastrowid

    exercises = conn.execute(
        'SELECT * FROM training_exercises WHERE training_id = ? ORDER BY order_index',
        (training_id,)
    ).fetchall()
    for ex in exercises:
        conn.execute(
            'INSERT INTO training_exercises (training_id, exercise_id, order_index) VALUES (?,?,?)',
            (new_id, ex['exercise_id'], ex['order_index'])
        )

    conn.commit()
    new_training = dict(conn.execute('SELECT * FROM trainings WHERE id = ?', (new_id,)).fetchone())
    conn.close()
    return jsonify(new_training), 201


@app.route('/api/trainings/<int:training_id>/exercises', methods=['POST'])
@login_required
def add_exercise_to_training(training_id):
    data = request.get_json()
    exercise_id = data.get('exercise_id')

    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    existing = conn.execute(
        'SELECT id FROM training_exercises WHERE training_id = ? AND exercise_id = ?', (training_id, exercise_id)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Übung bereits im Training'}), 400

    max_order = conn.execute(
        'SELECT MAX(order_index) FROM training_exercises WHERE training_id = ?', (training_id,)
    ).fetchone()[0]
    order = (max_order or 0) + 1

    conn.execute('INSERT INTO training_exercises (training_id, exercise_id, order_index) VALUES (?,?,?)',
                 (training_id, exercise_id, order))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Übung hinzugefügt'}), 201


@app.route('/api/trainings/<int:training_id>/exercises/reorder', methods=['PUT'])
@login_required
def reorder_exercises(training_id):
    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    order = request.get_json().get('order', [])
    for idx, exercise_id in enumerate(order):
        conn.execute(
            'UPDATE training_exercises SET order_index = ? WHERE training_id = ? AND exercise_id = ?',
            (idx + 1, training_id, exercise_id)
        )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Reihenfolge gespeichert'})


@app.route('/api/trainings/<int:training_id>/exercises/<int:exercise_id>', methods=['DELETE'])
@login_required
def remove_exercise_from_training(training_id, exercise_id):
    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    conn.execute('DELETE FROM training_exercises WHERE training_id = ? AND exercise_id = ?', (training_id, exercise_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Übung entfernt'})


@app.route('/api/dashboard')
@login_required
def dashboard_api():
    user_id = session['user_id']
    conn    = get_db()
    today   = datetime.date.today()

    training_count_month = conn.execute(
        'SELECT COUNT(*) FROM trainings WHERE user_id=? AND date >= ?',
        (user_id, today.replace(day=1).isoformat())
    ).fetchone()[0]

    total_trainings = conn.execute(
        'SELECT COUNT(*) FROM trainings WHERE user_id=?', (user_id,)
    ).fetchone()[0]

    total_exercises = conn.execute('SELECT COUNT(*) FROM exercises').fetchone()[0]

    upcoming = []
    for i in range(4):
        day = (today + datetime.timedelta(days=i)).isoformat()
        trainings = [dict(r) for r in conn.execute(
            'SELECT id, title FROM trainings WHERE user_id=? AND date=? ORDER BY created_at',
            (user_id, day)
        ).fetchall()]
        upcoming.append({'date': day, 'trainings': trainings})

    suggested = [dict(r) for r in conn.execute(
        "SELECT id, title, core_competency, difficulty, sport FROM exercises "
        "WHERE sport='Allgemein' ORDER BY RANDOM() LIMIT 3"
    ).fetchall()]

    conn.close()
    return jsonify({
        'stats': {
            'trainings_this_month': training_count_month,
            'total_trainings':      total_trainings,
            'total_exercises':      total_exercises,
        },
        'upcoming':  upcoming,
        'suggested': suggested,
    })


@app.route('/api/statistik')
@login_required
def stats_api():
    user_id = session['user_id']
    conn    = get_db()
    today   = datetime.date.today()

    # Trainings der letzten 6 Monate
    monthly = []
    for i in range(5, -1, -1):
        month = today.month - i
        year  = today.year
        while month <= 0:
            month += 12
            year  -= 1
        month_start = datetime.date(year, month, 1)
        next_month  = month + 1 if month < 12 else 1
        next_year   = year if month < 12 else year + 1
        month_end   = datetime.date(next_year, next_month, 1)
        count = conn.execute(
            'SELECT COUNT(*) FROM trainings WHERE user_id=? AND date>=? AND date<?',
            (user_id, month_start.isoformat(), month_end.isoformat())
        ).fetchone()[0]
        MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
        monthly.append({'month': MONTHS_SHORT[month - 1], 'count': count})

    # Top 5 meistgenutzte Übungen
    top_exercises = [dict(r) for r in conn.execute(
        '''SELECT e.title, COUNT(te.exercise_id) AS usage_count
           FROM training_exercises te
           JOIN exercises e ON e.id = te.exercise_id
           JOIN trainings t  ON t.id = te.training_id
           WHERE t.user_id = ?
           GROUP BY te.exercise_id
           ORDER BY usage_count DESC
           LIMIT 5''',
        (user_id,)
    ).fetchall()]

    conn.close()
    return jsonify({'monthly': monthly, 'top_exercises': top_exercises})


# ── Teams API ─────────────────────────────────────────────────────────────────

@app.route('/api/teams', methods=['GET'])
@login_required
def get_teams():
    conn = get_db()
    teams = [dict(r) for r in conn.execute(
        '''SELECT t.*, COUNT(p.id) as player_count
           FROM teams t LEFT JOIN players p ON p.team_id = t.id
           WHERE t.user_id = ? GROUP BY t.id ORDER BY t.created_at''',
        (session['user_id'],)
    ).fetchall()]
    conn.close()
    return jsonify(teams)


@app.route('/api/teams', methods=['POST'])
@login_required
def create_team():
    data  = request.get_json()
    name  = (data.get('name') or '').strip()
    sport = (data.get('sport') or 'Fußball').strip()
    if not name:
        return jsonify({'error': 'Teamname ist erforderlich'}), 400
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO teams (user_id, name, sport) VALUES (?,?,?)',
        (session['user_id'], name, sport)
    )
    conn.commit()
    team = dict(conn.execute('SELECT * FROM teams WHERE id = ?', (cursor.lastrowid,)).fetchone())
    conn.close()
    return jsonify(team), 201


@app.route('/api/teams/<int:team_id>', methods=['PUT'])
@login_required
def update_team(team_id):
    data  = request.get_json()
    name  = (data.get('name') or '').strip()
    sport = (data.get('sport') or 'Fußball').strip()
    if not name:
        return jsonify({'error': 'Teamname ist erforderlich'}), 400
    conn = get_db()
    t = conn.execute('SELECT id FROM teams WHERE id = ? AND user_id = ?', (team_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Team nicht gefunden'}), 404
    conn.execute('UPDATE teams SET name=?, sport=? WHERE id=?', (name, sport, team_id))
    conn.commit()
    team = dict(conn.execute('SELECT * FROM teams WHERE id = ?', (team_id,)).fetchone())
    conn.close()
    return jsonify(team)


@app.route('/api/teams/<int:team_id>', methods=['DELETE'])
@login_required
def delete_team(team_id):
    conn = get_db()
    t = conn.execute('SELECT id FROM teams WHERE id = ? AND user_id = ?', (team_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Team nicht gefunden'}), 404
    conn.execute('DELETE FROM teams WHERE id = ?', (team_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Team gelöscht'})


# ── Players API ───────────────────────────────────────────────────────────────

@app.route('/api/players', methods=['GET'])
@login_required
def get_players():
    team_id = request.args.get('team_id')
    conn    = get_db()
    if team_id:
        rows = conn.execute(
            '''SELECT p.*, t.name as team_name, t.sport as team_sport
               FROM players p
               JOIN player_team_memberships ptm ON ptm.player_id = p.id AND ptm.team_id = ?
               LEFT JOIN teams t ON t.id = p.team_id
               WHERE p.user_id = ?
               ORDER BY p.name''',
            [int(team_id), session['user_id']]
        ).fetchall()
    else:
        rows = conn.execute(
            '''SELECT p.*, t.name as team_name, t.sport as team_sport
               FROM players p LEFT JOIN teams t ON t.id = p.team_id
               WHERE p.user_id = ? ORDER BY p.name''',
            [session['user_id']]
        ).fetchall()
    players = [dict(r) for r in rows]
    # Attach all team memberships per player
    for p in players:
        mbs = conn.execute(
            'SELECT team_id FROM player_team_memberships WHERE player_id = ?', [p['id']]
        ).fetchall()
        p['team_ids'] = [m['team_id'] for m in mbs]
    conn.close()
    return jsonify(players)


@app.route('/api/players', methods=['POST'])
@login_required
def create_player():
    data     = request.get_json()
    name     = (data.get('name') or '').strip()
    position = (data.get('position') or 'Universal').strip()
    number   = data.get('number')
    notes    = (data.get('notes') or '').strip()
    status   = (data.get('status') or 'fit').strip()
    birthday = (data.get('birthday') or '').strip() or None
    team_ids = data.get('team_ids') or []
    # Backward-compat: single team_id still accepted
    legacy   = data.get('team_id')
    if legacy and legacy not in team_ids:
        team_ids = [legacy] + [t for t in team_ids if t != legacy]
    primary  = team_ids[0] if team_ids else None

    if not name:
        return jsonify({'error': 'Name ist erforderlich'}), 400

    conn = get_db()
    # Generate unique invite code
    while True:
        invite_code = secrets.token_hex(4).upper()
        if not conn.execute('SELECT id FROM players WHERE invite_code = ?', (invite_code,)).fetchone():
            break

    cursor = conn.execute(
        'INSERT INTO players (user_id, team_id, name, position, number, notes, status, birthday, invite_code) VALUES (?,?,?,?,?,?,?,?,?)',
        (session['user_id'], primary, name, position,
         number if number else None, notes, status, birthday, invite_code)
    )
    player_id = cursor.lastrowid
    for tid in team_ids:
        try:
            conn.execute('INSERT OR IGNORE INTO player_team_memberships (player_id, team_id) VALUES (?,?)',
                         (player_id, int(tid)))
        except Exception:
            pass
    conn.commit()
    player = dict(conn.execute('SELECT * FROM players WHERE id = ?', (player_id,)).fetchone())
    conn.close()
    return jsonify(player), 201


@app.route('/api/players/<int:player_id>', methods=['GET'])
@login_required
def get_player(player_id):
    conn = get_db()
    player = conn.execute(
        'SELECT * FROM players WHERE id = ? AND user_id = ?', (player_id, session['user_id'])
    ).fetchone()
    conn.close()
    if not player:
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    return jsonify(dict(player))


@app.route('/api/players/<int:player_id>', methods=['PUT'])
@login_required
def update_player(player_id):
    data     = request.get_json()
    name     = (data.get('name') or '').strip()
    position = (data.get('position') or 'Universal').strip()
    number   = data.get('number')
    notes    = (data.get('notes') or '').strip()
    status   = (data.get('status') or 'fit').strip()
    birthday = (data.get('birthday') or '').strip() or None
    team_ids = data.get('team_ids')  # None = don't touch memberships

    if not name:
        return jsonify({'error': 'Name ist erforderlich'}), 400

    conn = get_db()
    row  = conn.execute('SELECT id, team_id FROM players WHERE id = ? AND user_id = ?',
                        (player_id, session['user_id'])).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404

    primary = row['team_id']
    if team_ids is not None:
        primary = team_ids[0] if team_ids else None
        conn.execute('DELETE FROM player_team_memberships WHERE player_id = ?', (player_id,))
        for tid in team_ids:
            try:
                conn.execute('INSERT OR IGNORE INTO player_team_memberships (player_id, team_id) VALUES (?,?)',
                             (player_id, int(tid)))
            except Exception:
                pass

    conn.execute(
        'UPDATE players SET name=?, position=?, number=?, notes=?, status=?, team_id=?, birthday=? WHERE id=?',
        (name, position, number if number else None, notes, status, primary, birthday, player_id)
    )
    conn.commit()
    player = dict(conn.execute('SELECT * FROM players WHERE id = ?', (player_id,)).fetchone())
    conn.close()
    return jsonify(player)


@app.route('/api/players/<int:player_id>/status', methods=['PUT'])
@login_required
def update_player_status(player_id):
    data   = request.get_json()
    status = (data.get('status') or 'fit').strip()
    if status not in ('fit', 'krank', 'verletzt'):
        return jsonify({'error': 'Ungültiger Status'}), 400
    conn = get_db()
    p = conn.execute('SELECT id FROM players WHERE id = ? AND user_id = ?', (player_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    conn.execute('UPDATE players SET status=? WHERE id=?', (status, player_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Status aktualisiert'})


@app.route('/api/players/<int:player_id>/regenerate-invite', methods=['POST'])
@login_required
def regenerate_invite_code(player_id):
    conn = get_db()
    p = conn.execute('SELECT id FROM players WHERE id = ? AND user_id = ?', (player_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    while True:
        code = secrets.token_hex(4).upper()
        if not conn.execute('SELECT id FROM players WHERE invite_code = ?', (code,)).fetchone():
            break
    conn.execute('UPDATE players SET invite_code = ?, linked_user_id = NULL WHERE id = ?', (code, player_id))
    conn.commit()
    conn.close()
    return jsonify({'invite_code': code})


@app.route('/api/players/<int:player_id>', methods=['DELETE'])
@login_required
def delete_player(player_id):
    conn = get_db()
    p = conn.execute('SELECT id, avatar_path FROM players WHERE id = ? AND user_id = ?', (player_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    avatar = p['avatar_path']
    conn.execute('DELETE FROM players WHERE id = ?', (player_id,))
    conn.commit()
    conn.close()
    if avatar:
        _delete_image(avatar)
    return jsonify({'message': 'Spieler gelöscht'})


@app.route('/api/players/<int:player_id>/teams/<int:team_id>', methods=['DELETE'])
@login_required
def remove_player_from_team(player_id, team_id):
    """Spieler aus einem Team entfernen (ohne ihn zu löschen)."""
    conn = get_db()
    row  = conn.execute('SELECT id, team_id FROM players WHERE id = ? AND user_id = ?',
                        (player_id, session['user_id'])).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    conn.execute('DELETE FROM player_team_memberships WHERE player_id = ? AND team_id = ?',
                 (player_id, team_id))
    # If this was the primary team, promote next membership to primary
    if row['team_id'] == team_id:
        nxt = conn.execute(
            'SELECT team_id FROM player_team_memberships WHERE player_id = ? LIMIT 1', (player_id,)
        ).fetchone()
        conn.execute('UPDATE players SET team_id = ? WHERE id = ?',
                     (nxt['team_id'] if nxt else None, player_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Spieler aus Team entfernt'})


@app.route('/api/players/<int:player_id>/avatar', methods=['POST'])
@login_required
def upload_player_avatar(player_id):
    conn = get_db()
    p = conn.execute('SELECT id, avatar_path FROM players WHERE id = ? AND user_id = ?',
                     (player_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    if 'image' not in request.files:
        conn.close()
        return jsonify({'error': 'Kein Bild übermittelt'}), 400
    file = request.files['image']
    if not file or not file.filename or not allowed_file(file.filename):
        conn.close()
        return jsonify({'error': 'Ungültiges Dateiformat'}), 400
    old = p['avatar_path']
    new_path = _upload_image(file)
    conn.execute('UPDATE players SET avatar_path = ? WHERE id = ?', (new_path, player_id))
    conn.commit()
    conn.close()
    if old:
        _delete_image(old)
    return jsonify({'avatar_path': new_path})


@app.route('/api/players/<int:player_id>/avatar', methods=['DELETE'])
@login_required
def delete_player_avatar(player_id):
    conn = get_db()
    p = conn.execute('SELECT avatar_path FROM players WHERE id = ? AND user_id = ?',
                     (player_id, session['user_id'])).fetchone()
    if not p:
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404
    old = p['avatar_path']
    conn.execute('UPDATE players SET avatar_path = NULL WHERE id = ?', (player_id,))
    conn.commit()
    conn.close()
    if old:
        _delete_image(old)
    return jsonify({'message': 'Profilbild entfernt'})


# ── Attendance API ────────────────────────────────────────────────────────────

@app.route('/api/trainings/<int:training_id>/attendance', methods=['GET'])
@login_required
def get_attendance(training_id):
    team_id = request.args.get('team_id')
    conn    = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    if team_id:
        query = '''SELECT p.id, p.name, p.position, p.number, p.status, p.team_id, ta.present
                   FROM players p
                   JOIN player_team_memberships ptm ON ptm.player_id = p.id AND ptm.team_id = ?
                   LEFT JOIN training_attendance ta ON ta.player_id = p.id AND ta.training_id = ?
                   WHERE p.user_id = ?
                   ORDER BY p.name'''
        params = [int(team_id), training_id, session['user_id']]
    else:
        query = '''SELECT p.id, p.name, p.position, p.number, p.status, p.team_id, ta.present
                   FROM players p
                   LEFT JOIN training_attendance ta ON ta.player_id = p.id AND ta.training_id = ?
                   WHERE p.user_id = ?
                   ORDER BY p.name'''
        params = [training_id, session['user_id']]

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/trainings/<int:training_id>/attendance', methods=['PUT'])
@login_required
def set_attendance(training_id):
    data      = request.get_json()
    player_id = data.get('player_id')
    present   = data.get('present')

    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    if present is None:
        conn.execute('DELETE FROM training_attendance WHERE training_id = ? AND player_id = ?', (training_id, player_id))
    else:
        conn.execute(
            'INSERT OR REPLACE INTO training_attendance (training_id, player_id, present) VALUES (?,?,?)',
            (training_id, player_id, 1 if present else 0)
        )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Anwesenheit gespeichert'})


@app.route('/api/trainings/<int:training_id>/attendance/all', methods=['PUT'])
@login_required
def set_all_attendance(training_id):
    data    = request.get_json()
    team_id = data.get('team_id')
    present = 1 if data.get('present', True) else 0

    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    if team_id:
        players = conn.execute(
            '''SELECT p.id FROM players p
               JOIN player_team_memberships ptm ON ptm.player_id = p.id AND ptm.team_id = ?
               WHERE p.user_id = ?''',
            (int(team_id), session['user_id'])
        ).fetchall()
    else:
        players = conn.execute('SELECT id FROM players WHERE user_id = ?', (session['user_id'],)).fetchall()

    for p in players:
        conn.execute(
            'INSERT OR REPLACE INTO training_attendance (training_id, player_id, present) VALUES (?,?,?)',
            (training_id, p['id'], present)
        )
    conn.commit()
    conn.close()
    return jsonify({'message': f'{len(players)} Spieler markiert', 'count': len(players)})


@app.route('/api/teams/<int:team_id>/attendance-summary', methods=['GET'])
@login_required
def team_attendance_summary(team_id):
    conn = get_db()
    team = conn.execute('SELECT id, name FROM teams WHERE id = ? AND user_id = ?',
                        (team_id, session['user_id'])).fetchone()
    if not team:
        conn.close()
        return jsonify({'error': 'Team nicht gefunden'}), 404

    rows = conn.execute('''
        SELECT
          p.id, p.name, p.position, p.status,
          COUNT(ta.id)                                                AS marked_count,
          COALESCE(SUM(CASE WHEN ta.present = 1 THEN 1 ELSE 0 END), 0) AS present_count,
          COALESCE(SUM(CASE WHEN ta.present = 0 THEN 1 ELSE 0 END), 0) AS absent_count
        FROM players p
        LEFT JOIN training_attendance ta ON ta.player_id = p.id
        LEFT JOIN trainings tr ON tr.id = ta.training_id AND tr.user_id = ?
        WHERE p.user_id = ? AND p.team_id = ?
        GROUP BY p.id, p.name, p.position, p.status
        ORDER BY present_count DESC, p.name
    ''', (session['user_id'], session['user_id'], team_id)).fetchall()

    total_tracked = conn.execute('''
        SELECT COUNT(DISTINCT ta.training_id)
        FROM training_attendance ta
        JOIN players p ON p.id = ta.player_id
        JOIN trainings tr ON tr.id = ta.training_id AND tr.user_id = ?
        WHERE p.team_id = ?
    ''', (session['user_id'], team_id)).fetchone()[0]

    conn.close()
    return jsonify({
        'team_name':     team['name'],
        'total_tracked': total_tracked,
        'players':       [dict(r) for r in rows]
    })


@app.route('/api/filter-options')
@login_required
def filter_options():
    sport = request.args.get('sport', '')
    conn = get_db()
    if sport:
        competencies = [r[0] for r in conn.execute(
            'SELECT DISTINCT core_competency FROM exercises WHERE sport=? ORDER BY core_competency', (sport,)
        ).fetchall()]
        field_sizes = [r[0] for r in conn.execute(
            'SELECT DISTINCT field_size FROM exercises WHERE sport=? ORDER BY field_size', (sport,)
        ).fetchall()]
    else:
        competencies = [r[0] for r in conn.execute('SELECT DISTINCT core_competency FROM exercises ORDER BY core_competency').fetchall()]
        field_sizes = [r[0] for r in conn.execute('SELECT DISTINCT field_size FROM exercises ORDER BY field_size').fetchall()]
    difficulties = [r[0] for r in conn.execute('SELECT DISTINCT difficulty FROM exercises ORDER BY difficulty').fetchall()]
    sports = [r[0] for r in conn.execute('SELECT DISTINCT sport FROM exercises ORDER BY sport').fetchall()]
    conn.close()
    return jsonify({'competencies': competencies, 'difficulties': difficulties, 'field_sizes': field_sizes, 'sports': sports})


init_db()

if __name__ == '__main__':
    app.jinja_env.auto_reload = True
    app.config['TEMPLATES_AUTO_RELOAD'] = True
    print('\n' + '='*40)
    print('  Training Manager gestartet!')
    print('  Oeffne: http://localhost:5000')
    print('  Beenden: Ctrl+C')
    print('='*40 + '\n')
    app.run(debug=False, port=5000, host='0.0.0.0')
