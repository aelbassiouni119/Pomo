/* ── FocusFlow Analytics ──────────────────────────────────── */

let streakData = null;
let heatmapData = null;
let completionStats = null;

async function loadAnalytics() {
    try {
        const [streakRes, heatmapRes, statsRes] = await Promise.all([
            fetch('/api/stats/streak'),
            fetch('/api/stats/heatmap?days=30'),
            fetch('/api/stats/completion?days=7')
        ]);

        streakData = await streakRes.json();
        heatmapData = await heatmapRes.json();
        completionStats = await statsRes.json();

        renderStreak();
        renderHeatmap();
        renderCompletionStats();
    } catch (err) {
        console.error('Failed to load analytics:', err);
    }
}

function renderStreak() {
    const container = document.getElementById('streak-container');
    if (!container || !streakData) return;

    container.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <div style="font-size:48px;font-weight:700;color:var(--session);margin-bottom:8px;">
                ${streakData.streak}
            </div>
            <div style="font-size:13px;color:var(--text-2);">
                days in a row
            </div>
        </div>
    `;
}

function renderHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container || !heatmapData) return;

    const today = new Date();
    const weeks = [];

    // Build 4-week grid (7 days per week, 4 weeks)
    for (let w = 0; w < 4; w++) {
        const week = [];
        for (let d = 6; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - (w * 7 + d));
            week.push(date);
        }
        weeks.push(week);
    }

    let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:20px;">';

    // Create heatmap cells
    weeks.forEach(week => {
        week.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];
            const seconds = heatmapData[dateStr] || 0;
            const intensity = Math.min(seconds / 5400, 1); // 90 min = full intensity
            const color = `rgba(255, 140, 66, ${intensity * 0.8})`;

            html += `<div style="
                width:32px;height:32px;
                background:${color};
                border-radius:4px;
                cursor:pointer;
                title='${dateStr}: ${Math.round(seconds / 60)} min'
            "></div>`;
        });
    });

    html += '</div>';
    container.innerHTML = html;
}

function renderCompletionStats() {
    const container = document.getElementById('stats-container');
    if (!container || !completionStats) return;

    container.innerHTML = `
        <div style="padding:20px;border-top:1px solid var(--line);">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                <span style="font-size:13px;color:var(--text-2);">Task Completion</span>
                <span style="font-size:13px;font-weight:700;color:var(--session);">
                    ${Math.round(completionStats.rate)}%
                </span>
            </div>
            <div style="height:4px;background:var(--layer2);border-radius:99px;overflow:hidden;">
                <div style="height:100%;background:var(--session);width:${completionStats.rate}%;"></div>
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:8px;">
                ${completionStats.completed} of ${completionStats.total} tasks completed
            </div>
        </div>
    `;
}

// Load on init
document.addEventListener('DOMContentLoaded', loadAnalytics);
