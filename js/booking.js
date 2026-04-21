// ─────────────────────────────────────────────
// CONFIGURACIÓN — reemplaza esta URL con la de
// tu Google Apps Script una vez desplegado
// ─────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxVMtgIUKI8iglnTfi29YPA5kcJ1F-4Aj9G4Du93wSbXVMm-4vr-i2M7FP0H3wTPiYMAw/exec";

// ── ACCORDION ──
function toggleAcc(btn) {
  const item = btn.closest("[data-acc]");
  const body = item.querySelector(".accordion-body");
  const isOpen = item.classList.contains("open");
  document.querySelectorAll("[data-acc]").forEach(i => {
    i.classList.remove("open");
    i.querySelector(".accordion-body").style.maxHeight = "0";
  });
  if (!isOpen) {
    item.classList.add("open");
    body.style.maxHeight = body.scrollHeight + "px";
  }
}

// ── CALENDAR STATE ──
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const ALL_TIMES = ["09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00"];
let now = new Date();
let currentYear = now.getFullYear();
let currentMonth = now.getMonth();
let selectedDate = null;
let selectedTime = null;
// Días bloqueados del servidor (se cargan dinámicamente)
// Formato: "YYYY-MM-DD" strings
let blockedDates = new Set();
// Horas ya ocupadas para la fecha seleccionada
let bookedTimes = new Set();

// ── FETCH DISPONIBILIDAD DESDE APPS SCRIPT ──
async function loadAvailability(year, month) {
  document.getElementById("cal-grid").innerHTML = '<div class="cal-loading">Cargando disponibilidad...</div>';
  if (APPS_SCRIPT_URL === "REEMPLAZA_CON_TU_URL_DE_APPS_SCRIPT") {
    // MODO DEMO: simula datos sin conectar al script
    blockedDates = new Set([
      `${year}-${String(month+1).padStart(2,"0")}-05`,
      `${year}-${String(month+1).padStart(2,"0")}-12`,
      `${year}-${String(month+1).padStart(2,"0")}-19`
    ]);
    renderCalendar();
    return;
  }
  try {
    const url = `${APPS_SCRIPT_URL}?action=getBlocked&year=${year}&month=${month+1}`;
    const res = await fetch(url);
    const data = await res.json();
    blockedDates = new Set(data.blockedDates || []);
  } catch(e) {
    console.warn("No se pudo cargar disponibilidad:", e);
    blockedDates = new Set();
  }
  renderCalendar();
}

