import os
from datetime import date, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory
from db import get_db, init_db, close_db
from app.analytics import calculate_streak as calc_streak_analytics, get_focus_time_by_date, get_task_completion_rate

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'focusflow-dev-key')


@app.teardown_appcontext
def teardown_db(exc):
    close_db(exc)


# ── Page routes ───────────────────────────────────────────────

@app.route('/')
def timer():
    settings = get_db().execute('SELECT * FROM settings WHERE id=1').fetchone()
    active_tasks = get_db().execute(
        'SELECT * FROM tasks WHERE done=0 ORDER BY created_at DESC'
    ).fetchall()
    return render_template('timer.html', settings=settings, tasks=active_tasks)


@app.route('/clock')
def clock():
    """Display the dual-mode clock (focus/fun)."""
    return render_template('clock.html')


@app.route('/tasks')
def tasks():
    db = get_db()
    active = db.execute(
        'SELECT * FROM tasks WHERE done=0 ORDER BY created_at DESC'
    ).fetchall()
    done = db.execute(
        'SELECT * FROM tasks WHERE done=1 ORDER BY done_at DESC LIMIT 30'
    ).fetchall()
    return render_template('tasks.html', active=active, done=done)


@app.route('/history')
def history():
    db = get_db()
    today_count = db.execute(
        "SELECT COUNT(*) FROM sessions WHERE date(ended_at)=date('now') AND type='work' AND completed=1"
    ).fetchone()[0]
    total_minutes = (db.execute(
        "SELECT COALESCE(SUM(duration),0) FROM sessions WHERE type='work' AND completed=1"
    ).fetchone()[0] or 0) // 60
    streak = _calc_streak(db)

    days = db.execute("""
        SELECT
            date(ended_at) AS day,
            COUNT(*) FILTER (WHERE type='work' AND completed=1) AS pomodoros,
            COALESCE(SUM(duration) FILTER (WHERE type='work' AND completed=1), 0) AS work_seconds
        FROM sessions
        GROUP BY day
        ORDER BY day DESC
        LIMIT 30
    """).fetchall()

    heatmap_raw = db.execute("""
        SELECT date(ended_at) AS day, COUNT(*) AS count
        FROM sessions
        WHERE type='work' AND completed=1
          AND ended_at >= date('now','-6 days')
        GROUP BY day
    """).fetchall()
    heatmap_dict = {r['day']: r['count'] for r in heatmap_raw}
    heatmap_7 = [
        {'date': (date.today() - timedelta(days=i)).isoformat(),
         'count': heatmap_dict.get((date.today() - timedelta(days=i)).isoformat(), 0)}
        for i in range(6, -1, -1)
    ]

    max_count = max((d['count'] for d in heatmap_7), default=1) or 1

    return render_template('history.html',
        today_count=today_count,
        total_minutes=total_minutes,
        streak=streak,
        days=days,
        heatmap_7=heatmap_7,
        max_count=max_count)


@app.route('/analytics')
def analytics():
    """Display analytics and progress page."""
    return render_template('analytics.html')


@app.route('/settings')
def settings():
    s = get_db().execute('SELECT * FROM settings WHERE id=1').fetchone()
    return render_template('settings.html', settings=s)


# ── API: Sessions ─────────────────────────────────────────────

@app.route('/api/sessions', methods=['POST'])
def create_session():
    data = request.get_json(force=True)
    db = get_db()
    mode = data.get('mode', 'focus')
    if mode not in ['focus', 'fun']:
        mode = 'focus'
    db.execute(
        'INSERT INTO sessions (task_id,type,mode,duration,planned,completed,started_at) VALUES (?,?,?,?,?,?,?)',
        (data.get('task_id'), data.get('type', 'work'), mode,
         int(data.get('duration', 0)), int(data.get('planned', 0)),
         1 if data.get('completed') else 0, data.get('started_at'))
    )
    db.commit()
    return jsonify({'ok': True, 'mode': mode}), 201


