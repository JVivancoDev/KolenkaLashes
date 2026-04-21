const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
let adminYear, adminMonth, selectedAdminDate = null, blockedSet = new Set();

// ── INIT ──
function init() {
  loadConfig();
  const now = new Date();
  adminYear  = now.getFullYear();
  adminMonth = now.getMonth();
  renderAdminCalendar();
}

// ── CONFIG ──
function loadConfig() {
  const url   = localStorage.getItem("kolenka_url") || "";
  const start = localStorage.getItem("kolenka_start") || "09:00";
  const end   = localStorage.getItem("kolenka_end")   || "19:00";
  document.getElementById("cfg-url").value   = url;
  document.getElementById("cfg-start").value = start;
  document.getElementById("cfg-end").value   = end;
  if (url) updateConnectionStatus(url);
}

function saveConfig() {
  const url   = document.getElementById("cfg-url").value.trim();
  const start = document.getElementById("cfg-start").value;
  const end   = document.getElementById("cfg-end").value;
  localStorage.setItem("kolenka_url",   url);
  localStorage.setItem("kolenka_start", start);
  localStorage.setItem("kolenka_end",   end);
  const el = document.getElementById("cfg-status");
  el.textContent = "Configuración guardada.";
  el.className = "status-msg ok";
  setTimeout(() => { el.textContent = ""; el.className = "status-msg"; }, 2500);
  if (url) { updateConnectionStatus(url); renderAdminCalendar(); }
}

function getScriptUrl() {
  return localStorage.getItem("kolenka_url") || "";
}

function updateConnectionStatus(url) {
  const el = document.getElementById("connection-status");
  el.textContent = "Verificando conexión...";
  fetch(url + "?action=ping")
    .then(r => r.json())
    .then(d => {
      el.textContent = d.ok ? "✓ Conectado a Apps Script" : "⚠ Error de conexión";
      el.style.color = d.ok ? "#7ecb9a" : "#e07070";
    })
    .catch(() => {
      el.textContent = "⚠ No se pudo conectar";
      el.style.color = "#e07070";
    });
}

// ── ADMIN CALENDAR ──
function adminChangeMonth(dir) {
  adminMonth += dir;
  if (adminMonth > 11) { adminMonth = 0; adminYear++; }
  if (adminMonth < 0)  { adminMonth = 11; adminYear--; }
  renderAdminCalendar();
}

async function renderAdminCalendar() {
  document.getElementById("admin-month-label").textContent =
    MONTHS_ES[adminMonth] + " " + adminYear;
  document.getElementById("admin-cal-grid").innerHTML =
    '<div style="grid-column:span 7; text-align:center; padding:2rem; color:var(--gray-mid); font-size:12px;">Cargando...</div>';

  const url = getScriptUrl();
  if (url) {
    try {
      const res = await fetch(`${url}?action=getBlocked&year=${adminYear}&month=${adminMonth + 1}`);
      const data = await res.json();
      blockedSet = new Set(data.blockedDates || []);
    } catch(e) {
      blockedSet = new Set();
    }
  } else {
    // Demo: bloquea algunos días
    blockedSet = new Set([
      `${adminYear}-${String(adminMonth+1).padStart(2,"0")}-05`,
      `${adminYear}-${String(adminMonth+1).padStart(2,"0")}-12`
    ]);
  }

  buildAdminGrid();
  updateStats();
}

