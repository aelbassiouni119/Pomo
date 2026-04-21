"""
Analytics module for FocusFlow.
Provides functions to calculate streaks, focus time by date (heatmap), and task completion rates.
"""
from datetime import datetime, timedelta, date
from db import get_db


def calculate_streak(task_id=None):
    """
    Calculate current streak of days with completed work sessions.
    If task_id is specified, calculate for that task only.
    If task_id is None, calculate for all tasks.

    Returns: (streak_count, last_date)
    """
    db = get_db()
    today = date.today()

    if task_id:
        rows = db.execute("""
            SELECT DISTINCT date(ended_at) AS day
            FROM sessions
            WHERE task_id=? AND type='work' AND completed=1
            ORDER BY day DESC
            LIMIT 365
        """, (task_id,)).fetchall()
    else:
        rows = db.execute("""
            SELECT DISTINCT date(ended_at) AS day
            FROM sessions
            WHERE type='work' AND completed=1
            ORDER BY day DESC
            LIMIT 365
        """).fetchall()

    days = {r['day'] for r in rows}

    if not days:
        return 0, None

    streak = 0
    check_date = today

    # Check if today has work; if not, start from yesterday
    if today.isoformat() not in days:
        check_date = today - timedelta(days=1)

    while check_date.isoformat() in days:
        streak += 1
        check_date -= timedelta(days=1)

    return streak, max(days)


def get_focus_time_by_date(days_back=30):
    """
    Get total focus time (in seconds) for each of the last N days.
    Returns dict: {date_str: seconds}
    """
    db = get_db()
    start_date = date.today() - timedelta(days=days_back)

    rows = db.execute("""
        SELECT date(ended_at) AS day, COALESCE(SUM(duration), 0) AS total_seconds
        FROM sessions
        WHERE type='work' AND completed=1
          AND ended_at >= ?
        GROUP BY day
        ORDER BY day
    """, (start_date.isoformat(),)).fetchall()

    result = {r['day']: r['total_seconds'] for r in rows}

    return result


def get_task_completion_rate(days_back=7):
    """
    Get overall task completion stats for the last N days (based on done_at).
    Returns: {completed: int, total: int, rate: float}
    """
    db = get_db()
    start_date = date.today() - timedelta(days=days_back)

    # Count tasks completed in the date range
    completed = db.execute("""
        SELECT COUNT(*) FROM tasks
        WHERE done=1 AND done_at IS NOT NULL
          AND date(done_at) >= ?
    """, (start_date.isoformat(),)).fetchone()[0]

    # Count all tasks created up to today
    total = db.execute("""
        SELECT COUNT(*) FROM tasks
    """).fetchone()[0]

    rate = (completed / total * 100) if total > 0 else 0

    return {
        'completed': completed,
        'total': total,
        'rate': round(rate, 2)
    }
