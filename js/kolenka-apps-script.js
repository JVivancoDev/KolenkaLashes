/**
 * KOLENKA LASHES — Google Apps Script Backend
 * ─────────────────────────────────────────────
 * INSTRUCCIONES DE INSTALACIÓN:
 *
 * 1. Ve a https://script.google.com → "Nuevo proyecto"
 * 2. Pega todo este código (reemplaza el contenido existente)
 * 3. En la línea CALENDAR_ID, pon el ID de tu Google Calendar
 *    (lo encuentras en Configuración del Calendario → "ID del calendario")
 * 4. Ajusta WORK_HOURS, APPOINTMENT_DURATION y TIMEZONE según necesites
 * 5. Haz clic en "Implementar" → "Nueva implementación"
 *    - Tipo: "Aplicación web"
 *    - Ejecutar como: "Yo"
 *    - Quién puede acceder: "Cualquier persona"
 * 6. Copia la URL que te entrega y pégala en la web (APPS_SCRIPT_URL)
 * 7. La primera vez pedirá permisos de acceso a Calendar — acéptalos
 */

// ─── CONFIGURACIÓN ───────────────────────────
const CALENDAR_ID   = "j.vivanco.astorga@gmail.com";        // ← tu Google Calendar
const TIMEZONE      = "America/Santiago";
const APPOINTMENT_DURATION = 90;                   // minutos por cita
const WORK_HOURS    = { start: 9, end: 19 };       // 09:00 a 19:00
const ALL_SLOTS     = ["09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00"];
const NOTIFY_EMAIL  = "j.vivanco.astorga@gmail.com";        // ← recibe email por cada reserva
const SHEET_NAME    = "Reservas";                  // hoja de registro

// ─── ROUTER PRINCIPAL ─────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    if (action === "getBlocked") {
      const year  = parseInt(e.parameter.year);
      const month = parseInt(e.parameter.month);
      result = getBlockedDates(year, month);

    } else if (action === "getBookedTimes") {
      const date = e.parameter.date; // "YYYY-MM-DD"
      result = getBookedTimes(date);

    } else if (action === "ping") {
      result = { ok: true };

    } else {
      result = { error: "Acción no reconocida" };
    }
  } catch(err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "book") {
      result = createBooking(payload);
    } else if (payload.action === "blockDate") {
      result = blockDate(payload.date, payload.block);
    } else {
      result = { error: "Acción no reconocida" };
    }
  } catch(err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── OBTENER FECHAS BLOQUEADAS ────────────────
// Devuelve los días del mes que están completamente bloqueados:
// ya sea marcados manualmente en la hoja "Bloqueados" o
// porque todos los horarios del día están ocupados en Calendar.
function getBlockedDates(year, month) {
  const blocked = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const manualBlocks = getManualBlocks();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const weekday = new Date(year, month - 1, day).getDay();

    // Bloquear domingos
    if (weekday === 0) { blocked.push(dateStr); continue; }
    // Bloquear días marcados manualmente
    if (manualBlocks.has(dateStr)) { blocked.push(dateStr); continue; }
    // Bloquear si todos los horarios están ocupados
    if (allTimesFull(dateStr)) { blocked.push(dateStr); }
  }

  return { blockedDates: blocked };
}

// ─── OBTENER HORAS OCUPADAS PARA UNA FECHA ───
function getBookedTimes(dateStr) {
  const parts = dateStr.split("-");
  const year  = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day   = parseInt(parts[2]);

  const start = new Date(year, month, day, WORK_HOURS.start, 0, 0);
  const end   = new Date(year, month, day, WORK_HOURS.end, 0, 0);

  const cal    = CalendarApp.getCalendarById(CALENDAR_ID);
  const events = cal.getEvents(start, end);
  const booked = new Set();

  events.forEach(ev => {
    const evStart = ev.getStartTime();
    const h = evStart.getHours();
    const m = evStart.getMinutes();
    const timeStr = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    if (ALL_SLOTS.includes(timeStr)) booked.add(timeStr);
  });

  return { bookedTimes: Array.from(booked) };
}