function buildAdminGrid() {
  const grid = document.getElementById("admin-cal-grid");
  grid.innerHTML = "";

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(adminYear, adminMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(adminYear, adminMonth + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const el = document.createElement("div");
    el.className = "admin-day other";
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const el = document.createElement("div");
    const date = new Date(adminYear, adminMonth, day);
    const dateStr = `${adminYear}-${String(adminMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const isSunday  = date.getDay() === 0;
    const isPast    = date < today;
    const isBlocked = blockedSet.has(dateStr);
    const isToday   = date.getTime() === today.getTime();
    const isSel     = selectedAdminDate === dateStr;

    let cls = "admin-day";
    if (isSunday)  cls += " sunday";
    else if (isPast) cls += " past";
    else if (isBlocked) cls += " blocked";
    else cls += " available";
    if (isToday) cls += " today";
    if (isSel) el.style.outline = "2px solid #111110";

    el.className = cls;
    el.innerHTML = `<span class="day-num">${day}</span>`;

    if (!isSunday && !isPast) {
      el.onclick = () => selectAdminDay(dateStr, day, isBlocked);
    }
    grid.appendChild(el);
  }
}

async function selectAdminDay(dateStr, day, isCurrentlyBlocked) {
  selectedAdminDate = dateStr;
  buildAdminGrid();

  const detail = document.getElementById("day-detail");
  const title  = document.getElementById("detail-title");
  const list   = document.getElementById("booking-list");
  const btn    = document.getElementById("toggle-block-btn");
  const status = document.getElementById("block-status");

  detail.style.display = "block";
  status.textContent = "";
  title.textContent = day + " de " + MONTHS_ES[adminMonth] + " " + adminYear;

  btn.textContent = isCurrentlyBlocked ? "Desbloquear este día" : "Bloquear este día";
  btn.className   = isCurrentlyBlocked ? "block-day-btn unblock" : "block-day-btn block";

  list.innerHTML = '<div style="color:var(--gray-mid); font-size:12px; letter-spacing:0.06em;">Cargando reservas...</div>';

  const url = getScriptUrl();
  if (!url) {
    list.innerHTML = renderDemoBookings();
    return;
  }

  try {
    const res  = await fetch(`${url}?action=getBookedTimes&date=${dateStr}`);
    const data = await res.json();
    if (data.bookedTimes && data.bookedTimes.length > 0) {
      list.innerHTML = data.bookedTimes.map(t =>
        `<div class="booking-item">
          <span class="booking-time">${t}</span>
          <div class="booking-info"><strong>Reserva confirmada</strong><br><span>Ver detalles en Google Calendar</span></div>
        </div>`
      ).join("");
    } else {
      list.innerHTML = '<div style="color:var(--gray-mid); font-size:12px;">Sin reservas para este día.</div>';
    }
  } catch(e) {
    list.innerHTML = '<div style="color:var(--gray-mid); font-size:12px;">No se pudieron cargar las reservas.</div>';
  }

  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDemoBookings() {
  const demos = [
    { time: "09:00", name: "Ana Martínez", service: "Clásicas" },
    { time: "11:00", name: "Camila Rojas", service: "Volumen Ruso" },
    { time: "15:00", name: "Valentina López", service: "Relleno" }
  ];
  return demos.map(b =>
    `<div class="booking-item">
      <span class="booking-time">${b.time}</span>
      <div class="booking-info"><strong>${b.name}</strong><br><span>${b.service} (demo)</span></div>
    </div>`
  ).join("") + '<p style="margin-top:0.75rem; font-size:11px; color:var(--gray-mid);">Datos de ejemplo — conecta Apps Script para ver reservas reales.</p>';
}

// ── BLOQUEAR / DESBLOQUEAR ──
async function toggleBlock() {
  if (!selectedAdminDate) return;
  const isBlocked = blockedSet.has(selectedAdminDate);
  const btn    = document.getElementById("toggle-block-btn");
  const status = document.getElementById("block-status");

  btn.disabled = true;
  status.className = "status-msg";
  status.textContent = isBlocked ? "Desbloqueando..." : "Bloqueando...";

  const url = getScriptUrl();
  if (!url) {
    // Demo local
    if (isBlocked) blockedSet.delete(selectedAdminDate);
    else blockedSet.add(selectedAdminDate);
    buildAdminGrid();
    updateStats();
    btn.textContent = blockedSet.has(selectedAdminDate) ? "Desbloquear este día" : "Bloquear este día";
    btn.className   = blockedSet.has(selectedAdminDate) ? "block-day-btn unblock" : "block-day-btn block";
    status.textContent = isBlocked ? "Día disponible (demo)." : "Día bloqueado (demo).";
    status.className   = "status-msg ok";
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action: "blockDate", date: selectedAdminDate, block: !isBlocked })
    });
    const data = await res.json();
    if (data.success) {
      if (isBlocked) blockedSet.delete(selectedAdminDate);
      else blockedSet.add(selectedAdminDate);
      buildAdminGrid();
      updateStats();
      btn.textContent = blockedSet.has(selectedAdminDate) ? "Desbloquear este día" : "Bloquear este día";
      btn.className   = blockedSet.has(selectedAdminDate) ? "block-day-btn unblock" : "block-day-btn block";
      status.textContent = isBlocked ? "Día marcado como disponible." : "Día bloqueado correctamente.";
      status.className   = "status-msg ok";
    } else {
      status.textContent = data.error || "Error al guardar.";
      status.className   = "status-msg err";
    }
  } catch(e) {
    status.textContent = "Error de conexión.";
    status.className   = "status-msg err";
  } finally {
    btn.disabled = false;
  }
}

// ── STATS (simplificadas, sin llamada extra al servidor) ──
function updateStats() {
  const blockedCount = Array.from(blockedSet).filter(d => {
    const parts = d.split("-");
    return parseInt(parts[1]) - 1 === adminMonth && parseInt(parts[0]) === adminYear;
  }).length;
  document.getElementById("stat-blocked").textContent = blockedCount;
  // Las otras estadísticas requieren leer la hoja — se muestran demo
  document.getElementById("stat-month").textContent = "—";
  document.getElementById("stat-week").textContent  = "—";
  document.getElementById("stat-next").textContent  = "Ver Calendar";
}

init();