async function loadTimesForDate(dateStr) {
  const start = Date.now();

  document.getElementById("time-slots-wrap").style.display = "block";
  document.getElementById("time-grid").innerHTML = `
    <div class="cal-loading">
      <div class="loader"></div>
      <span>Cargando horarios...</span>
    </div>
  `;

  if (APPS_SCRIPT_URL === "REEMPLAZA_CON_TU_URL_DE_APPS_SCRIPT") {
    bookedTimes = new Set(["10:00","14:00"]);
    await delayMin(start, 400);
    renderTimes();
    return;
  }

  try {
    const url = `${APPS_SCRIPT_URL}?action=getBookedTimes&date=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();
    bookedTimes = new Set(data.bookedTimes || []);
  } catch(e) {
    bookedTimes = new Set();
  }

  await delayMin(start, 400);
  renderTimes();
}

function delayMin(startTime, minMs) {
  const elapsed = Date.now() - startTime;
  if (elapsed >= minMs) return Promise.resolve();
  return new Promise(res => setTimeout(res, minMs - elapsed));
}

// ── RENDER CALENDAR ──
function renderCalendar() {
  document.getElementById("cal-month-label").textContent = MONTHS[currentMonth] + " " + currentYear;
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < offset; i++) {
    const el = document.createElement("div");
    el.className = "cal-day other-month";
    const prev = new Date(currentYear, currentMonth, 0).getDate();
    el.textContent = prev - offset + 1 + i;
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const el = document.createElement("div");
    const date = new Date(currentYear, currentMonth, day);
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const isToday = date.getTime() === today.getTime();
    const isPast = date < today;
    const isBlocked = blockedDates.has(dateStr);
    const isSunday = date.getDay() === 0;
    const isSel = selectedDate && selectedDate.str === dateStr;

    if (isPast || isBlocked || isSunday) {
      el.className = "cal-day unavailable";
    } else {
      el.className = "cal-day available" + (isToday ? " today" : "") + (isSel ? " selected" : "");
      el.onclick = () => selectDay(day, dateStr, el);
    }
    el.textContent = day;
    grid.appendChild(el);
  }
}

function selectDay(day, dateStr, el) {
  document.querySelectorAll(".cal-day").forEach(d => d.classList.remove("selected"));
  el.classList.add("selected");

  selectedDate = { day, str: dateStr, month: currentMonth, year: currentYear };
  selectedTime = null;

  updateSummary();

  // 👇 feedback inmediato
  document.getElementById("time-grid").innerHTML = `
    <div class="cal-loading">
      <div class="loader"></div>
      <span>Buscando horarios disponibles...</span>
    </div>
  `;

  loadTimesForDate(dateStr);
}

function renderTimes() {
  const grid = document.getElementById("time-grid");
  grid.innerHTML = "";
  ALL_TIMES.forEach(t => {
    const slot = document.createElement("div");
    const isBusy = bookedTimes.has(t);
    slot.className = "time-slot" + (isBusy ? " busy" : "");
    slot.textContent = t;
    if (!isBusy) {
      slot.onclick = () => {
        document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
        slot.classList.add("selected");
        selectedTime = t;
        updateSummary();
      };
    }
    grid.appendChild(slot);
  });
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  loadAvailability(currentYear, currentMonth);
}

// ── SUMMARY ──
function updateSummary() {
  const el = document.getElementById("agenda-summary");
  if (!selectedDate) {
    el.innerHTML = '<span style="color:rgba(250,249,247,0.3); font-style:italic; font-size:12px;">Selecciona una fecha y hora para ver el resumen.</span>';
    return;
  }
  const dateLabel = selectedDate.day + " de " + MONTHS[selectedDate.month] + " " + selectedDate.year;
  const timeLabel = selectedTime ? selectedTime + " hrs" : '<em style="color:rgba(250,249,247,0.3)">Elige un horario</em>';
  el.innerHTML = `<strong>Fecha:</strong> ${dateLabel}<br><strong>Hora:</strong> ${timeLabel}`;
}

// ── CONFIRM BOOKING ──
async function confirmBook() {

    const name = document.getElementById("f-name").value.trim();
    const phone = document.getElementById("f-phone").value.trim();
    const service = document.getElementById("f-service").value;
    const isFirst = document.getElementById("f-first").value;
    const notes = document.getElementById("f-notes").value.trim();
    const status = document.getElementById("form-status");
    const btn = document.getElementById("btn-confirm");

    // Regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+569\d{8}$/;

    // Limpieza básica
    const clean = (str) => str.replace(/[<>]/g, "").trim();
    const cleanName = clean(name);
    const cleanPhone = clean(phone);
    const cleanNotes = clean(notes);

    // Validaciones
    if (!cleanName) {
        setStatus("Por favor ingresa tu nombre.", "err");
        return;
    }

    if (!phoneRegex.test(cleanPhone)) {
        setStatus("Teléfono inválido. Usa formato +569XXXXXXXX", "err");
        return;
    }

    const emailInput = document.getElementById("f-email");
    if (emailInput && emailInput.value) {
        if (!emailRegex.test(emailInput.value)) {
            setStatus("Email inválido.", "err");
            return;
        }
    }

    if (!name)    { setStatus("Por favor ingresa tu nombre.", "err"); return; }
    if (!phone)   { setStatus("Por favor ingresa tu teléfono.", "err"); return; }
    if (!service) { setStatus("Por favor selecciona un servicio.", "err"); return; }
    if (!selectedDate) { setStatus("Por favor selecciona una fecha.", "err"); return; }
    if (!selectedTime) { setStatus("Por favor selecciona un horario.", "err"); return; }

    // const payload = { action: "book", name, phone, service, isFirst, notes, date: selectedDate.str, time: selectedTime };
    const payload = {
        action: "book",
        name: cleanName,
        phone: cleanPhone,
        service,
        isFirst,
        notes: cleanNotes,
        date: selectedDate.str,
        time: selectedTime
    };

    if (APPS_SCRIPT_URL === "REEMPLAZA_CON_TU_URL_DE_APPS_SCRIPT") {
        // MODO DEMO
        showModal(name, service.split(" —")[0], selectedDate, selectedTime, phone);
        return;
    }

    btn.disabled = true;
    btn.textContent = "Reservando...";
    setStatus("Enviando reserva...", "");
    try {
        const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            
            // 🧠 1. Guardar hora antes de resetear
            const bookedTime = selectedTime;

            // 🔒 2. Bloquear botón
            btn.disabled = true;
            btn.textContent = "Reservado ✔";

            // 🧹 3. Limpiar selección visual
            selectedTime = null;
            document.querySelectorAll(".time-slot")
                .forEach(el => el.classList.remove("selected"));

            // 🔄 4. Recargar horarios (esto actualiza los slots)
            await loadTimesForDate(selectedDate.str);

            // 📅 5. Re-render calendario (esto bloquea el día si queda full)
            renderCalendar();

            // 💬 6. Mostrar modal (usa bookedTime, NO selectedTime)
            showModal(cleanName, service, selectedDate, bookedTime, cleanPhone);

            // 🧽 7. Limpiar formulario
            document.getElementById("f-name").value = "";
            document.getElementById("f-phone").value = "";
            document.getElementById("f-notes").value = "";

            // 🧠 8. Reset estado (opcional pero recomendado)
            selectedDate = null;
            updateSummary();

            // 🎯 9. Mensaje
            setStatus("Reserva confirmada ✨", "ok");

            } else {
            setStatus(data.error || "Error al reservar", "err");
            }
    } catch(e) {
        setStatus("Error de conexión. Intenta de nuevo.", "err");
    } finally {
        btn.disabled = false;
        btn.textContent = "Confirmar reserva";
    }
}

function setStatus(msg, type) {
  const el = document.getElementById("form-status");
  el.textContent = msg;
  el.className = "form-status " + type;
}

function showModal(name, service, date, time, phone) {
  const dateLabel = date.day + " de " + MONTHS[date.month] + " " + date.year;
  document.getElementById("modal-text").innerHTML =
    `<strong>${name}</strong>, tu solicitud para <strong>${service}</strong> el <strong>${dateLabel} a las ${time}</strong> fue enviada. Te confirmamos por WhatsApp al ${phone}.`;
  document.getElementById("modal-bg").classList.add("active");
}

function closeModal(e) {
  if (e === null || e.target === document.getElementById("modal-bg"))
    document.getElementById("modal-bg").classList.remove("active");
}

// ── SCROLL HEADER ──
window.addEventListener("scroll", () => {
  document.querySelector("header").style.borderBottomColor =
    window.scrollY > 20 ? "rgba(0,0,0,0.1)" : "var(--gray-light)";
});

// INIT
loadAvailability(currentYear, currentMonth);