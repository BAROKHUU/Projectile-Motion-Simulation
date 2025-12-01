// --- 1. Global variables & State ---
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const g = 9.8;

let viewport = { scale: 4, offsetX: 50, offsetY: 50, isDragging: false, lastMouseX: 0, lastMouseY: 0 };
let projectiles = [];
let animationId;

let isRunning = false;
let isPaused = false;
let startTime = 0;
let totalPausedTime = 0;
let lastPauseStart = 0;
let currentTimeDisplay = 0;

let hoverData = null;

function resizeCanvas() {
    canvas.width = document.getElementById('simulation-area').clientWidth;
    canvas.height = document.getElementById('simulation-area').clientHeight;
    requestRedraw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- 2. PHYSICAL LOGIC ---
function getFullPhysicsAtTime(p, t) {
    const time = Math.min(t, p.t_flight);
    const x = p.v0x * time;
    const y = p.h0 + p.v0y * time - 0.5 * g * time * time;

    const vx = p.v0x;
    const vy = p.v0y - g * time;
    const v = Math.sqrt(vx*vx + vy*vy);

    // Tangential & Normal acceleration
    const ax = 0;
    const ay = -g;

    let at = 0;
    let an = 0;

    if (v > 0.0001) {
        at = (vx * ax + vy * ay) / v;
        an = Math.abs(vx * ay - vy * ax) / v;
    } else {
        at = 0;
        an = g;
    }

    return { x, y, v, at, an, time };
}

function toCanvasCoords(x, y) {
    return {
        x: x * viewport.scale + viewport.offsetX,
        y: canvas.height - (y * viewport.scale) - viewport.offsetY
    };
}

// --- 3. LOGIC CONTROL ---
function startSimulation() {
    if (projectiles.length === 0) { alert("Please add an object first!"); return; }

    isRunning = true;
    isPaused = false;
    startTime = performance.now();
    totalPausedTime = 0;
    currentTimeDisplay = 0;

    document.getElementById('btn-pause').style.display = 'block';
    document.getElementById('btn-pause').innerHTML = '⏸ PAUSE';
    document.getElementById('btn-pause').classList.remove('paused');
    document.getElementById('status-text').innerText = "Running...";
    document.getElementById('status-text').style.color = "#4db8ff";

    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(animate);
}

function togglePause() {
    if (!isRunning) return;

    isPaused = !isPaused;
    const btn = document.getElementById('btn-pause');

    if (isPaused) {
        lastPauseStart = performance.now();
        btn.innerHTML = '▶ RESUME';
        btn.classList.add('paused');
        document.getElementById('status-text').innerText = "Paused";
        document.getElementById('status-text').style.color = "#ffc107";
    } else {
        totalPausedTime += (performance.now() - lastPauseStart);
        btn.innerHTML = '⏸ PAUSE';
        btn.classList.remove('paused');
        document.getElementById('status-text').innerText = "Running...";
        document.getElementById('status-text').style.color = "#4db8ff";
    }
}

function resetAll() {
    isRunning = false;
    isPaused = false;
    projectiles = [];
    currentTimeDisplay = 0;
    renderUIList();
    requestRedraw();
    document.getElementById('info-t').innerText = "0.00 s";
    document.getElementById('btn-pause').style.display = 'none';
    document.getElementById('status-text').innerText = "Cleared";
    document.getElementById('status-text').style.color = "#aaa";
}

function animate(timestamp) {
    if (!isRunning) return;

    if (!isPaused) {
        const elapsedMS = timestamp - startTime - totalPausedTime;
        currentTimeDisplay = elapsedMS / 1000;
    }

    drawScene(currentTimeDisplay);
    document.getElementById('info-t').innerText = currentTimeDisplay.toFixed(2) + " s";

    const maxTime = projectiles.length > 0 ? Math.max(...projectiles.map(p => p.t_flight)) : 0;

    if (currentTimeDisplay <= maxTime + 0.1 || isPaused) {
        animationId = requestAnimationFrame(animate);
    } else {
        isRunning = false;
        document.getElementById('status-text').innerText = "Complete!";
        document.getElementById('status-text').style.color = "#28a745";
        document.getElementById('btn-pause').style.display = 'none';
    }
}

function requestRedraw() {
    drawScene(currentTimeDisplay);
}

// --- 5. DRAWING & LABEL SYSTEM (UPDATED: AT & AN) ---
function drawLiveStats(ctx, screenPos, phys, color) {
    const x = screenPos.x + 12;
    const y = screenPos.y - 60;

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x, y, 95, 76, 4);
    else ctx.rect(x, y, 95, 76);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.font = "bold 11px Consolas";
    ctx.textAlign = "left";

    const lh = 14;

    ctx.fillText(`h: ${phys.y.toFixed(2)}m`, x + 6, y + 14);
    ctx.fillText(`v: ${phys.v.toFixed(2)}m/s`, x + 6, y + 14 + lh);

    ctx.fillStyle = "#d63384";
    ctx.fillText(`a_t:${phys.at.toFixed(2)}m/s²`, x + 6, y + 14 + lh*2);

    ctx.fillStyle = "#0d6efd";
    ctx.fillText(`a_n:${phys.an.toFixed(2)}m/s²`, x + 6, y + 14 + lh*3);

    ctx.fillStyle = "#000";
    ctx.fillText(`range: ${phys.x.toFixed(2)}m`, x + 6, y + 14 + lh*4);
}

