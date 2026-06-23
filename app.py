from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
import sqlite3
import os
import datetime
import uuid
import smtplib
from email.message import EmailMessage
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
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Session-Cookie härten. HttpOnly ist Flask-Default. SameSite=Lax blockt das
# Cookie bei Cross-Site-POSTs (CSRF-Schutz). Secure nur in Produktion (HTTPS),
# damit lokale Dev-Logins über http://localhost weiter funktionieren.
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=bool(os.environ.get('SECRET_KEY')),
)

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


# ── E-Mail / SMTP (Verifikation) ───────────────────────────────────────────────
SMTP_HOST     = os.environ.get('SMTP_HOST')
SMTP_PORT     = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER     = os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
SMTP_FROM     = os.environ.get('SMTP_FROM') or SMTP_USER
_smtp_enabled = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)

VERIFICATION_TTL_HOURS = 24


def _new_verification_token():
    """Erzeugt (token, expires_iso) für die E-Mail-Bestätigung."""
    token = secrets.token_urlsafe(32)
    expires = (datetime.datetime.utcnow() + datetime.timedelta(hours=VERIFICATION_TTL_HOURS)).isoformat()
    return token, expires


def _send_verification_email(to_email, username, token):
    """Sendet die Bestätigungs-Mail per SMTP. Ohne SMTP-Config wird der Link nur
    in die Konsole geloggt (Dev-Fallback). Gibt True bei Erfolg zurück."""
    link = f"{request.host_url.rstrip('/')}/verify-email/{token}"
    text = (
        f"Hallo {username},\n\n"
        f"bitte bestätige deine E-Mail-Adresse für TrainDesk, indem du auf den folgenden Link klickst:\n\n"
        f"{link}\n\n"
        f"Der Link ist {VERIFICATION_TTL_HOURS} Stunden gültig.\n\n"
        f"Falls du dich nicht bei TrainDesk registriert hast, kannst du diese E-Mail einfach ignorieren.\n\n"
        f"Dein TrainDesk-Team"
    )
    if not _smtp_enabled:
        print(f"\n[E-Mail-Verifikation – kein SMTP konfiguriert]\n  An:   {to_email}\n  Link: {link}\n")
        return True
    try:
        msg = EmailMessage()
        msg['Subject'] = 'TrainDesk – Bestätige deine E-Mail-Adresse'
        msg['From'] = SMTP_FROM
        msg['To'] = to_email
        msg.set_content(text)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[SMTP-Fehler] Verifikations-Mail an {to_email} fehlgeschlagen: {e}")
        return False


def _upload_image(file):
    """Lädt Bild hoch – Cloudinary wenn konfiguriert, sonst lokal. Gibt gespeicherten Pfad zurück."""
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in (file.filename or '') else ''
    if _cloudinary_enabled:
        opts = {'folder': 'training-manager'}
        # HEIC/HEIF (iPhone-Standardformat) → in web-darstellbares JPG konvertieren
        if ext in ('heic', 'heif'):
            opts['format'] = 'jpg'
        result = cloudinary.uploader.upload(file, **opts)
        return result['secure_url']
    filename = f"{uuid.uuid4().hex}.{ext or 'jpg'}"
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


