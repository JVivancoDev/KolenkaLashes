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
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ALL_TIMES = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
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
      `${year}-${String(month + 1).padStart(2, "0")}-05`,
      `${year}-${String(month + 1).padStart(2, "0")}-12`,
      `${year}-${String(month + 1).padStart(2, "0")}-19`
    ]);
    renderCalendar();
    return;
  }
  try {
    const url = `${APPS_SCRIPT_URL}?action=getBlocked&year=${year}&month=${month + 1}`;
    const res = await fetch(url);
    const data = await res.json();
    blockedDates = new Set(data.blockedDates || []);
  } catch (e) {
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
    bookedTimes = new Set(["10:00", "14:00"]);
    await delayMin(start, 400);
    renderTimes();
    return;
  }

  try {
    const url = `${APPS_SCRIPT_URL}?action=getBookedTimes&date=${dateStr}`;
    const res = await fetch(url);
    const data = await res.json();
    bookedTimes = new Set(data.bookedTimes || []);
  } catch (e) {
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
  const today = new Date(); today.setHours(0, 0, 0, 0);

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
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = date.getTime() === today.getTime();
    const isPast = date < today;
    const isBlocked = blockedDates.has(dateStr);
    const isSunday = date.getDay() === 0;
    const isSel = selectedDate && selectedDate.str === dateStr;

    if (isSunday) {
      el.className = "cal-day unavailable sunday";
    } else if (isPast || isBlocked) {
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

  // Capturamos el día de hoy para comparar
  const rightNow = new Date();
  const todayStr = `${rightNow.getFullYear()}-${String(rightNow.getMonth() + 1).padStart(2, "0")}-${String(rightNow.getDate()).padStart(2, "0")}`;

  // Verificamos si el usuario seleccionó el día de hoy
  const isTodaySelected = selectedDate && selectedDate.str === todayStr;
  const currentHour = rightNow.getHours(); // Hora en formato 0-23

  ALL_TIMES.forEach(t => {
    const slot = document.createElement("div");

    // Obtenemos el número de la hora del slot (ej: "09:00" -> 9)
    const slotHour = parseInt(t.split(":")[0], 10);

    // El slot está ocupado si: 
    // 1. Viene bloqueado del servidor OR
    // 2. Es el día de hoy Y la hora del slot ya pasó (o es la hora actual)
    const isPastTimeToday = isTodaySelected && (slotHour <= currentHour);
    const isBusy = bookedTimes.has(t) || isPastTimeToday;

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
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
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
  const name = document.getElementById("f-name").value;
  const phone = document.getElementById("f-phone").value;
  const service = document.getElementById("f-service").value;
  const isFirst = document.getElementById("f-first").value;
  const notes = document.getElementById("f-notes").value;
  const btn = document.getElementById("btn-confirm");

  // Limpieza básica
  const cleanName = name.replace(/[<>]/g, "").trim();
  const cleanPhone = phone.replace(/[<>]/g, "").trim();
  const cleanNotes = notes.replace(/[<>]/g, "").trim();

  // Validaciones unificadas
  const phoneRegex = /^\+569\d{8}$/;

  if (!cleanName) {
    setStatus("Por favor ingresa tu nombre.", "err");
    return;
  }
  if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
    setStatus("Teléfono inválido. Usa formato +569XXXXXXXX", "err");
    return;
  }
  if (!service) {
    setStatus("Por favor selecciona un servicio.", "err");
    return;
  }
  if (!selectedDate) {
    setStatus("Por favor selecciona una fecha.", "err");
    return;
  }
  if (!selectedTime) {
    setStatus("Por favor selecciona un horario.", "err");
    return;
  }

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
  } catch (e) {
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

// ── FETCH SERVICES JSON ──
// ── FETCH SERVICES JSON ──
async function loadServices() {
  try {
    const res = await fetch('data/services.json');
    const services = await res.json();

    const grid = document.getElementById('services-grid');
    const select = document.getElementById('f-service');

    if (!grid || !select) return; // Previene errores si estamos en admin.html

    services.forEach(srv => {
      // 1. Lógica para el precio en la Tarjeta
      let priceHTML = '';
      if (srv.priceRetoque) {
        // Si tiene retoque, dibujamos la estructura doble
        priceHTML = `
          <div class="service-price-dual">
            <div><span>Postura</span>$${srv.price} <small>CLP</small></div>
            <div><span>Retoque</span>$${srv.priceRetoque} <small>CLP</small></div>
          </div>
        `;
      } else {
        // Si no tiene retoque, dibujamos el precio normal
        priceHTML = `<div class="service-price">$${srv.price} <span>CLP</span></div>`;
      }

      const card = document.createElement('div');
      card.className = 'service-card';
      card.innerHTML = `
        <svg class="service-icon" viewBox="0 0 36 36" fill="none">
          ${srv.icon}
        </svg>
        <h3 class="service-name">${srv.name}</h3>
        <p class="service-desc">${srv.desc}</p>
        ${priceHTML}
      `;
      grid.appendChild(card);

      // 2. Lógica para el Selector en la sección de Agenda
      if (srv.priceRetoque) {
        // Agrega opción Postura
        const optPostura = document.createElement('option');
        optPostura.value = `${srv.name} (Postura) — $${srv.price}`;
        optPostura.textContent = `${srv.name} (Postura) — $${srv.price}`;
        select.appendChild(optPostura);

        // Agrega opción Retoque
        const optRetoque = document.createElement('option');
        optRetoque.value = `${srv.name} (Retoque) — $${srv.priceRetoque}`;
        optRetoque.textContent = `${srv.name} (Retoque) — $${srv.priceRetoque}`;
        select.appendChild(optRetoque);
      } else {
        // Agrega la opción normal única
        const option = document.createElement('option');
        option.value = `${srv.name} — $${srv.price}`;
        option.textContent = `${srv.name} — $${srv.price}`;
        select.appendChild(option);
      }
    });
  } catch (e) {
    console.warn("No se pudieron cargar los servicios dinámicos:", e);
  }
}

// INIT
loadAvailability(currentYear, currentMonth);
loadServices();