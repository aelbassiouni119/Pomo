/* ── FocusFlow Timer ────────────────────────────────────────── */

const CIRCUMFERENCE = 691;

const MODE_COLORS = {
    work:        '#7820ff',
    short_break: '#00ff88',
    long_break:  '#00c8ff',
};
const MODE_GRAD = {
    work:        ['#7820ff', '#a060ff'],
    short_break: ['#00ff88', '#00c8a0'],
    long_break:  ['#00c8ff', '#0080ff'],
};
const MODE_DIM = {
    work:        'rgba(120,32,255,0.18)',
    short_break: 'rgba(0,255,136,0.14)',
    long_break:  'rgba(0,200,255,0.14)',
};

// ── State ─────────────────────────────────────────────────────
let mode             = 'work';
let timerState       = 'idle';   // idle | running | paused
let totalSeconds     = 1500;
let remainingSeconds = 1500;
let startedAt        = null;
let timerInterval    = null;
let completedPomodoros = 0;
let activeTaskId     = null;
let tasks            = [];
let settings         = {
    work_duration: 1500, short_break: 300, long_break: 900,
    long_break_interval: 4, auto_start_breaks: 0, auto_start_work: 0,
    sound_enabled: 1, notification_enabled: 1,
};

// ── Formatting ────────────────────────────────────────────────
function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── DOM helpers ───────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function updateRing() {
    const elapsed = totalSeconds - remainingSeconds;
    const offset = (elapsed / totalSeconds) * CIRCUMFERENCE;
    const ring = el('timer-ring');
    if (ring) ring.style.strokeDashoffset = offset;
}

function updateDisplay() {
    const d = el('timer-display');
    if (d) d.textContent = fmt(remainingSeconds);
    updateRing();
    document.title = `${fmt(remainingSeconds)} — ${modeLabelShort()}`;
}

function modeLabelShort() {
    if (mode === 'work') return 'Focus';
    if (mode === 'short_break') return 'Break';
    return 'Long Break';
}

function modeLabel() {
    if (mode === 'work') {
        const cyclePos = (completedPomodoros % settings.long_break_interval) + 1;
        return `WORK · ${cyclePos} OF ${settings.long_break_interval}`;
    }
    if (mode === 'short_break') return 'SHORT BREAK';
    return 'LONG BREAK';
}

function applySessionColor() {
    const color   = MODE_COLORS[mode];
    const dim     = MODE_DIM[mode];
    const [g1,g2] = MODE_GRAD[mode];

    document.documentElement.style.setProperty('--session', color);
    document.documentElement.style.setProperty('--session-dim', dim);

    // Update SVG gradient stops
    const s1 = el('grad-stop-1');
    const s2 = el('grad-stop-2');
    if (s1) s1.setAttribute('stop-color', g1);
    if (s2) s2.setAttribute('stop-color', g2);

    // Update ring drop-shadow via inline style
    const ring = el('timer-ring');
    if (ring) ring.style.filter = `drop-shadow(0 0 8px ${color})`;

    // Update glow blob
    const glow = el('glow-main');
    if (glow) glow.style.background =
        `radial-gradient(circle,${color}1a,transparent 65%)`;

    // Play/pause button
    const ppBtn = el('play-pause-btn');
    if (ppBtn) {
        ppBtn.style.background = color;
        ppBtn.style.boxShadow  = `0 0 28px ${dim}, 0 0 60px ${dim}`;
    }
}

function updateCycleDots() {
    const lbi = settings.long_break_interval || 4;
    document.querySelectorAll('.cycle-dot').forEach((dot, i) => {
        const filled = i < (completedPomodoros % lbi);
        dot.classList.toggle('filled', filled);
    });
    // Rebuild dots if interval changed
    renderCycleDots();
}

function renderCycleDots() {
    const container = el('cycle-dots');
    if (!container) return;
    const lbi = settings.long_break_interval || 4;
    container.innerHTML = '';
    for (let i = 0; i < lbi; i++) {
        const dot = document.createElement('div');
        dot.className = 'cycle-dot';
        dot.dataset.index = i;
        if (i < (completedPomodoros % lbi)) {
            dot.classList.add('filled');
        }
        container.appendChild(dot);
    }
}

function updateModeLabel() {
    const lbl = el('mode-label');
    if (lbl) lbl.textContent = modeLabel();
}

