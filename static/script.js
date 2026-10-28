/**
 * DeadlockOS - Frontend Controller & SVG Graph Engine
 * Real-time monitoring, WFG visualization, and simulation management
 */

// API Endpoints
const API = {
    state: '/state',
    start: '/start',
    pause: '/pause',
    resume: '/resume',
    reset: '/reset',
    detect: '/detect',
    resolve: '/resolve'
};

// State Cache
let lastCyclesCount = 0;
let pollTimer = null;
let isUserInteracting = false;

// DOM Elements
const elements = {
    // Buttons
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnReset: document.getElementById('btnReset'),
    btnDetect: document.getElementById('btnDetect'),
    btnResolve: document.getElementById('btnResolve'),
    btnClearLog: document.getElementById('btnClearLog'),
    
    // Selects
    scenarioSelect: document.getElementById('scenarioSelect'),
    recoveryStrategy: document.getElementById('recoveryStrategy'),
    
    // Status & KPI
    globalStatusPill: document.getElementById('globalStatusPill'),
    globalStatusText: document.getElementById('globalStatusText'),
    currentScenarioBadge: document.getElementById('currentScenarioBadge'),
    kpiActiveThreads: document.getElementById('kpiActiveThreads'),
    kpiWaitingThreads: document.getElementById('kpiWaitingThreads'),
    kpiDeadlocksDetected: document.getElementById('kpiDeadlocksDetected'),
    kpiDeadlocksResolved: document.getElementById('kpiDeadlocksResolved'),
    
    // Graph
    wfgCanvas: document.getElementById('wfgCanvas'),
    graphEdgesLayer: document.getElementById('graphEdgesLayer'),
    graphNodesLayer: document.getElementById('graphNodesLayer'),
    graphEmptyNotice: document.getElementById('graphEmptyNotice'),
    
    // Tables & Panels
    threadTableBody: document.getElementById('threadTableBody'),
    resourceTilesContainer: document.getElementById('resourceTilesContainer'),
    eventLogContainer: document.getElementById('eventLogContainer'),
    toastContainer: document.getElementById('toastContainer'),
    
    // Mobile Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    navLinks: document.querySelectorAll('.nav-link')
};

// -------------------------------------------------------------
// Initialization & Polling
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchState();
    startPolling();
});

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchState, 750);
}

function initEventListeners() {
    elements.btnStart.addEventListener('click', handleStart);
    elements.btnPause.addEventListener('click', handlePause);
    elements.btnResume.addEventListener('click', handleResume);
    elements.btnReset.addEventListener('click', handleReset);
    elements.btnDetect.addEventListener('click', handleDetect);
    elements.btnResolve.addEventListener('click', handleResolve);
    elements.btnClearLog.addEventListener('click', () => {
        elements.eventLogContainer.innerHTML = '';
    });

    if (elements.sidebarToggle) {
        elements.sidebarToggle.addEventListener('click', () => {
            elements.sidebar.classList.toggle('open');
        });
    }

    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            if (window.innerWidth < 860 && elements.sidebar) {
                elements.sidebar.classList.remove('open');
            }
        });
    });

    elements.scenarioSelect.addEventListener('change', (e) => {
        const scenario = e.target.value;
        elements.currentScenarioBadge.textContent = scenario === 'deadlock' 
            ? 'Scenario: Circular Wait Deadlock' 
            : 'Scenario: Hierarchical Ordering (Normal)';
    });
}

// -------------------------------------------------------------
// API Calls
// -------------------------------------------------------------
async function fetchState() {
    try {
        const response = await fetch(API.state);
        if (!response.ok) return;
        const data = await response.json();
        updateDashboard(data);
    } catch (err) {
        console.warn('Simulation state fetch failed:', err);
    }
}

