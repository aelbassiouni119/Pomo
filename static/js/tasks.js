/* ── FocusFlow Tasks ─────────────────────────────────────────── */

async function addTask(e) {
    e.preventDefault();
    const input = document.getElementById('new-task-input');
    const title = input.value.trim();
    if (!title) return;
    input.value = '';

    try {
        const resp = await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title}),
        });
        const task = await resp.json();
        if (task.id) prependTaskRow(task);
    } catch (err) {
        console.error('Failed to add task:', err);
    }
}

function prependTaskRow(task) {
    const list = document.getElementById('active-list');
    if (!list) return;

    // Remove empty state if present
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'task-row';
    row.id = `task-${task.id}`;
    row.dataset.taskId = task.id;
    row.style.cssText = '--i:0;animation:fadeUp 0.35s ease both;';
    row.innerHTML = `
      <div class="task-check" onclick="doneTask(${task.id})" aria-label="Complete task">
        <svg width="10" height="10" fill="none" stroke="var(--session)" stroke-width="3"
             stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"
             style="opacity:0;transition:opacity 0.15s;">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="task-title">${escHtml(task.title)}</span>
      <button class="task-del" onclick="deleteTask(${task.id})" aria-label="Delete task">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    list.insertBefore(row, list.firstChild);
}

async function doneTask(taskId) {
    const row = document.getElementById(`task-${taskId}`);
    if (!row) return;
    // Animate out
    row.style.transition = 'opacity 0.3s, transform 0.3s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(24px)';
    setTimeout(() => row.remove(), 320);

    try {
        await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({done: true}),
        });
    } catch (err) {}
}

async function deleteTask(taskId) {
    const row = document.getElementById(`task-${taskId}`);
    if (!row) return;
    row.style.transition = 'opacity 0.25s';
    row.style.opacity = '0';
    setTimeout(() => row.remove(), 260);

    try {
        await fetch(`/api/tasks/${taskId}`, {method: 'DELETE'});
    } catch (err) {}
}

async function deleteDoneTask(taskId) {
    const row = document.getElementById(`done-${taskId}`);
    if (!row) return;

    row.style.transition = 'opacity 0.25s, transform 0.25s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(24px)';

    setTimeout(() => {
        row.remove();
        const doneList = document.querySelector('.done-list');
        if (doneList && doneList.querySelectorAll('.done-row').length === 0) {
            const section = doneList.closest('div');
            if (section) section.style.display = 'none';
        }
    }, 260);

    try {
        await fetch(`/api/tasks/${taskId}`, {method: 'DELETE'});
    } catch (err) {}
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Hover effect on check boxes
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.task-check').forEach(check => {
        check.addEventListener('mouseenter', () => {
            const svg = check.querySelector('svg');
            if (svg) svg.style.opacity = '0.35';
        });
        check.addEventListener('mouseleave', () => {
            const svg = check.querySelector('svg');
            if (svg) svg.style.opacity = '0';
        });
    });
});