function updatePlayPauseBtn() {
    const btn = el('play-pause-btn');
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

// ── Mode switching ────────────────────────────────────────────
function setMode(newMode) {
    mode = newMode;
    const dur = mode === 'work' ? settings.work_duration
              : mode === 'short_break' ? settings.short_break
              : settings.long_break;
    totalSeconds     = dur;
    remainingSeconds = dur;

    applySessionColor();
    updateModeLabel();
    updateCycleDots();
    updateDisplay();

    // Ring breathing only during active work
    const ring = el('timer-ring');
    if (ring) ring.classList.remove('breathing');
}

// ── Timer controls ────────────────────────────────────────────
function startTimer() {
    if (timerState === 'running') return;
    if (remainingSeconds <= 0) {
        remainingSeconds = totalSeconds;
        updateDisplay();
    }
    if (!startedAt) startedAt = new Date().toISOString();
    timerState = 'running';
    updatePlayPauseBtn();

    const ring = el('timer-ring');
    if (ring && mode === 'work') ring.classList.add('breathing');

    timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
    if (timerState !== 'running') return;
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'paused';
    updatePlayPauseBtn();

    const ring = el('timer-ring');
    if (ring) ring.classList.remove('breathing');
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState    = 'idle';
    startedAt     = null;
    remainingSeconds = totalSeconds;

    updatePlayPauseBtn();
    updateDisplay();

    const ring = el('timer-ring');
    if (ring) ring.classList.remove('breathing');

    sessionStorage.removeItem('timerSnap');
}

function skipTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState    = 'idle';
    startedAt     = null;

    const ring = el('timer-ring');
    if (ring) ring.classList.remove('breathing');

    if (mode === 'work') {
        const nextMode = ((completedPomodoros + 1) % settings.long_break_interval === 0)
            ? 'long_break' : 'short_break';
        setMode(nextMode);
    } else {
        setMode('work');
    }
    updatePlayPauseBtn();
}

window.togglePlayPause = function() {
    if (timerState === 'running') pauseTimer();
    else startTimer();
};
window.resetTimer  = resetTimer;
window.skipTimer   = skipTimer;

function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    const active = document.body.classList.contains('focus-mode');
    const btn = el('focus-toggle-btn');
    if (btn) btn.setAttribute('aria-label', active ? 'Exit focus mode' : 'Enter focus mode');
    const lbl = el('focus-toggle-label');
    if (lbl) lbl.textContent = active ? 'Exit focus' : 'Focus mode';
}
window.toggleFocusMode = toggleFocusMode;

// ── Tick ──────────────────────────────────────────────────────
function tick() {
    if (timerState !== 'running') return;
    remainingSeconds--;
    updateDisplay();
    snapshotState();

    if (remainingSeconds <= 0) onSessionComplete();
}

function onSessionComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState    = 'idle';

    const ring = el('timer-ring');
    if (ring) ring.classList.remove('breathing');

    playBell();

    if (mode === 'work') {
        postSession('work', true);
        completedPomodoros++;
        updateCycleDots();

        if (activeTaskId) patchTaskPomodoro(activeTaskId);

        const nextMode = (completedPomodoros % settings.long_break_interval === 0)
            ? 'long_break' : 'short_break';
        setMode(nextMode);
        if (settings.auto_start_breaks) {
            startedAt = new Date().toISOString();
            startTimer();
        } else {
            updatePlayPauseBtn();
        }
    } else {
        postSession(mode, true);
        setMode('work');
        if (settings.auto_start_work) {
            startedAt = new Date().toISOString();
            startTimer();
        } else {
            updatePlayPauseBtn();
        }
    }

    fireNotification();
    sessionStorage.removeItem('timerSnap');
}

// ── Server sync ───────────────────────────────────────────────
async function postSession(type, completed) {
    try {
        await fetch('/api/sessions', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                task_id:   activeTaskId,
                type:      type,
                duration:  totalSeconds - remainingSeconds,
                planned:   totalSeconds,
                completed: completed ? 1 : 0,
                started_at: startedAt || new Date().toISOString(),
            }),
        });
    } catch (e) { /* offline — session lost, acceptable */ }
}

async function patchTaskPomodoro(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newCount = (task.completed || 0) + 1;
    task.completed = newCount;
    // Update badge in picker
    const badge = document.querySelector(`[data-badge="${taskId}"]`);
    if (badge) badge.textContent = `${newCount} 🍅`;
    try {
        await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({completed: newCount}),
        });
    } catch (e) {}
}

// ── Task picker ───────────────────────────────────────────────
async function loadTasks() {
    try {
        const r = await fetch('/api/tasks');
        tasks = await r.json();
        renderPickerList();
        renderTaskChip();
    } catch (e) {}
}

function renderPickerList() {
    const list = el('picker-list');
    if (!list) return;

    // "No task" option
    const noTaskItem = document.createElement('div');
    noTaskItem.className = 'picker-item' + (activeTaskId === null ? ' active' : '');
    noTaskItem.innerHTML = `
        <div class="picker-item-dot" style="background:var(--text-3)"></div>
        <span class="picker-item-title" style="color:var(--text-2)">No task</span>`;
    noTaskItem.onclick = () => selectTask(null);
    list.innerHTML = '';
    list.appendChild(noTaskItem);

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'picker-item' + (activeTaskId === task.id ? ' active' : '');
        item.innerHTML = `
            <div class="picker-item-dot"></div>
            <span class="picker-item-title">${escHtml(task.title)}</span>
            <span class="picker-item-badge" data-badge="${task.id}">${task.completed || 0} 🍅</span>`;
        item.onclick = () => selectTask(task.id);
        list.appendChild(item);
    });
}