async function handleStart() {
    const scenario = elements.scenarioSelect.value;
    try {
        const res = await fetch(API.start, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenario })
        });
        const data = await res.json();
        showToast(`Simulation started (${scenario === 'deadlock' ? 'Deadlock Demo' : 'Normal Execution'})`, 'info');
        fetchState();
    } catch (err) {
        showToast('Failed to start simulation', 'error');
    }
}

async function handlePause() {
    try {
        await fetch(API.pause, { method: 'POST' });
        showToast('Simulation paused', 'info');
        fetchState();
    } catch (err) {
        showToast('Error pausing simulation', 'error');
    }
}

async function handleResume() {
    try {
        await fetch(API.resume, { method: 'POST' });
        showToast('Simulation resumed', 'info');
        fetchState();
    } catch (err) {
        showToast('Error resuming simulation', 'error');
    }
}

async function handleReset() {
    try {
        await fetch(API.reset, { method: 'POST' });
        showToast('Simulation reset to initial state', 'info');
        fetchState();
    } catch (err) {
        showToast('Error resetting simulation', 'error');
    }
}

async function handleDetect() {
    try {
        const res = await fetch(API.detect, { method: 'POST' });
        const data = await res.json();
        if (data.deadlock) {
            showToast(data.message, 'error');
        } else {
            showToast(data.message, 'success');
        }
        fetchState();
    } catch (err) {
        showToast('Error executing deadlock detector', 'error');
    }
}

async function handleResolve(customVictim = null) {
    const strategy = elements.recoveryStrategy.value;
    let victim = customVictim;

    if (!victim && strategy === 'manual') {
        victim = prompt('Enter the Thread ID to terminate (e.g., T1, T2, T3):');
        if (!victim) return;
        victim = victim.trim().toUpperCase();
    }

    try {
        const res = await fetch(API.resolve, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy, victim })
        });
        const data = await res.json();
        if (data.status === 'resolved') {
            showToast(data.message, 'success');
        } else {
            showToast(data.message || 'No deadlock to resolve', 'info');
        }
        fetchState();
    } catch (err) {
        showToast('Error resolving deadlock', 'error');
    }
}

// -------------------------------------------------------------
// Dashboard View Renderers
// -------------------------------------------------------------
function updateDashboard(data) {
    // 1. Status Pill & Badge
    updateStatusPill(data.status);
    
    // 2. Metrics (KPIs)
    elements.kpiActiveThreads.textContent = data.stats.active_threads;
    elements.kpiWaitingThreads.textContent = data.stats.waiting_threads;
    elements.kpiDeadlocksDetected.textContent = data.stats.deadlocks_detected;
    elements.kpiDeadlocksResolved.textContent = data.stats.deadlocks_resolved;

    // Toast alert on new deadlock discovery
    if (data.cycles.length > 0 && lastCyclesCount === 0) {
        const cycleStr = data.cycles[0].join(' → ') + ' → ' + data.cycles[0][0];
        showToast(`Deadlock Detected: ${cycleStr}`, 'error');
    }
    lastCyclesCount = data.cycles.length;

    // 3. Render Wait-for Graph (WFG)
    renderWaitForGraph(data.threads, data.graph, data.cycles, data.cycle_edges);

    // 4. Render Thread Monitoring Table
    renderThreadTable(data.threads);

    // 5. Render Resource Tiles (Mutex locks)
    renderResourceTiles(data.locks);

    // 6. Render Event Stream
    renderEventLogs(data.log);
}

function updateStatusPill(status) {
    elements.globalStatusText.textContent = status;
    elements.globalStatusPill.className = 'status-pill';
    
    switch (status) {
        case 'Running':
            elements.globalStatusPill.classList.add('status-running');
            break;
        case 'Deadlocked':
            elements.globalStatusPill.classList.add('status-deadlocked');
            break;
        case 'Resolved':
            elements.globalStatusPill.classList.add('status-resolved');
            break;
        case 'Paused':
            elements.globalStatusPill.classList.add('status-paused');
            break;
        default:
            elements.globalStatusPill.classList.add('status-idle');
            break;
    }
}