@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    rows = get_db().execute(
        'SELECT * FROM sessions ORDER BY ended_at DESC LIMIT 50'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/stats', methods=['GET'])
def get_stats():
    db = get_db()
    today = db.execute(
        "SELECT COUNT(*) FROM sessions WHERE date(ended_at)=date('now') AND type='work' AND completed=1"
    ).fetchone()[0]
    total_min = (db.execute(
        "SELECT COALESCE(SUM(duration),0) FROM sessions WHERE type='work' AND completed=1"
    ).fetchone()[0] or 0) // 60
    return jsonify({'today': today, 'total_minutes': total_min, 'streak': _calc_streak(db)})


# ── API: Tasks ────────────────────────────────────────────────

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    rows = get_db().execute(
        'SELECT * FROM tasks WHERE done=0 ORDER BY created_at DESC'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/tasks/today', methods=['GET'])
def get_tasks_today():
    """Return active tasks for today, auto-resetting daily/weekly recurring tasks."""
    db = get_db()
    today = date.today().isoformat()

    # Fetch all non-deleted active tasks
    tasks = db.execute('SELECT * FROM tasks WHERE done=0').fetchall()

    for task in tasks:
        task_dict = dict(task)
        recurrence = task_dict.get('recurrence', 'none')

        if recurrence == 'daily':
            last_reset = task_dict.get('last_reset_date')
            if last_reset != today:
                # Reset task for today
                db.execute(
                    "UPDATE tasks SET done=0, last_reset_date=? WHERE id=?",
                    (today, task_dict['id'])
                )
        elif recurrence == 'weekly':
            # Calculate Monday of current week (weekday() returns 0=Monday, 6=Sunday)
            week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
            last_reset = task_dict.get('last_reset_date')
            if not last_reset or last_reset < week_start:
                # Reset task for this week, storing the Monday date for next week's comparison
                db.execute(
                    "UPDATE tasks SET done=0, last_reset_date=? WHERE id=?",
                    (week_start, task_dict['id'])
                )
        # 'none' tasks never auto-reset

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return jsonify({'error': 'Database error during reset'}), 500

    # Fetch updated tasks
    rows = db.execute(
        'SELECT * FROM tasks WHERE done=0 ORDER BY created_at DESC'
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.get_json(force=True)
    title = (data.get('title') or '').strip()
    recurrence = data.get('recurrence', 'none')

    if not title:
        return jsonify({'error': 'title required'}), 400

    if recurrence not in ['none', 'daily', 'weekly']:
        return jsonify({'error': 'Invalid recurrence'}), 400

    db = get_db()
    last_reset_date = date.today().isoformat() if recurrence != 'none' else None
    cur = db.execute(
        'INSERT INTO tasks (title, recurrence, last_reset_date) VALUES (?, ?, ?)',
        (title, recurrence, last_reset_date)
    )
    db.commit()
    row = db.execute('SELECT * FROM tasks WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
def update_task(task_id):
    data = request.get_json(force=True)
    db = get_db()
    if data.get('done'):
        db.execute("UPDATE tasks SET done=1,done_at=datetime('now') WHERE id=?", (task_id,))
    if 'completed' in data:
        try:
            completed = int(data['completed'])
        except (ValueError, TypeError):
            return jsonify({'error': 'invalid completed value'}), 400
        db.execute('UPDATE tasks SET completed=? WHERE id=?', (completed, task_id))
    if 'title' in data:
        title = (data.get('title') or '').strip()
        if not title:
            return jsonify({'error': 'title cannot be empty'}), 400
        if len(title) > 120:
            return jsonify({'error': 'title too long (max 120 chars)'}), 400
        db.execute('UPDATE tasks SET title=? WHERE id=?', (title, task_id))
    db.commit()
    row = db.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
    return jsonify(dict(row) if row else {})


@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    db = get_db()
    db.execute('DELETE FROM tasks WHERE id=?', (task_id,))
    db.commit()
    return jsonify({'deleted': True})


# ── API: Settings ─────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def get_settings_api():
    row = get_db().execute('SELECT * FROM settings WHERE id=1').fetchone()
    return jsonify(dict(row))


@app.route('/api/settings', methods=['PATCH'])
def save_settings_api():
    data = request.get_json(force=True)
    try:
        work_duration       = int(data.get('work_duration', 1500))
        short_break         = int(data.get('short_break', 300))
        long_break          = int(data.get('long_break', 900))
        long_break_interval = int(data.get('long_break_interval', 4))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid numeric value'}), 400

    if not (300 <= work_duration <= 3600):
        return jsonify({'error': 'work_duration out of range (300–3600)'}), 400
    if not (60 <= short_break <= 900):
        return jsonify({'error': 'short_break out of range (60–900)'}), 400
    if not (300 <= long_break <= 1800):
        return jsonify({'error': 'long_break out of range (300–1800)'}), 400
    if not (2 <= long_break_interval <= 6):
        return jsonify({'error': 'long_break_interval out of range (2–6)'}), 400

    db = get_db()
    db.execute("""
        UPDATE settings SET
            work_duration=?, short_break=?, long_break=?,
            long_break_interval=?, auto_start_breaks=?, auto_start_work=?,
            sound_enabled=?, notification_enabled=?
        WHERE id=1
    """, (
        work_duration, short_break, long_break, long_break_interval,
        1 if data.get('auto_start_breaks') else 0,
        1 if data.get('auto_start_work') else 0,
        1 if data.get('sound_enabled', True) else 0,
        1 if data.get('notification_enabled', True) else 0,
    ))
    db.commit()
    return jsonify({'ok': True})


# ── API: Analytics ───────────────────────────────────────────

@app.route('/api/stats/streak')
def get_streak():
    """Get current streak count."""
    streak, last_date = calc_streak_analytics()
    return jsonify({
        'streak': streak,
        'last_active': last_date if last_date else None
    })


@app.route('/api/stats/heatmap')
def get_heatmap():
    """Get focus time per day for heatmap visualization."""
    days_back = request.args.get('days', 30, type=int)
    data = get_focus_time_by_date(days_back)
    return jsonify(data)


@app.route('/api/stats/completion')
def get_completion():
    """Get task completion stats."""
    days_back = request.args.get('days', 7, type=int)
    stats = get_task_completion_rate(days_back)
    return jsonify(stats)


# ── PWA ───────────────────────────────────────────────────────

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')


# ── Helpers ───────────────────────────────────────────────────

def _calc_streak(db):
    rows = db.execute("""
        SELECT DISTINCT date(ended_at) AS day
        FROM sessions
        WHERE type='work' AND completed=1
        ORDER BY day DESC
        LIMIT 365
    """).fetchall()
    days = {r['day'] for r in rows}
    today = date.today()
    # Check if today is in it; if not try from yesterday
    start = today if today.isoformat() in days else today - timedelta(days=1)
    streak = 0
    check = start
    while check.isoformat() in days:
        streak += 1
        check -= timedelta(days=1)
    return streak


if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(debug=True, port=8082)