function selectTask(id) {
    activeTaskId = id;
    renderPickerList();
    renderTaskChip();
    el('task-picker')?.classList.remove('open');
}

function renderTaskChip() {
    const text = el('task-chip-text');
    if (!text) return;
    const task = tasks.find(t => t.id === activeTaskId);
    text.textContent = task ? task.title : 'No task';
}

window.selectTask = selectTask;

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Sound (Web Audio API — no file needed) ────────────────────
let audioCtx = null;
function playBell() {
    if (!settings.sound_enabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Bell-like tone: two oscillators
        const t = audioCtx.currentTime;
        [880, 1100].forEach((freq, i) => {
            const osc  = audioCtx.createOscillator();
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

// ── Notifications ─────────────────────────────────────────────
function fireNotification() {
    if (!settings.notification_enabled) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const body = mode === 'work'
        ? `${modeLabelShort()} time! Take a break.`
        : `Break is over. Ready to focus?`;
    new Notification('FocusFlow', {body, icon: '/static/icons/icon-192.png'});
}

// ── Session snapshot (survive tab switches / refreshes) ───────
function snapshotState() {
    try {
        sessionStorage.setItem('timerSnap', JSON.stringify({
            mode, totalSeconds, remainingSeconds,
            startedAt, completedPomodoros, activeTaskId, capturedAt: Date.now(),
        }));
    } catch (e) {}
}

function restoreSnapshot() {
    try {
        const raw = sessionStorage.getItem('timerSnap');
        if (!raw) return false;
        const s = JSON.parse(raw);
        const elapsed = Math.floor((Date.now() - s.capturedAt) / 1000);
        const adjusted = s.remainingSeconds - elapsed;

        sessionStorage.removeItem('timerSnap');

        if (adjusted <= 0) {
            // Timer completed while tab was hidden — record the session
            mode               = s.mode;
            totalSeconds       = s.totalSeconds;
            completedPomodoros = s.completedPomodoros;
            activeTaskId       = s.activeTaskId;
            startedAt          = s.startedAt;

            postSession(s.mode, true);

            if (s.mode === 'work') {
                completedPomodoros++;
                if (activeTaskId) patchTaskPomodoro(activeTaskId);
                const nextMode = (completedPomodoros % settings.long_break_interval === 0)
                    ? 'long_break' : 'short_break';
                setMode(nextMode);
            } else {
                setMode('work');
            }
            updatePlayPauseBtn();
            return false;
        }

        mode               = s.mode;
        totalSeconds       = s.totalSeconds;
        remainingSeconds   = adjusted;
        startedAt          = s.startedAt;
        completedPomodoros = s.completedPomodoros;
        activeTaskId       = s.activeTaskId;

        applySessionColor();
        updateModeLabel();
        updateCycleDots();
        updateDisplay();

        timerState = 'running';
        updatePlayPauseBtn();
        const ring = el('timer-ring');
        if (ring && mode === 'work') ring.classList.add('breathing');
        timerInterval = setInterval(tick, 1000);
        return true;
    } catch (e) {
        sessionStorage.removeItem('timerSnap');
        return false;
    }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
    // Load settings
    try {
        const r = await fetch('/api/settings');
        settings = await r.json();
    } catch (e) {}

    // Restore or cold-start
    const restored = restoreSnapshot();
    if (!restored) {
        setMode('work');
        updatePlayPauseBtn();
    }

    await loadTasks();

    // Snapshot on tab hide
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && timerState === 'running') snapshotState();
    });

    // Control buttons
    const resetBtn = el('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);
    const skipBtn = el('skip-btn');
    if (skipBtn) skipBtn.addEventListener('click', skipTimer);

    // Task chip → open picker
    const chip = el('task-chip');
    if (chip) chip.addEventListener('click', () => el('task-picker')?.classList.add('open'));

    // Picker backdrop → close
    const picker = el('task-picker');
    if (picker) picker.addEventListener('click', e => {
        if (e.target === picker) picker.classList.remove('open');
    });

    // Focus mode button
    const focusBtn = el('focus-toggle-btn');
    if (focusBtn) focusBtn.addEventListener('click', toggleFocusMode);

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === ' ') { e.preventDefault(); window.togglePlayPause(); }
        if (e.key === 'Escape') {
            const pickerEl = el('task-picker');
            if (pickerEl?.classList.contains('open')) {
                pickerEl.classList.remove('open');
            } else if (document.body.classList.contains('focus-mode')) {
                toggleFocusMode();
            }
        }
        if (e.key === 'r' || e.key === 'R') resetTimer();
    });

    // PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

document.addEventListener('DOMContentLoaded', init);
