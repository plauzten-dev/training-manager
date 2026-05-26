from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
import sqlite3
import os
import datetime
import uuid
from werkzeug.utils import secure_filename
from functools import wraps
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
    return render_template('login.html')


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


@app.route('/settings')
@login_required
def settings_page():
    conn = get_db()
    user = conn.execute('SELECT id, username, email, created_at FROM users WHERE id = ?', (session['user_id'],)).fetchone()
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


# ── Auth API ──────────────────────────────────────────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    if not username or not email or not password:
        return jsonify({'error': 'Alle Felder müssen ausgefüllt sein'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Passwort muss mindestens 6 Zeichen lang sein'}), 400

    conn = get_db()
    try:
        conn.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
                     (username, email, hash_password(password)))
        conn.commit()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        session['user_id'] = user['id']
        session['username'] = user['username']
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
    return jsonify({'message': 'Anmeldung erfolgreich', 'username': user['username']})


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