// -------------------------------------------------------------
// Live SVG Graph Visualization
// -------------------------------------------------------------
function renderWaitForGraph(threads, edges, cycles, cycleEdges) {
    const edgesLayer = elements.graphEdgesLayer;
    const nodesLayer = elements.graphNodesLayer;
    const emptyNotice = elements.graphEmptyNotice;

    edgesLayer.innerHTML = '';
    nodesLayer.innerHTML = '';

    const threadNames = Object.keys(threads);
    if (threadNames.length === 0) {
        emptyNotice.style.opacity = '1';
        return;
    } else {
        emptyNotice.style.opacity = '0';
    }

    // Geometry layout: Arrange thread nodes uniformly in a circle or triangle
    const width = 700;
    const height = 360;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 115;

    const positions = {};
    const n = threadNames.length;

    threadNames.forEach((name, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        positions[name] = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    });

    // Check if an edge is part of a deadlock cycle
    const isCycleEdge = (u, v) => {
        return cycleEdges.some(ce => ce.from === u && ce.to === v);
    };

    // Cycle node set
    const cycleNodes = new Set();
    cycles.forEach(c => c.forEach(node => cycleNodes.add(node)));

    // 1. Draw Edges (Ti -> Tj)
    edges.forEach(edge => {
        const p1 = positions[edge.from];
        const p2 = positions[edge.to];
        if (!p1 || !p2) return;

        const isCycle = isCycleEdge(edge.from, edge.to);

        // Calculate control point for curved directional arrows
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Offset curvature
        const nx = -dy / dist;
        const ny = dx / dist;
        const curveOffset = 25;
        const cx = (p1.x + p2.x) / 2 + nx * curveOffset;
        const cy = (p1.y + p2.y) / 2 + ny * curveOffset;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`);
        path.setAttribute('class', `graph-edge ${isCycle ? 'edge-cycle' : ''}`);
        path.setAttribute('marker-end', isCycle ? 'url(#arrow-red)' : 'url(#arrow-blue)');
        edgesLayer.appendChild(path);

        // Optional resource badge on edge
        if (edge.resource) {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', cx);
            label.setAttribute('y', cy - 5);
            label.setAttribute('fill', isCycle ? '#ef4444' : '#38bdf8');
            label.setAttribute('font-size', '10px');
            label.setAttribute('font-family', 'JetBrains Mono');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = `wants ${edge.resource}`;
            edgesLayer.appendChild(label);
        }
    });

    // 2. Draw Nodes (Thread Circles + Labels)
    threadNames.forEach(name => {
        const pos = positions[name];
        const state = threads[name].state;
        const inCycle = cycleNodes.has(name);

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.style.cursor = 'pointer';
        group.setAttribute('title', `Click to target ${name} for manual termination`);
        group.addEventListener('click', () => {
            if (confirm(`Do you want to terminate victim thread ${name} to resolve deadlock?`)) {
                handleResolve(name);
            }
        });

        // Circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', 28);
        circle.setAttribute('class', `graph-node-circle ${inCycle ? 'node-cycle' : ''}`);
        if (state === 'Cancelled') {
            circle.style.stroke = '#64748b';
            circle.style.fill = '#111726';
            circle.style.strokeDasharray = '4';
        } else if (state === 'Completed') {
            circle.style.stroke = '#10b981';
            circle.style.fill = 'rgba(16, 185, 129, 0.15)';
        }
        group.appendChild(circle);

        // Main text: Thread ID
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y - 2);
        text.setAttribute('class', 'graph-node-text');
        text.textContent = name;
        group.appendChild(text);

        // Subtext: State
        const subtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        subtext.setAttribute('x', pos.x);
        subtext.setAttribute('y', pos.y + 13);
        subtext.setAttribute('class', 'graph-node-subtext');
        subtext.textContent = state;
        group.appendChild(subtext);

        nodesLayer.appendChild(group);
    });
}

// -------------------------------------------------------------
// Thread Monitoring Table Renderer
// -------------------------------------------------------------
function renderThreadTable(threads) {
    const tbody = elements.threadTableBody;
    const names = Object.keys(threads);

    if (names.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="text-align: center; padding: 1.5rem; color: #64748b;">No threads created yet. Click "Start Simulation".</td></tr>`;
        return;
    }

    let html = '';
    names.forEach(name => {
        const info = threads[name];
        const stateClass = `state-${info.state.toLowerCase()}`;
        const heldList = info.held.length > 0 ? info.held.join(', ') : 'None';
        const waitingFor = info.waiting_for ? info.waiting_for : 'None';
        const seqStr = info.sequence ? info.sequence.join(' → ') : '-';
        
        const canCancel = (info.state === 'Running' || info.state === 'Waiting');

        html += `
            <tr>
                <td><span class="thread-badge-id">${name}</span></td>
                <td><span class="state-badge ${stateClass}">${info.state}</span></td>
                <td><code style="color: #94a3b8; font-family: monospace;">${seqStr}</code></td>
                <td class="held-locks-cell">${heldList}</td>
                <td class="waiting-for-cell">${waitingFor}</td>
                <td>
                    ${canCancel ? `<button class="btn-table-action" onclick="handleResolve('${name}')" title="Cooperative cancellation">Terminate</button>` : `<span style="color: #64748b; font-size: 0.75rem;">Done</span>`}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// -------------------------------------------------------------
// Resource (Mutex Locks) Panel Renderer
// -------------------------------------------------------------
function renderResourceTiles(locks) {
    const container = elements.resourceTilesContainer;
    const rNames = Object.keys(locks);

    if (rNames.length === 0) {
        container.innerHTML = `<div style="color: #64748b; font-size: 0.82rem;">Resources uninitialized.</div>`;
        return;
    }

    let html = '';
    rNames.forEach(name => {
        const lock = locks[name];
        const isLocked = lock.owner !== null;
        const stateTag = isLocked 
            ? `<span class="resource-state-tag tag-locked">LOCKED</span>` 
            : `<span class="resource-state-tag tag-free">FREE</span>`;

        const ownerBadge = isLocked 
            ? `<span class="badge-thread">${lock.owner}</span>` 
            : `<span style="color: #64748b;">Available</span>`;

        const waitingText = lock.waiting.length > 0 
            ? lock.waiting.map(w => `<span class="waiting-list-text">${w}</span>`).join(', ') 
            : '<span style="color: #64748b;">None</span>';

        html += `
            <div class="resource-tile">
                <div class="resource-tile-header">
                    <div class="resource-id">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        <span>Resource ${name}</span>
                    </div>
                    ${stateTag}
                </div>
                <div class="resource-details">
                    <div class="resource-owner-box">
                        <span>Owner:</span>
                        ${ownerBadge}
                    </div>
                    <div>
                        <span>Wait Queue:</span>
                        ${waitingText}
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// -------------------------------------------------------------
// System Event Log Stream
// -------------------------------------------------------------
function renderEventLogs(logs) {
    const container = elements.eventLogContainer;
    if (!logs || logs.length === 0) {
        container.innerHTML = `<div style="color: #64748b; padding: 0.5rem;">Awaiting simulation activity...</div>`;
        return;
    }

    // Preserve scroll position if user scrolled up
    const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 30;

    let html = '';
    logs.forEach(entry => {
        html += `
            <div class="log-entry log-${entry.type}">
                <span class="log-time">[${entry.time}]</span>
                <span class="log-msg">${escapeHtml(entry.msg)}</span>
            </div>
        `;
    });
    container.innerHTML = html;

    if (isScrolledToBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// -------------------------------------------------------------
// Toast Notification Utility
// -------------------------------------------------------------
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'error') {
        iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
