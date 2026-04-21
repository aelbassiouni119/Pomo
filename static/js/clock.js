/* ── FocusFlow Clock (Focus & Fun modes) ──────────────────── */

const CIRCUMFERENCE = 691;

const MODE_COLORS = {
    focus: '#ff8c42',  // warm orange from inspiration
    fun:   '#42a5f5',  // cool blue
};

const MODE_GRAD = {
    focus: ['#ff8c42', '#ffb366'],
    fun:   ['#42a5f5', '#64b5f6'],
};

const MODE_DIM = {
    focus: 'rgba(255, 140, 66, 0.18)',
    fun:   'rgba(66, 165, 245, 0.18)',
};

// ── State ──────────────────────────────────────────────────
let currentMode = 'focus';  // focus or fun
let timerState = 'idle';    // idle | running | paused
let totalSeconds = 1500;
let remainingSeconds = 1500;
let startedAt = null;
let timerInterval = null;
let activeTaskId = null;
let tasks = [];

// Mode-specific durations (customizable from settings later)
const MODE_DURATIONS = {
    focus: 1500,  // 25 min
    fun: 1200,    // 20 min (customizable)
};

// ── Switch Mode (stops any running timer) ────────────────
function switchMode(newMode) {
    if (newMode === currentMode) return;

    // Stop current timer if running
    if (timerState === 'running') {
        clearInterval(timerInterval);
        timerInterval = null;
        timerState = 'idle';
    }

    // Reset to new mode's duration
    currentMode = newMode;
    totalSeconds = MODE_DURATIONS[currentMode];
    remainingSeconds = totalSeconds;
    startedAt = null;

    applyModeColor();
    updateDisplay();
    updatePlayPauseBtn();
}

window.switchMode = switchMode;

// ── UI Updates ──────────────────────────────────────────
function applyModeColor() {
    const color = MODE_COLORS[currentMode];
    const dim = MODE_DIM[currentMode];
    const [g1, g2] = MODE_GRAD[currentMode];

    document.documentElement.style.setProperty('--session', color);
    document.documentElement.style.setProperty('--session-dim', dim);

    const s1 = document.getElementById('grad-stop-1');
    const s2 = document.getElementById('grad-stop-2');
    if (s1) s1.setAttribute('stop-color', g1);
    if (s2) s2.setAttribute('stop-color', g2);

    const ring = document.getElementById('timer-ring');
    if (ring) ring.style.filter = `drop-shadow(0 0 8px ${color})`;

    const glow = document.getElementById('glow-main');
    if (glow) glow.style.background = `radial-gradient(circle, ${color}1a, transparent 65%)`;

    const ppBtn = document.getElementById('play-pause-btn');
    if (ppBtn) {
        ppBtn.style.background = color;
        ppBtn.style.boxShadow = `0 0 28px ${dim}, 0 0 60px ${dim}`;
    }
}

function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateRing() {
    const elapsed = totalSeconds - remainingSeconds;
    const offset = (elapsed / totalSeconds) * CIRCUMFERENCE;
    const ring = document.getElementById('timer-ring');
    if (ring) ring.style.strokeDashoffset = offset;
}

function updateDisplay() {
    const d = document.getElementById('timer-display');
    if (d) d.textContent = fmt(remainingSeconds);
    updateRing();
    const label = currentMode === 'focus' ? 'Focus' : 'Fun';
    document.title = `${fmt(remainingSeconds)} — ${label}`;
}

function updatePlayPauseBtn() {
    const btn = document.getElementById('play-pause-btn');
    if (!btn) return;
    if (timerState === 'running') {
        btn.innerHTML = `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>`;
        btn.setAttribute('aria-label', 'Pause');
    } else {
        btn.innerHTML = `<svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21"/>
        </svg>`;
        btn.setAttribute('aria-label', 'Start');
    }
}

// ── Timer Controls ──────────────────────────────────────
function startTimer() {
    if (timerState === 'running') return;
    if (remainingSeconds <= 0) {
        remainingSeconds = totalSeconds;
    }
    startedAt = new Date().toISOString();
    timerState = 'running';
    updatePlayPauseBtn();

    const ring = document.getElementById('timer-ring');
    if (ring) ring.classList.add('breathing');

    timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
    if (timerState !== 'running') return;
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'paused';
    updatePlayPauseBtn();

    const ring = document.getElementById('timer-ring');
    if (ring) ring.classList.remove('breathing');
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'idle';
    startedAt = null;
    remainingSeconds = totalSeconds;
    updatePlayPauseBtn();
    updateDisplay();
}

function tick() {
    if (timerState !== 'running') return;
    remainingSeconds--;
    updateDisplay();

    if (remainingSeconds <= 0) onSessionComplete();
}

function onSessionComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'idle';

    const ring = document.getElementById('timer-ring');
    if (ring) ring.classList.remove('breathing');

    playBell();

    // Post session with mode
    postSession(currentMode, true);

    // Reset timer
    remainingSeconds = totalSeconds;
    updatePlayPauseBtn();
    updateDisplay();

    fireNotification();
}

// ── Server sync ──────────────────────────────────────────
async function postSession(mode, completed) {
    try {
        await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_id: activeTaskId,
                mode: mode,
                duration: totalSeconds - remainingSeconds,
                planned: totalSeconds,
                completed: completed ? 1 : 0,
                started_at: startedAt || new Date().toISOString(),
            }),
        });
    } catch (e) {}
}

// ── Sound ────────────────────────────────────────────────
let audioCtx = null;
function playBell() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        [880, 1100].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(freq, t + i * 0.08);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + i * 0.08 + 0.8);
            gain.gain.setValueAtTime(0.22, t + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 1.4);
            osc.type = 'sine';
            osc.start(t + i * 0.08);
            osc.stop(t + i * 0.08 + 1.5);
        });
    } catch (e) {}
}

function fireNotification() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const label = currentMode === 'focus' ? 'Focus' : 'Fun';
    new Notification('FocusFlow', {
        body: `${label} time complete!`,
        icon: '/static/icons/icon-192.png'
    });
}

// ── Init ────────────────────────────────────────────────
window.togglePlayPause = function() {
    if (timerState === 'running') pauseTimer();
    else startTimer();
};
window.resetTimer = resetTimer;

document.addEventListener('DOMContentLoaded', () => {
    applyModeColor();
    updateDisplay();
});