function drawScene(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath(); 
    ctx.strokeStyle = '#ddd'; 
    ctx.lineWidth = 1;
    const origin = toCanvasCoords(0, 0);
    ctx.moveTo(0, origin.y); ctx.lineTo(canvas.width, origin.y);
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();

    const showLabels = document.getElementById('show-labels').checked;

    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;

        const step = 0.1;
        for(let time=0; time<=p.t_flight; time+=step) {
            const pos = getFullPhysicsAtTime(p, time);
            const sc = toCanvasCoords(pos.x, pos.y);
            if(time===0) ctx.moveTo(sc.x, sc.y);
            else ctx.lineTo(sc.x, sc.y);
        }

        const endP = getFullPhysicsAtTime(p, p.t_flight);
        const endSc = toCanvasCoords(endP.x, endP.y);
        ctx.lineTo(endSc.x, endSc.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const curP = getFullPhysicsAtTime(p, t);
        const curSc = toCanvasCoords(curP.x, curP.y);

        ctx.beginPath();
        ctx.arc(curSc.x, curSc.y, 6, 0, Math.PI*2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = "white"; 
        ctx.lineWidth = 2; 
        ctx.stroke();

        if (showLabels) {
            drawLiveStats(ctx, curSc, curP, p.color);
        }
    });
}

// --- 6. MOUSE HANDLING ---
canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - viewport.offsetX) / viewport.scale;
    const worldY = (canvas.height - mouseY - viewport.offsetY) / viewport.scale;

    const zoomIntensity = 0.1;
    if (e.deltaY < 0) viewport.scale *= (1 + zoomIntensity);
    else viewport.scale /= (1 + zoomIntensity);
    viewport.scale = Math.max(0.5, Math.min(viewport.scale, 100));

    viewport.offsetX = mouseX - worldX * viewport.scale;
    viewport.offsetY = (canvas.height - mouseY) - worldY * viewport.scale;
    requestRedraw();
});

canvas.addEventListener('mousedown', function(e) {
    viewport.isDragging = true;
    viewport.lastMouseX = e.offsetX;
    viewport.lastMouseY = e.offsetY;
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', function() {
    viewport.isDragging = false;
    canvas.style.cursor = 'default';
});

canvas.addEventListener('mousemove', function(e) {
    if (viewport.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        viewport.offsetX += (mouseX - viewport.lastMouseX);
        viewport.offsetY -= (mouseY - viewport.lastMouseY);
        viewport.lastMouseX = mouseX;
        viewport.lastMouseY = mouseY;
        requestRedraw();
    }
});

// --- 7. Data Management ---
function addObject() {
    const v0 = parseFloat(document.getElementById('v0').value);
    const angle = parseFloat(document.getElementById('angle').value);
    const h0 = parseFloat(document.getElementById('h0').value);
    const color = `hsl(${Math.random() * 360}, 75%, 50%)`;

    const angleRad = angle * Math.PI / 180;
    const v0x = v0 * Math.cos(angleRad);
    const v0y = v0 * Math.sin(angleRad);
    const delta = v0y*v0y - 4*(-0.5*g)*h0;
    const t_flight = (-v0y - Math.sqrt(delta)) / (2 * (-0.5 * g));

    projectiles.push({ id: Date.now(), v0, h0, angle, v0x, v0y, t_flight, color });
    renderUIList();
    requestRedraw();
}

function removeObject(id) {
    projectiles = projectiles.filter(p => p.id !== id);
    renderUIList();
    requestRedraw();
}

function renderUIList() {
    const container = document.getElementById('object-list-container');
    if (projectiles.length === 0) {
        container.innerHTML = '<div style="color:#999;font-style:italic;text-align:center;padding:20px;">No objects yet.</div>';
        return;
    }
    let html = '';
    projectiles.forEach((p, index) => {
        html += `
            <div class="object-item" style="border-left-color: ${p.color}">
                <span class="remove-btn" onclick="removeObject(${p.id})">&times;</span>
                <strong>#${index+1}</strong>: v0=${p.v0} (m/s), θ: ${p.angle}°, h0=${p.h0}
            </div>`;
    });
    container.innerHTML = html;
}

requestRedraw();