def _get_user_role(user_id):
    """Liest die Rolle des Users direkt aus der DB (zuverlässiger als Session)."""
    conn = get_db()
    row = conn.execute('SELECT role FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return row['role'] if row else 'trainer'


def _get_player_trainer_id(user_id):
    """Gibt die user_id des Trainers zurück, der den verknüpften Spieler besitzt. Oder None."""
    conn = get_db()
    player = conn.execute(
        'SELECT user_id FROM players WHERE linked_user_id = ?', (user_id,)
    ).fetchone()
    conn.close()
    return player['user_id'] if player else None


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
def _claim_truthy(val):
    """OIDC-Claims können bool oder String ('true'/'1') sein – robust auswerten."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ('true', '1', 'yes')
    return bool(val)


def _oauth_finish(provider, oauth_id, email, display_name, email_verified=False):
    conn = get_db()
    try:
        user = conn.execute(
            'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
            (provider, str(oauth_id))
        ).fetchone()

        # E-Mail nur für Matching/Verknüpfung verwenden, wenn der Provider sie
        # als verifiziert meldet. Sonst droht Account-Übernahme durch eine
        # untergeschobene fremde (unverifizierte) E-Mail.
        if not email_verified:
            email = ''

        if not user and email:
            # E-Mail bereits registriert → OAuth-Konto verknüpfen
            user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
            if user:
                conn.execute(
                    'UPDATE users SET oauth_provider = ?, oauth_id = ?, email_verified = 1 WHERE id = ?',
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
                'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id, email_verified)'
                ' VALUES (?, ?, ?, ?, ?, 1)',
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
        return _oauth_finish('google', info.get('sub', ''), info.get('email', ''),
                             info.get('name', ''), _claim_truthy(info.get('email_verified')))
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
        # Microsoft signalisiert verifizierte E-Mail über 'xms_edov' (manchmal 'email_verified').
        verified = _claim_truthy(info.get('xms_edov', info.get('email_verified')))
        return _oauth_finish('microsoft', info.get('sub', ''), info.get('email', ''), name, verified)
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
    uid = session['user_id']
    training = conn.execute(
        'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, uid)
    ).fetchone()
    if not training:
        user_row = conn.execute('SELECT role FROM users WHERE id = ?', (uid,)).fetchone()
        if user_row and user_row['role'] == 'player':
            p = conn.execute('SELECT user_id FROM players WHERE linked_user_id = ?', (uid,)).fetchone()
            if p:
                training = conn.execute(
                    'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, p['user_id'])
                ).fetchone()
    if not training:
        conn.close()
        return redirect(url_for('calendar_page'))

    exercises = conn.execute(
        """SELECT e.*, te.order_index, te.block, te.duration FROM exercises e
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
                "package_name": "com.plauzten.traindesk",
                "sha256_cert_fingerprints": [
                    "04:B3:9F:86:84:5E:3A:9F:42:60:DF:E9:A2:FE:B8:CC:23:B0:53:E9:2F:A0:73:13:DC:D2:89:4B:BB:DF:17:6A"
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
    accept_privacy = bool(data.get('accept_privacy'))

    if role not in ('trainer', 'player', 'private'):
        role = 'trainer'

    if not username or not email or not password:
        return jsonify({'error': 'Alle Felder müssen ausgefüllt sein'}), 400
    if not accept_privacy:
        return jsonify({'error': 'Bitte akzeptiere die Datenschutzerklärung'}), 400
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
            # Atomic update: only succeeds if nobody else claimed the code in the meantime
            cursor = conn.execute(
                'UPDATE players SET linked_user_id = ? WHERE id = ? AND linked_user_id IS NULL',
                (user['id'], player_row['id'])
            )
            conn.commit()
            if cursor.rowcount == 0:
                # Race condition: code was claimed between our check and this update
                conn.execute('DELETE FROM users WHERE id = ?', (user['id'],))
                conn.commit()
                return jsonify({'error': 'Dieser Einladecode wurde bereits verwendet'}), 400

        if _smtp_enabled:
            # Harte Verifikation: kein Login bis die E-Mail bestätigt ist.
            token, expires = _new_verification_token()
            conn.execute('UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?',
                         (token, expires, user['id']))
            conn.commit()
            _send_verification_email(email, username, token)
            return jsonify({
                'message': 'Fast geschafft! Wir haben dir einen Bestätigungslink per E-Mail geschickt.',
                'verification_required': True,
                'email': email,
            })

        # Kein SMTP konfiguriert → E-Mail-Verifikation vorerst ausgesetzt:
        # Konto direkt verifizieren und einloggen (greift automatisch wieder,
        # sobald SMTP_* als Fly.io-Secrets gesetzt sind → _smtp_enabled True).
        conn.execute('UPDATE users SET email_verified = 1 WHERE id = ?', (user['id'],))
        conn.commit()
        session['user_id']   = user['id']
        session['username']  = user['username']
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

    # Verifikation nur erzwingen, wenn SMTP konfiguriert ist (sonst kämen keine
    # Bestätigungs-Mails an). Ohne SMTP wird die Verifikation vorerst ausgesetzt.
    if _smtp_enabled and not user['email_verified']:
        return jsonify({
            'error': 'Bitte bestätige zuerst deine E-Mail-Adresse. Schau in dein Postfach.',
            'verification_required': True,
            'email': user['email'],
        }), 403

    session['user_id'] = user['id']
    session['username'] = user['username']
    session['user_role'] = user['role'] if user['role'] else 'trainer'
    return jsonify({'message': 'Anmeldung erfolgreich', 'username': user['username']})


@app.route('/verify-email/<token>')
def verify_email(token):
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE verification_token = ?', (token,)).fetchone()
    if not user:
        conn.close()
        return redirect('/login?verify_error=invalid')
    try:
        expired = datetime.datetime.fromisoformat(user['verification_expires']) < datetime.datetime.utcnow()
    except Exception:
        expired = False
    if expired:
        conn.close()
        return redirect('/login?verify_error=expired')
    conn.execute(
        'UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?',
        (user['id'],)
    )
    conn.commit()
    conn.close()
    return redirect('/login?verified=1')


@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_verification():
    data = request.get_json() or {}
    identifier = (data.get('email') or data.get('username') or '').strip()
    # Generische Antwort gegen Konto-Enumeration
    generic = {'message': 'Falls ein unbestätigtes Konto existiert, haben wir eine E-Mail gesendet.'}
    if not identifier:
        return jsonify(generic)
    conn = get_db()
    user = conn.execute(
        'SELECT * FROM users WHERE username = ? OR email = ?', (identifier, identifier)
    ).fetchone()
    if user and not user['email_verified'] and user['email']:
        token, expires = _new_verification_token()
        conn.execute('UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?',
                     (token, expires, user['id']))
        conn.commit()
        _send_verification_email(user['email'], user['username'], token)
    conn.close()
    return jsonify(generic)


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Abgemeldet'})


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


@app.route('/api/auth/weekly-goal', methods=['PUT'])
@login_required
def change_weekly_goal():
    data = request.get_json() or {}
    try:
        goal = int(data.get('weekly_goal'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Ungültiges Wochenziel'}), 400
    goal = max(1, min(14, goal))
    conn = get_db()
    conn.execute('UPDATE users SET weekly_goal = ? WHERE id = ?', (goal, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Wochenziel aktualisiert', 'weekly_goal': goal})


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


@app.route('/api/auth/account', methods=['DELETE'])
@login_required
def delete_account():
    data = request.get_json() or {}
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()

    if user['password_hash']:
        password = data.get('password') or ''
        if not verify_password(password, user['password_hash']):
            conn.close()
            return jsonify({'error': 'Passwort ist falsch'}), 400
    else:
        username = (data.get('username') or '').strip()
        if username != user['username']:
            conn.close()
            return jsonify({'error': 'Benutzername stimmt nicht überein'}), 400

    avatar_paths = []
    if user['avatar_path']:
        avatar_paths.append(user['avatar_path'])
    for p in conn.execute('SELECT avatar_path FROM players WHERE user_id = ? AND avatar_path IS NOT NULL', (session['user_id'],)).fetchall():
        avatar_paths.append(p['avatar_path'])

    conn.execute('DELETE FROM users WHERE id = ?', (session['user_id'],))
    conn.commit()
    conn.close()

    for path in avatar_paths:
        _delete_image(path)

    session.clear()
    return jsonify({'message': 'Konto gelöscht'})


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
    favorites_only = request.args.get('favorites') == '1'
    uid = session['user_id']

    query = '''SELECT e.*,
               CASE WHEN e.owner_user_id = ? THEN 1 ELSE 0 END AS is_owner,
               CASE WHEN ef.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
               FROM exercises e
               LEFT JOIN exercise_favorites ef ON ef.exercise_id = e.id AND ef.user_id = ?
               WHERE 1=1'''
    params = [uid, uid]

    if favorites_only:
        query += ' AND ef.user_id IS NOT NULL'

    sport = request.args.get('sport')
    if sport:
        query += ' AND e.sport = ?'
        params.append(sport)
    if field_players:
        query += ' AND e.field_players = ?'
        params.append(int(field_players))
    if goalkeepers:
        query += ' AND e.goalkeepers = ?'
        params.append(int(goalkeepers))
    if core_competency:
        query += ' AND e.core_competency = ?'
        params.append(core_competency)
    if difficulty:
        query += ' AND e.difficulty = ?'
        params.append(difficulty)
    if field_size:
        query += ' AND e.field_size = ?'
        params.append(field_size)
    if search:
        query += ' AND (e.title LIKE ? OR e.description LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])

    query += ' ORDER BY e.created_at DESC'

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
    result = dict(exercise)
    result['is_owner'] = 1 if exercise['owner_user_id'] == session['user_id'] else 0
    return jsonify(result)


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
        if file and file.filename:
            if not allowed_file(file.filename):
                return jsonify({'error': 'Bildformat nicht unterstützt (erlaubt: PNG, JPG, GIF, WEBP, HEIC)'}), 400
            try:
                image_path = _upload_image(file)
            except Exception:
                return jsonify({'error': 'Bild konnte nicht hochgeladen werden'}), 400

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO exercises (title, description, image_path, field_players, goalkeepers, core_competency, difficulty, field_size, sport, owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        (title, description, image_path, int(field_players), int(goalkeepers), core_competency, difficulty, field_size, sport, session['user_id'])
    )
    conn.commit()
    exercise = dict(conn.execute('SELECT * FROM exercises WHERE id = ?', (cursor.lastrowid,)).fetchone())
    exercise['is_owner'] = 1
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
    if exercise['owner_user_id'] != session['user_id']:
        conn.close()
        return jsonify({'error': 'Keine Berechtigung für diese Übung'}), 403

    image_path = exercise['image_path']
    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename:
            if not allowed_file(file.filename):
                conn.close()
                return jsonify({'error': 'Bildformat nicht unterstützt (erlaubt: PNG, JPG, GIF, WEBP, HEIC)'}), 400
            try:
                new_path = _upload_image(file)
            except Exception:
                conn.close()
                return jsonify({'error': 'Bild konnte nicht hochgeladen werden'}), 400
            _delete_image(image_path)
            image_path = new_path

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
    if exercise['owner_user_id'] != session['user_id']:
        conn.close()
        return jsonify({'error': 'Keine Berechtigung für diese Übung'}), 403

    _delete_image(exercise['image_path'])

    conn.execute('DELETE FROM exercises WHERE id = ?', (exercise_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Übung gelöscht'})


# ── Exercise Share API ────────────────────────────────────────────────────────

@app.route('/exercise/share/<token>')
def exercise_share_page(token):
    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE share_token = ?', (token,)).fetchone()
    conn.close()
    if not exercise:
        return '<h2 style="font-family:sans-serif;padding:40px">Übung nicht gefunden oder Link ungültig.</h2>', 404
    exercise = dict(exercise)
    logged_in = 'user_id' in session
    return render_template('exercise_share.html', exercise=exercise, token=token, logged_in=logged_in)


@app.route('/api/exercises/<int:exercise_id>/share', methods=['POST'])
@login_required
def share_exercise(exercise_id):
    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE id = ?', (exercise_id,)).fetchone()
    if not exercise:
        conn.close()
        return jsonify({'error': 'Übung nicht gefunden'}), 404
    if exercise['owner_user_id'] != session['user_id']:
        conn.close()
        return jsonify({'error': 'Keine Berechtigung für diese Übung'}), 403

    token = exercise['share_token']
    if not token:
        while True:
            token = uuid.uuid4().hex
            existing = conn.execute('SELECT id FROM exercises WHERE share_token = ?', (token,)).fetchone()
            if not existing:
                break
        conn.execute('UPDATE exercises SET share_token = ? WHERE id = ?', (token, exercise_id))
        conn.commit()

    conn.close()
    base_url = request.host_url.rstrip('/')
    share_url = f"{base_url}/exercise/share/{token}"
    return jsonify({'share_url': share_url, 'token': token})


@app.route('/api/exercises/import/<token>', methods=['POST'])
@login_required
def import_exercise(token):
    conn = get_db()
    exercise = conn.execute('SELECT * FROM exercises WHERE share_token = ?', (token,)).fetchone()
    if not exercise:
        conn.close()
        return jsonify({'error': 'Übung nicht gefunden'}), 404

    e = dict(exercise)
    cursor = conn.execute(
        'INSERT INTO exercises (title, description, image_path, field_players, goalkeepers, core_competency, difficulty, field_size, sport, owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        (e['title'], e['description'], e['image_path'], e['field_players'], e['goalkeepers'],
         e['core_competency'], e['difficulty'], e['field_size'], e['sport'], session['user_id'])
    )
    conn.commit()
    new_id = cursor.lastrowid
    new_exercise = dict(conn.execute('SELECT * FROM exercises WHERE id = ?', (new_id,)).fetchone())
    conn.close()
    return jsonify(new_exercise), 201


# ── Exercise Favorites API ────────────────────────────────────────────────────

@app.route('/api/exercises/<int:exercise_id>/favorite', methods=['POST'])
@login_required
def toggle_favorite(exercise_id):
    uid = session['user_id']
    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM exercise_favorites WHERE user_id = ? AND exercise_id = ?', (uid, exercise_id)
    ).fetchone()
    if existing:
        conn.execute('DELETE FROM exercise_favorites WHERE user_id = ? AND exercise_id = ?', (uid, exercise_id))
        is_favorite = False
    else:
        conn.execute('INSERT INTO exercise_favorites (user_id, exercise_id) VALUES (?,?)', (uid, exercise_id))
        is_favorite = True
    conn.commit()
    conn.close()
    return jsonify({'is_favorite': is_favorite})


# ── Events API ────────────────────────────────────────────────────────────────

@app.route('/api/events', methods=['GET'])
@login_required
def get_events():
    month = request.args.get('month')
    uid = session['user_id']
    conn = get_db()

    user_row = conn.execute('SELECT role FROM users WHERE id = ?', (uid,)).fetchone()
    user_role = user_row['role'] if user_row else 'trainer'

    if user_role == 'player':
        p = conn.execute('SELECT id, user_id FROM players WHERE linked_user_id = ?', (uid,)).fetchone()
        if p:
            trainer_id = p['user_id']
            player_id = p['id']
            team_rows = conn.execute(
                'SELECT team_id FROM player_team_memberships WHERE player_id = ?', (player_id,)
            ).fetchall()
            team_ids = [r['team_id'] for r in team_rows]
            if team_ids:
                placeholders = ','.join('?' * len(team_ids))
                if month:
                    rows = conn.execute(
                        f"SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id "
                        f"WHERE e.user_id = ? AND e.team_id IN ({placeholders}) AND strftime('%Y-%m', e.date) = ? ORDER BY e.date, e.time",
                        (trainer_id, *team_ids, month)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        f"SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id "
                        f"WHERE e.user_id = ? AND e.team_id IN ({placeholders}) ORDER BY e.date, e.time",
                        (trainer_id, *team_ids)
                    ).fetchall()
            else:
                rows = []
        else:
            rows = []
        conn.close()
        return jsonify([dict(r) for r in rows])

    # Trainer/private: eigene Events
    if month:
        rows = conn.execute(
            "SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id "
            "WHERE e.user_id = ? AND strftime('%Y-%m', e.date) = ? ORDER BY e.date, e.time",
            (uid, month)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id "
            "WHERE e.user_id = ? ORDER BY e.date, e.time",
            (uid,)
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/events', methods=['POST'])
@login_required
def create_event():
    data = request.get_json()
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    event_type = (data.get('type') or 'spiel').strip()
    time = (data.get('time') or '').strip() or None
    location = (data.get('location') or '').strip() or None
    notes = (data.get('notes') or '').strip()
    raw_team_id = data.get('team_id')

    if not title or not date:
        return jsonify({'error': 'Titel und Datum erforderlich'}), 400
    if event_type not in ('spiel', 'turnier', 'sonstiges'):
        event_type = 'spiel'

    conn = get_db()
    team_id = None
    if raw_team_id:
        t = conn.execute('SELECT id FROM teams WHERE id = ? AND user_id = ?', (int(raw_team_id), session['user_id'])).fetchone()
        if t:
            team_id = int(raw_team_id)

    cursor = conn.execute(
        'INSERT INTO events (user_id, title, date, time, location, type, notes, team_id) VALUES (?,?,?,?,?,?,?,?)',
        (session['user_id'], title, date, time, location, event_type, notes, team_id)
    )
    conn.commit()
    event = dict(conn.execute(
        'SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id WHERE e.id = ?',
        (cursor.lastrowid,)
    ).fetchone())
    conn.close()
    return jsonify(event), 201


@app.route('/api/events/<int:event_id>', methods=['PUT'])
@login_required
def update_event(event_id):
    data = request.get_json()
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    event_type = (data.get('type') or 'spiel').strip()
    time = (data.get('time') or '').strip() or None
    location = (data.get('location') or '').strip() or None
    notes = (data.get('notes') or '').strip()
    raw_team_id = data.get('team_id')

    if not title or not date:
        return jsonify({'error': 'Titel und Datum erforderlich'}), 400
    if event_type not in ('spiel', 'turnier', 'sonstiges'):
        event_type = 'spiel'

    conn = get_db()
    ev = conn.execute('SELECT id FROM events WHERE id = ? AND user_id = ?', (event_id, session['user_id'])).fetchone()
    if not ev:
        conn.close()
        return jsonify({'error': 'Termin nicht gefunden'}), 404

    team_id = None
    if raw_team_id:
        t = conn.execute('SELECT id FROM teams WHERE id = ? AND user_id = ?', (int(raw_team_id), session['user_id'])).fetchone()
        if t:
            team_id = int(raw_team_id)

    conn.execute(
        'UPDATE events SET title=?, date=?, time=?, location=?, type=?, notes=?, team_id=? WHERE id=?',
        (title, date, time, location, event_type, notes, team_id, event_id)
    )
    conn.commit()
    event = dict(conn.execute(
        'SELECT e.*, t.name as team_name FROM events e LEFT JOIN teams t ON e.team_id = t.id WHERE e.id = ?',
        (event_id,)
    ).fetchone())
    conn.close()
    return jsonify(event)


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    conn = get_db()
    ev = conn.execute('SELECT id FROM events WHERE id = ? AND user_id = ?', (event_id, session['user_id'])).fetchone()
    if not ev:
        conn.close()
        return jsonify({'error': 'Termin nicht gefunden'}), 404
    conn.execute('DELETE FROM events WHERE id = ?', (event_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Termin gelöscht'})


# ── Trainings API ─────────────────────────────────────────────────────────────

@app.route('/api/trainings', methods=['GET'])
@login_required
def get_trainings():
    month = request.args.get('month')
    conn  = get_db()
    uid   = session['user_id']

    # Rolle und Trainer-ID in derselben Verbindung holen
    user_row = conn.execute('SELECT role FROM users WHERE id = ?', (uid,)).fetchone()
    user_role = user_row['role'] if user_row else 'trainer'

    trainer_id = None
    if user_role == 'player':
        p = conn.execute('SELECT user_id FROM players WHERE linked_user_id = ?', (uid,)).fetchone()
        if p:
            trainer_id = p['user_id']

    def _fetch(user_id):
        if month:
            return conn.execute(
                """SELECT t.*, COUNT(te.id) as exercise_count
                   FROM trainings t LEFT JOIN training_exercises te ON t.id = te.training_id
                   WHERE t.user_id = ? AND strftime('%Y-%m', t.date) = ?
                   GROUP BY t.id ORDER BY t.date""",
                (user_id, month)
            ).fetchall()
        return conn.execute(
            """SELECT t.*, COUNT(te.id) as exercise_count
               FROM trainings t LEFT JOIN training_exercises te ON t.id = te.training_id
               WHERE t.user_id = ?
               GROUP BY t.id ORDER BY t.date DESC""",
            (user_id,)
        ).fetchall()

    result = [dict(r) for r in _fetch(uid)]
    for t in result:
        t['owned_by_me'] = True

    # Spieler: zusätzlich Trainer-Trainings anhängen
    if trainer_id:
        trainer_rows = [dict(r) for r in _fetch(trainer_id)]
        for t in trainer_rows:
            t['owned_by_me'] = False
        result = result + trainer_rows
        result.sort(key=lambda x: x['date'], reverse=True)

    conn.close()
    return jsonify(result)



@app.route('/api/trainings', methods=['POST'])
@login_required
def create_training():
    data = request.get_json()
    title = (data.get('title') or '').strip()
    date = (data.get('date') or '').strip()
    notes = data.get('notes') or ''
    time = (data.get('time') or '').strip() or None

    if not title or not date:
        return jsonify({'error': 'Titel und Datum erforderlich'}), 400

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO trainings (user_id, title, date, notes, time) VALUES (?,?,?,?,?)',
        (session['user_id'], title, date, notes, time)
    )
    conn.commit()
    training = dict(conn.execute('SELECT * FROM trainings WHERE id = ?', (cursor.lastrowid,)).fetchone())
    conn.close()
    return jsonify(training), 201


@app.route('/api/trainings/<int:training_id>', methods=['GET'])
@login_required
def get_training(training_id):
    conn = get_db()
    uid  = session['user_id']

    training = conn.execute(
        'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, uid)
    ).fetchone()
    owned_by_me = training is not None

    # Spieler dürfen Trainings ihres Trainers lesen (read-only)
    if not training:
        user_row = conn.execute('SELECT role FROM users WHERE id = ?', (uid,)).fetchone()
        if user_row and user_row['role'] == 'player':
            p = conn.execute('SELECT user_id FROM players WHERE linked_user_id = ?', (uid,)).fetchone()
            if p:
                training = conn.execute(
                    'SELECT * FROM trainings WHERE id = ? AND user_id = ?', (training_id, p['user_id'])
                ).fetchone()
                owned_by_me = False

    if not training:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    exercises = conn.execute(
        """SELECT e.*, te.order_index, te.block, te.duration FROM exercises e
           JOIN training_exercises te ON e.id = te.exercise_id
           WHERE te.training_id = ? ORDER BY te.order_index""",
        (training_id,)
    ).fetchall()
    conn.close()

    result = dict(training)
    result['exercises'] = [dict(e) for e in exercises]
    result['owned_by_me'] = owned_by_me
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

    if 'time' in data:
        time = (data.get('time') or '').strip() or None
        conn.execute('UPDATE trainings SET title=?,date=?,notes=?,time=? WHERE id=?', (title, date, notes, time, training_id))
    else:
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
        'INSERT INTO trainings (user_id, title, date, notes, time) VALUES (?,?,?,?,?)',
        (session['user_id'], new_title, new_date, '', original['time'] if 'time' in original.keys() else None)
    )
    new_id = cursor.lastrowid

    exercises = conn.execute(
        'SELECT * FROM training_exercises WHERE training_id = ? ORDER BY order_index',
        (training_id,)
    ).fetchall()
    for ex in exercises:
        conn.execute(
            'INSERT INTO training_exercises (training_id, exercise_id, order_index, block, duration) VALUES (?,?,?,?,?)',
            (new_id, ex['exercise_id'], ex['order_index'], ex['block'], ex['duration'])
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
    block = (data.get('block') or 'Hauptteil').strip()
    if block not in ('Aufwärmen', 'Hauptteil', 'Abschluss'):
        block = 'Hauptteil'
    try:
        duration = int(data.get('duration')) if data.get('duration') not in (None, '') else None
    except (TypeError, ValueError):
        duration = None

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

    conn.execute('INSERT INTO training_exercises (training_id, exercise_id, order_index, block, duration) VALUES (?,?,?,?,?)',
                 (training_id, exercise_id, order, block, duration))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Übung hinzugefügt'}), 201


@app.route('/api/trainings/<int:training_id>/exercises/<int:exercise_id>/meta', methods=['PUT'])
@login_required
def update_training_exercise_meta(training_id, exercise_id):
    data = request.get_json() or {}
    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    fields, params = [], []
    if 'block' in data:
        block = (data.get('block') or 'Hauptteil').strip()
        if block not in ('Aufwärmen', 'Hauptteil', 'Abschluss'):
            block = 'Hauptteil'
        fields.append('block = ?'); params.append(block)
    if 'duration' in data:
        try:
            duration = int(data.get('duration')) if data.get('duration') not in (None, '') else None
        except (TypeError, ValueError):
            duration = None
        fields.append('duration = ?'); params.append(duration)

    if fields:
        params += [training_id, exercise_id]
        conn.execute(f'UPDATE training_exercises SET {", ".join(fields)} WHERE training_id = ? AND exercise_id = ?', params)
        conn.commit()
    conn.close()
    return jsonify({'message': 'Aktualisiert'})


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

    # Spieler: eigene Stats + Trainer-Stats zusammenführen
    trainer_id = None
    if _get_user_role(session['user_id']) == 'player':
        trainer_id = _get_player_trainer_id(user_id)

    month_start = today.replace(day=1).isoformat()
    if trainer_id:
        training_count_month = conn.execute(
            'SELECT COUNT(*) FROM trainings WHERE (user_id=? OR user_id=?) AND date >= ?',
            (user_id, trainer_id, month_start)
        ).fetchone()[0]
        total_trainings = conn.execute(
            'SELECT COUNT(*) FROM trainings WHERE user_id=? OR user_id=?', (user_id, trainer_id)
        ).fetchone()[0]
    else:
        training_count_month = conn.execute(
            'SELECT COUNT(*) FROM trainings WHERE user_id=? AND date >= ?',
            (user_id, month_start)
        ).fetchone()[0]
        total_trainings = conn.execute(
            'SELECT COUNT(*) FROM trainings WHERE user_id=?', (user_id,)
        ).fetchone()[0]

    total_exercises = conn.execute('SELECT COUNT(*) FROM exercises').fetchone()[0]

    upcoming = []
    for i in range(4):
        day = (today + datetime.timedelta(days=i)).isoformat()
        own_t = [dict(r) | {'from_trainer': False} for r in conn.execute(
            'SELECT id, title FROM trainings WHERE user_id=? AND date=? ORDER BY created_at',
            (user_id, day)
        ).fetchall()]
        trainer_t = []
        if trainer_id:
            trainer_t = [dict(r) | {'from_trainer': True} for r in conn.execute(
                'SELECT id, title FROM trainings WHERE user_id=? AND date=? ORDER BY created_at',
                (trainer_id, day)
            ).fetchall()]
        day_events = [dict(r) for r in conn.execute(
            'SELECT id, title, time, location, type FROM events WHERE user_id=? AND date=? ORDER BY time',
            (user_id, day)
        ).fetchall()]
        upcoming.append({'date': day, 'trainings': own_t + trainer_t, 'events': day_events})

    suggested = [dict(r) for r in conn.execute(
        "SELECT id, title, core_competency, difficulty, sport FROM exercises "
        "WHERE sport='Allgemein' ORDER BY RANDOM() LIMIT 3"
    ).fetchall()]

    # ── Wochenfortschritt (Mo–So der aktuellen Woche) ──────────────────────────
    week_start = today - datetime.timedelta(days=today.weekday())   # Montag
    week_end   = week_start + datetime.timedelta(days=6)            # Sonntag
    user_ids   = [user_id] + ([trainer_id] if trainer_id else [])
    placeholders = ','.join('?' for _ in user_ids)
    week_done = conn.execute(
        f'SELECT COUNT(*) FROM trainings WHERE user_id IN ({placeholders}) AND date>=? AND date<=?',
        (*user_ids, week_start.isoformat(), week_end.isoformat())
    ).fetchone()[0]

    goal_row = conn.execute('SELECT weekly_goal FROM users WHERE id=?', (user_id,)).fetchone()
    week_goal = (goal_row['weekly_goal'] if goal_row and goal_row['weekly_goal'] else 4)

    # Trainings-/Termin-Tage dieser Woche (für die Punkte unter der Tagesleiste)
    t_days = {r[0] for r in conn.execute(
        f'SELECT DISTINCT date FROM trainings WHERE user_id IN ({placeholders}) AND date>=? AND date<=?',
        (*user_ids, week_start.isoformat(), week_end.isoformat())
    ).fetchall()}
    e_days = {r[0] for r in conn.execute(
        'SELECT DISTINCT date FROM events WHERE user_id=? AND date>=? AND date<=?',
        (user_id, week_start.isoformat(), week_end.isoformat())
    ).fetchall()}
    week_days = []
    for i in range(7):
        d = (week_start + datetime.timedelta(days=i))
        ds = d.isoformat()
        week_days.append({
            'date': ds, 'day_num': d.day, 'weekday': i,
            'has_training': ds in t_days, 'has_event': ds in e_days,
            'is_today': d == today,
        })

    # ── Heute: Einheiten (Trainings + Termine) mit Uhrzeit ─────────────────────
    today_str = today.isoformat()
    today_units = []
    today_trainings = conn.execute(
        f'SELECT id, title, time, user_id FROM trainings WHERE user_id IN ({placeholders}) AND date=?',
        (*user_ids, today_str)
    ).fetchall()
    for t in today_trainings:
        sport_row = conn.execute(
            '''SELECT e.sport, COUNT(*) c FROM training_exercises te
               JOIN exercises e ON e.id = te.exercise_id
               WHERE te.training_id=? GROUP BY e.sport ORDER BY c DESC LIMIT 1''',
            (t['id'],)
        ).fetchone()
        today_units.append({
            'kind': 'training', 'id': t['id'], 'title': t['title'],
            'time': t['time'], 'sport': sport_row['sport'] if sport_row else 'Allgemein',
            'from_trainer': bool(trainer_id and t['user_id'] == trainer_id),
        })
    for ev in conn.execute(
        'SELECT id, title, time, location, type FROM events WHERE user_id=? AND date=?',
        (user_id, today_str)
    ).fetchall():
        today_units.append({
            'kind': 'event', 'id': ev['id'], 'title': ev['title'],
            'time': ev['time'], 'location': ev['location'], 'type': ev['type'],
        })
    today_units.sort(key=lambda u: (u['time'] is None, u['time'] or ''))

    conn.close()
    return jsonify({
        'stats': {
            'trainings_this_month': training_count_month,
            'total_trainings':      total_trainings,
            'total_exercises':      total_exercises,
        },
        'week': {
            'goal': week_goal, 'done': week_done,
            'start': week_start.isoformat(), 'days': week_days,
        },
        'today_units': today_units,
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

    if player_id is None:
        return jsonify({'error': 'player_id fehlt'}), 400

    conn = get_db()
    t = conn.execute('SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, session['user_id'])).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    # Verify player belongs to this user
    if not conn.execute('SELECT id FROM players WHERE id = ? AND user_id = ?', (player_id, session['user_id'])).fetchone():
        conn.close()
        return jsonify({'error': 'Spieler nicht gefunden'}), 404

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


@app.route('/api/trainings/<int:training_id>/my-attendance', methods=['GET', 'PUT'])
@login_required
def my_attendance(training_id):
    """Spieler markiert/liest seine eigene Anwesenheit für ein Training."""
    conn = get_db()
    player = conn.execute(
        'SELECT * FROM players WHERE linked_user_id = ?', (session['user_id'],)
    ).fetchone()
    if not player:
        conn.close()
        return jsonify({'error': 'Kein Spielerprofil verknüpft'}), 404

    # Das Training muss dem Trainer dieses Spielers gehören – sonst könnte ein
    # Spieler Anwesenheits-Einträge für beliebige fremde Trainings schreiben.
    training = conn.execute(
        'SELECT id FROM trainings WHERE id = ? AND user_id = ?', (training_id, player['user_id'])
    ).fetchone()
    if not training:
        conn.close()
        return jsonify({'error': 'Training nicht gefunden'}), 404

    if request.method == 'GET':
        att = conn.execute(
            'SELECT present FROM training_attendance WHERE training_id = ? AND player_id = ?',
            (training_id, player['id'])
        ).fetchone()
        conn.close()
        return jsonify({
            'player_name': player['name'],
            'present': att['present'] if att else None
        })

    data = request.get_json()
    present = 1 if data.get('present') else 0
    conn.execute(
        'INSERT OR REPLACE INTO training_attendance (training_id, player_id, present) VALUES (?,?,?)',
        (training_id, player['id'], present)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Anwesenheit gespeichert', 'present': present})


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
        JOIN player_team_memberships ptm ON ptm.player_id = p.id AND ptm.team_id = ?
        LEFT JOIN training_attendance ta ON ta.player_id = p.id
        LEFT JOIN trainings tr ON tr.id = ta.training_id AND tr.user_id = ?
        WHERE p.user_id = ?
        GROUP BY p.id, p.name, p.position, p.status
        ORDER BY present_count DESC, p.name
    ''', (team_id, session['user_id'], session['user_id'])).fetchall()

    total_tracked = conn.execute('''
        SELECT COUNT(DISTINCT ta.training_id)
        FROM training_attendance ta
        JOIN players p ON p.id = ta.player_id
        JOIN player_team_memberships ptm ON ptm.player_id = p.id AND ptm.team_id = ?
        JOIN trainings tr ON tr.id = ta.training_id AND tr.user_id = ?
    ''', (team_id, session['user_id'])).fetchone()[0]

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
    print('  TrainDesk gestartet!')
    print('  Oeffne: http://localhost:5000')
    print('  Beenden: Ctrl+C')
    print('='*40 + '\n')
    app.run(debug=False, port=5000, host='0.0.0.0')