// ─── CREAR RESERVA ────────────────────────────
function createBooking(data) {
  const { name, phone, service, isFirst, notes, date, time } = data;

  // Validar que el horario sigue libre
  const current = getBookedTimes(date);
  if (current.bookedTimes.includes(time)) {
    return { success: false, error: "Este horario ya fue tomado. Por favor elige otro." };
  }

  const parts = date.split("-");
  const year  = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day   = parseInt(parts[2]);
  const [h, m] = time.split(":").map(Number);

  const startTime = new Date(year, month, day, h, m, 0);
  const endTime   = new Date(startTime.getTime() + APPOINTMENT_DURATION * 60000);

  const title       = `${name} — ${service.split(" —")[0]}`;
  const description = [
    `Clienta: ${name}`,
    `Teléfono: ${phone}`,
    `Servicio: ${service}`,
    `Primera vez: ${isFirst === "si" ? "Sí" : "No"}`,
    notes ? `Notas: ${notes}` : ""
  ].filter(Boolean).join("\n");

  // Crear evento en Google Calendar
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  cal.createEvent(title, startTime, endTime, { description });

  // Guardar en hoja de cálculo
  logToSheet({ name, phone, service, isFirst, notes, date, time });

  // Enviar email de notificación
  notifyByEmail({ name, phone, service, date, time, notes });

  return { success: true };
}

// ─── BLOQUEAR / DESBLOQUEAR FECHA MANUAL ─────
// Usado desde el panel de administración
function blockDate(dateStr, block) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let sheet  = ss.getSheetByName("Bloqueados");
  if (!sheet) sheet = ss.insertSheet("Bloqueados");

  if (block) {
    sheet.appendRow([dateStr, new Date()]);
  } else {
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][0] === dateStr) sheet.deleteRow(i + 1);
    }
  }
  return { success: true };
}

// ─── HELPERS ──────────────────────────────────
function getManualBlocks() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Bloqueados");
    if (!sheet) return new Set();
    const data  = sheet.getDataRange().getValues();
    return new Set(data.slice(1).map(r => r[0]).filter(Boolean));
  } catch(e) {
    return new Set();
  }
}

function allTimesFull(dateStr) {
  const booked = getBookedTimes(dateStr).bookedTimes;
  return ALL_SLOTS.every(t => booked.includes(t));
}

function logToSheet(data) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["Fecha registro","Nombre","Teléfono","Servicio","Primera vez","Fecha cita","Hora","Notas"]);
      sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
    }
    sheet.appendRow([
      new Date(),
      data.name,
      data.phone,
      data.service,
      data.isFirst === "si" ? "Sí" : "No",
      data.date,
      data.time,
      data.notes || ""
    ]);
  } catch(e) {
    Logger.log("Error guardando en hoja: " + e);
  }
}

function notifyByEmail(data) {
  try {
    const subject = `✨ Nueva reserva — ${data.name} — ${data.date} ${data.time}`;
    const body = `
Nueva reserva recibida en Kolenka Lashes:

Clienta:  ${data.name}
Teléfono: ${data.phone}
Servicio: ${data.service}
Fecha:    ${data.date}
Hora:     ${data.time} hrs
${data.notes ? "Notas:    " + data.notes : ""}

El evento ya fue creado en tu Google Calendar.
    `.trim();
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch(e) {
    Logger.log("Error enviando email: " + e);
  }
}

// ─── PANEL DE ADMINISTRACIÓN (interfaz web del script) ───
// Accede en: Tu URL del script sin el /exec (reemplaza /exec por /dev o abre el editor)
// Esta función se usa solo internamente para el panel admin
function getAdminData(monthOffset) {
  const d = new Date();
  d.setMonth(d.getMonth() + (monthOffset || 0));
  const year = d.getFullYear(), month = d.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const manualBlocks = getManualBlocks();
  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const weekday = new Date(year, month, day).getDay();
    days.push({
      date: dateStr,
      day,
      weekday,
      blocked: manualBlocks.has(dateStr),
      isSunday: weekday === 0
    });
  }

  return { year, month, days };
}
