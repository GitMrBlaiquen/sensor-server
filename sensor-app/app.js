// ==============================
// app.js (FULL / reescrito)
// - Login + admin/dueño + selector cliente/tienda
// - Vistas (Tienda / Gráficos / Calendario)
// - Polling de estado (online/offline) por store
// - Muestra CLIENTES (server ya resta niños + trabajadores)
// - Muestra TRABAJADORES y NIÑOS como datos aparte
// - Gráfico profesional tipo DONUT (pie) con leyenda + %
// - Evita que el user-badge aparezca en el login (se oculta hasta login)
// ==============================

// URL base de la API
const BASE_URL = window.location.origin;
// const BASE_URL = "http://localhost:10000";

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;
const HISTORY_URL = `${BASE_URL}/api/store/history`;
const STATUS_URL = `${BASE_URL}/api/store/status`;

// ------------------------------
// Elementos principales
// ------------------------------
const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

// Login
const loginPanel = document.getElementById("loginPanel");
const mainContent = document.getElementById("mainContent");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

// User badge (dentro del mainContent)
const userBadge = document.querySelector(".user-badge");
const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

// Selector de cliente (solo admin)
const clientSelectorSection = document.getElementById("clientSelectorSection");
const clientSelect = document.getElementById("clientSelect");

// Selector de tienda
const storeSelect = document.getElementById("storeSelect");

// Modal inactividad
const sessionWarningModal = document.getElementById("sessionWarningModal");
const stayLoggedBtn = document.getElementById("stayLoggedBtn");
const logoutNowBtn = document.getElementById("logoutNowBtn");
const countdownSpan = document.getElementById("countdownSeconds");

// Menú / vistas
const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

// Charts / calendar UI
const chartDate = document.getElementById("chartDate");
const loadChartBtn = document.getElementById("loadChartBtn");
const chartCanvas = document.getElementById("chartCanvas");
const chartCtx = chartCanvas ? chartCanvas.getContext("2d") : null;

const historyDate = document.getElementById("historyDate");
const loadHistoryBtn = document.getElementById("loadHistoryBtn");
const historyResult = document.getElementById("historyResult");

// ------------------------------
// Estado
// ------------------------------
let autoRefreshId = null;

// Polling de estado (heartbeat)
let statusPollId = null;
const STATUS_POLL_MS = 3000;

let currentUser = null;
let currentRole = null; // "admin" o "dueño"
let currentStores = [];
let currentStoreId = null;

// Solo admin
let clients = [];
let currentClientId = null;

// ------------------------------
// Helpers UI (mostrar/ocultar badge)
// ------------------------------
function setUserBadgeVisible(isVisible) {
  if (!userBadge) return;
  userBadge.style.display = isVisible ? "flex" : "none";
}

// Asegura estado inicial (por si el CSS lo muestra)
setUserBadgeVisible(false);

// ------------------------------
// Utilidades: clientes/tiendas
// ------------------------------
function getClientIdFromStoreId(storeId) {
  const parts = String(storeId || "").split("-");
  return parts[0] || storeId;
}

function formatClientName(clientId) {
  if (!clientId) return "";
  return clientId.charAt(0).toUpperCase() + clientId.slice(1);
}

function buildClientsFromStores(stores) {
  const found = new Set();
  const list = [];
  (stores || []).forEach((store) => {
    const clientId = getClientIdFromStoreId(store.id);
    if (!found.has(clientId)) {
      found.add(clientId);
      list.push({ id: clientId, name: formatClientName(clientId) });
    }
  });
  return list;
}

function fillClientSelect() {
  if (!clientSelect) return;
  clientSelect.innerHTML = "";

  clients.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    clientSelect.appendChild(opt);
  });

  currentClientId = clients.length ? clients[0].id : null;
  if (currentClientId) clientSelect.value = currentClientId;
}

function fillStoreSelectForClient(clientId) {
  if (!storeSelect) return;
  storeSelect.innerHTML = "";

  const filteredStores = currentStores.filter(
    (s) => getClientIdFromStoreId(s.id) === clientId
  );

  filteredStores.forEach((store) => {
    const opt = document.createElement("option");
    opt.value = store.id;
    opt.textContent = store.name || store.id;
    storeSelect.appendChild(opt);
  });

  currentStoreId = filteredStores.length ? filteredStores[0].id : null;
  if (currentStoreId) storeSelect.value = currentStoreId;
}

function fillStoreSelectSimple() {
  if (!storeSelect) return;
  storeSelect.innerHTML = "";

  currentStores.forEach((store) => {
    const opt = document.createElement("option");
    opt.value = store.id;
    opt.textContent = store.name || store.id;
    storeSelect.appendChild(opt);
  });

  currentStoreId = currentStores.length ? currentStores[0].id : null;
  if (currentStoreId) storeSelect.value = currentStoreId;
}

function getStoreName(storeId) {
  let storeName = storeId;
  const found = (currentStores || []).find((s) => s.id === storeId);
  if (found && found.name) storeName = found.name;
  return storeName;
}

// ------------------------------
// Menú: cambiar vista
// ------------------------------
function showView(viewId) {
  views.forEach((v) => v.classList.remove("active-view"));
  const el = document.getElementById(viewId);
  if (el) el.classList.add("active-view");

  navButtons.forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  if (btn) btn.classList.add("active");
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const viewId = btn.dataset.view;
    if (viewId) showView(viewId);
  });
});

// ------------------------------
// Inactividad
// ------------------------------
const INACTIVITY_LIMIT_MS = 1 * 60 * 1000; // 1 min
const WARNING_DURATION_MS = 30 * 1000; // 30 s

let inactivityTimer = null;
let logoutTimer = null;
let countdownInterval = null;

function clearInactivityTimers() {
  clearTimeout(inactivityTimer);
  clearTimeout(logoutTimer);
  clearInterval(countdownInterval);
  inactivityTimer = null;
  logoutTimer = null;
  countdownInterval = null;
}

function hideInactivityWarning() {
  if (sessionWarningModal) sessionWarningModal.style.display = "none";
  clearInterval(countdownInterval);
  countdownInterval = null;
}

function showInactivityWarning() {
  if (!currentUser) return;
  if (!sessionWarningModal) return;

  sessionWarningModal.style.display = "flex";

  let remaining = Math.floor(WARNING_DURATION_MS / 1000);
  if (countdownSpan) countdownSpan.textContent = remaining;

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining < 0) remaining = 0;
    if (countdownSpan) countdownSpan.textContent = remaining;
  }, 1000);

  logoutTimer = setTimeout(() => logout(), WARNING_DURATION_MS);
}

function resetInactivityTimers() {
  if (!currentUser) return;
  hideInactivityWarning();
  clearInactivityTimers();
  inactivityTimer = setTimeout(showInactivityWarning, INACTIVITY_LIMIT_MS);
}

["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((evt) => {
  document.addEventListener(evt, () => resetInactivityTimers(), { passive: true });
});

if (stayLoggedBtn) stayLoggedBtn.addEventListener("click", () => resetInactivityTimers());
if (logoutNowBtn) logoutNowBtn.addEventListener("click", () => logout());

// ------------------------------
// Polling estado
// ------------------------------
function startStatusPolling() {
  stopStatusPolling();
  statusPollId = setInterval(() => refreshStatusOnly(), STATUS_POLL_MS);
}

function stopStatusPolling() {
  if (statusPollId) {
    clearInterval(statusPollId);
    statusPollId = null;
  }
}

async function refreshStatusOnly() {
  if (!currentStoreId) return;

  const statusPill = document.getElementById("statusPill");
  const snEl = document.getElementById("sensorSn");
  if (!statusPill || !snEl) return;

  try {
    const urlStatus = `${STATUS_URL}?storeId=${encodeURIComponent(currentStoreId)}`;
    const res = await fetch(urlStatus);
    if (!res.ok) return;

    const status = await res.json();
    const online = !!status?.online;
    const sn = status?.sn || "SN desconocido";

    snEl.innerHTML = `SN: <strong>${sn}</strong>`;

    statusPill.classList.remove("status-on", "status-off");
    statusPill.classList.add(online ? "status-on" : "status-off");
    statusPill.textContent = online ? "🟢 Encendido" : "🔴 Apagado";
  } catch {
    // no rompemos UI
  }
}

// ------------------------------
// Login
// ------------------------------
async function login() {
  const username = (usernameInput?.value || "").trim();
  const password = (passwordInput?.value || "").trim();

  if (!username || !password) {
    if (loginStatus) {
      loginStatus.textContent = "Ingresa usuario y contraseña.";
      loginStatus.style.color = "red";
    }
    return;
  }

  try {
    if (loginStatus) {
      loginStatus.textContent = "Ingresando...";
      loginStatus.style.color = "inherit";
    }

    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error("Usuario o contraseña incorrectos.");
      throw new Error("Error en el login.");
    }

    const data = await res.json();

    currentUser = data.username;
    currentRole = data.role || "dueño";
    currentStores = data.stores || [];

    if (currentStores.length === 0) {
      if (loginStatus) {
        loginStatus.textContent = "El usuario no tiene tiendas asignadas.";
        loginStatus.style.color = "red";
      }
      return;
    }

    // Pintar usuario
    if (userInfo) {
      const roleLabel = currentRole === "admin" ? "Administrador" : "Dueño";
      userInfo.innerHTML = `
        <span class="user-icon">👤</span>
        <span class="user-name">${currentUser}</span>
        <span class="user-role">(${roleLabel})</span>
      `;
    }

    // Admin: arma clientes
    if (currentRole === "admin") {
      clients = buildClientsFromStores(currentStores);
      if (clients.length > 0) {
        fillClientSelect();
        fillStoreSelectForClient(currentClientId);
        if (clientSelectorSection) clientSelectorSection.style.display = "block";
      } else {
        if (clientSelectorSection) clientSelectorSection.style.display = "none";
        fillStoreSelectSimple();
      }
    } else {
      clients = [];
      currentClientId = null;
      if (clientSelectorSection) clientSelectorSection.style.display = "none";
      fillStoreSelectSimple();
    }

    // Mostrar app
    if (loginStatus) loginStatus.textContent = "";
    if (loginPanel) loginPanel.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    setUserBadgeVisible(true);

    showView("view-store");

    const today = new Date().toISOString().slice(0, 10);
    if (chartDate && !chartDate.value) chartDate.value = today;
    if (historyDate && !historyDate.value) historyDate.value = today;

    resetInactivityTimers();
    startStatusPolling();

    if (currentStoreId) {
      await loadSensors();
      refreshStatusOnly();
    } else if (sensorsContainer) {
      sensorsContainer.innerHTML = "<p>No hay tiendas disponibles para este usuario.</p>";
    }
  } catch (err) {
    console.error(err);
    if (loginStatus) {
      loginStatus.textContent = err.message || "No se pudo iniciar sesión.";
      loginStatus.style.color = "red";
    }
  }
}

if (loginBtn) loginBtn.addEventListener("click", login);
if (usernameInput) usernameInput.addEventListener("keydown", (e) => e.key === "Enter" && login());
if (passwordInput) passwordInput.addEventListener("keydown", (e) => e.key === "Enter" && login());

// ------------------------------
// Logout
// ------------------------------
function logout() {
  if (autoRefreshId) {
    clearInterval(autoRefreshId);
    autoRefreshId = null;
  }
  stopStatusPolling();

  clearInactivityTimers();
  hideInactivityWarning();

  currentUser = null;
  currentRole = null;
  currentStores = [];
  currentStoreId = null;
  clients = [];
  currentClientId = null;

  if (userInfo) userInfo.textContent = "";
  setUserBadgeVisible(false);

  if (storeSelect) storeSelect.innerHTML = "";
  if (clientSelect) clientSelect.innerHTML = "";
  if (clientSelectorSection) clientSelectorSection.style.display = "none";

  if (sensorsContainer) sensorsContainer.innerHTML = "<p>Inicia sesión para ver el contador de personas.</p>";
  if (historyResult) historyResult.innerHTML = "<p>Selecciona una fecha para ver el resumen del día.</p>";
  if (chartCtx && chartCanvas) chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  if (loginStatus) loginStatus.textContent = "";
  if (usernameInput) usernameInput.value = "";
  if (passwordInput) passwordInput.value = "";

  if (mainContent) mainContent.style.display = "none";
  if (loginPanel) loginPanel.style.display = "flex";
}

if (logoutBtn) logoutBtn.addEventListener("click", logout);

// ------------------------------
// Selectores
// ------------------------------
if (clientSelect) {
  clientSelect.addEventListener("change", () => {
    currentClientId = clientSelect.value;
    fillStoreSelectForClient(currentClientId);

    if (currentStoreId) {
      loadSensors();
      refreshStatusOnly();
    } else if (sensorsContainer) {
      sensorsContainer.innerHTML = "<p>No hay tiendas asociadas a este cliente.</p>";
    }
  });
}

if (storeSelect) {
  storeSelect.addEventListener("change", () => {
    currentStoreId = storeSelect.value;
    loadSensors();
    refreshStatusOnly();
  });
}

// ------------------------------
// Contador TIENDA + ESTADO
// ------------------------------
async function loadSensors() {
  if (!currentStoreId) {
    if (sensorsContainer) sensorsContainer.innerHTML = "<p>Selecciona una tienda para ver los datos.</p>";
    return;
  }

  try {
    if (sensorsContainer) sensorsContainer.innerHTML = "<p>Cargando datos de la tienda...</p>";

    const urlCounters = `${COUNTERS_URL}?storeId=${encodeURIComponent(currentStoreId)}`;
    const urlStatus = `${STATUS_URL}?storeId=${encodeURIComponent(currentStoreId)}`;

    const [resCounters, resStatus] = await Promise.all([fetch(urlCounters), fetch(urlStatus)]);

    if (!resCounters.ok) throw new Error("Error al obtener contadores: " + resCounters.status);
    if (!resStatus.ok) throw new Error("Error al obtener estado: " + resStatus.status);

    const counters = await resCounters.json();
    const status = await resStatus.json();

    renderStoreCounters(counters, status);
  } catch (err) {
    console.error(err);
    if (sensorsContainer) {
      sensorsContainer.innerHTML =
        `<p style="color:red;">No se pudieron cargar los datos de la tienda. Revisa el servidor.</p>`;
    }
  }
}

function renderStoreCounters(counters, status) {
  const {
    storeId,
    // ✅ estos YA vienen como CLIENTES (server resta niños + trabajadores)
    entradas = 0,
    salidas = 0,
    dentro = 0,

    // ✅ aparte
    inChild = 0,
    outChild = 0,
    workersIn = 0,

    // debug opcional
    totalEntradas = null,
    totalSalidas = null,
  } = counters || {};

  const online = !!status?.online;
  const sn = status?.sn || "SN desconocido";

  if (!sensorsContainer) return;
  sensorsContainer.innerHTML = "";

  // Leyenda
  const legend = document.createElement("div");
  legend.className = "sensor-legend";
  legend.innerHTML = `
    <span class="legend-item"><span class="status-pill status-on">🟢</span> Encendido</span>
    <span class="legend-item"><span class="status-pill status-off">🔴</span> Apagado</span>
  `;
  sensorsContainer.appendChild(legend);

  const card = document.createElement("article");
  card.className = "sensor-card";

  const nowStr = new Date().toLocaleTimeString();
  const storeName = getStoreName(storeId);

  const showDebug = totalEntradas !== null || totalSalidas !== null;
  const debugEntradas = totalEntradas ?? 0;
  const debugSalidas = totalSalidas ?? 0;

  card.innerHTML = `
    <div class="sensor-header">
      <div>
        <div class="sensor-id">${storeName}</div>
        <div class="sensor-type">Contador de personas</div>
      </div>

      <div class="sensor-right">
        <div class="sensor-sn" id="sensorSn">SN: <strong>${sn}</strong></div>
        <div id="statusPill" class="status-pill ${online ? "status-on" : "status-off"}">
          ${online ? "🟢 Encendido" : "🔴 Apagado"}
        </div>
      </div>
    </div>

    <div class="store-counters">

      <div class="store-counter-item">
        <span class="label">Clientes que han ENTRADO (sin niños ni trabajadores)</span>
        <span class="value">${entradas}</span>
      </div>

      <div class="store-counter-item">
        <span class="label">Clientes que han SALIDO (sin niños)</span>
        <span class="value">${salidas}</span>
      </div>

      <div class="store-counter-item">
        <span class="label">Clientes DENTRO (estimado)</span>
        <span class="value">${dentro}</span>
      </div>

      <hr style="border:none;border-top:1px solid rgba(0,0,0,0.12);margin:10px 0;" />

      <div class="store-counter-item">
        <span class="label">Trabajadores detectados (workcard)</span>
        <span class="value">${workersIn}</span>
      </div>

      <div class="store-counter-item">
        <span class="label">Niños que han ENTRADO</span>
        <span class="value">${inChild}</span>
      </div>

      <div class="store-counter-item">
        <span class="label">Niños que han SALIDO</span>
        <span class="value">${outChild}</span>
      </div>

      ${
        showDebug
          ? `
        <hr style="border:none;border-top:1px solid rgba(0,0,0,0.10);margin:10px 0;" />
        <div class="store-counter-item" style="opacity:0.75;">
          <span class="label">Total ENTRADAS del sensor (debug)</span>
          <span class="value">${debugEntradas}</span>
        </div>
        <div class="store-counter-item" style="opacity:0.75;">
          <span class="label">Total SALIDAS del sensor (debug)</span>
          <span class="value">${debugSalidas}</span>
        </div>
      `
          : ""
      }

    </div>

    <div class="sensor-meta">
      Última actualización: ${nowStr}
    </div>
  `;

  sensorsContainer.appendChild(card);
}

// ------------------------------
// Historial / Gráfico
// ------------------------------
async function fetchHistory(dateStr) {
  if (!currentStoreId) throw new Error("No hay tienda seleccionada.");
  if (!dateStr) throw new Error("Selecciona una fecha.");

  const url = `${HISTORY_URL}?storeId=${encodeURIComponent(currentStoreId)}&date=${encodeURIComponent(
    dateStr
  )}`;
  const res = await fetch(url);

  if (!res.ok) throw new Error("No se pudo obtener historial: " + res.status);
  return res.json();
}

async function loadHistory() {
  if (!historyResult) return;

  try {
    historyResult.innerHTML = "<p>Cargando historial...</p>";
    const dateStr = historyDate?.value;
    const data = await fetchHistory(dateStr);

    const entradas = Number(data.entradas || 0);
    const salidas = Number(data.salidas || 0);
    const dentro = Math.max(entradas - salidas, 0);

    const storeName = getStoreName(data.storeId);

    historyResult.innerHTML = `
      <h3>${storeName} — ${data.date}</h3>
      <p><strong>Entradas (clientes):</strong> ${entradas}</p>
      <p><strong>Salidas (clientes):</strong> ${salidas}</p>
      <p><strong>Dentro (estimado):</strong> ${dentro}</p>
      <hr style="border:none;border-top:1px solid rgba(0,0,0,0.10);margin:10px 0;" />
      <p><strong>Niños entraron:</strong> ${Number(data.inChild || 0)}</p>
      <p><strong>Niños salieron:</strong> ${Number(data.outChild || 0)}</p>
      <p><strong>Trabajadores (workcard):</strong> ${Number(data.workersIn || 0)}</p>
    `;
  } catch (e) {
    historyResult.innerHTML = `<p style="color:red;">${e.message}</p>`;
  }
}

// ------------------------------
// GRÁFICO (PRO) tipo Donut + Leyenda
// ------------------------------
async function loadChart() {
  if (!chartCtx || !chartCanvas) return;

  try {
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    const dateStr = chartDate?.value;
    const data = await fetchHistory(dateStr);

    // Totales del día (vienen del server)
    const totals = {
      clientesEntraron: Number(data.entradas || 0),
      clientesSalieron: Number(data.salidas || 0),
      ninosEntraron: Number(data.inChild || 0),
      ninosSalieron: Number(data.outChild || 0),
      trabajadores: Number(data.workersIn || 0),
    };

    drawDonutChart(totals, dateStr);
  } catch (e) {
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    chartCtx.fillStyle = "#0A2342";
    chartCtx.font = "16px system-ui";
    chartCtx.fillText("No se pudo cargar el gráfico.", 20, 40);
  }
}

function drawDonutChart(totals, dateStr) {
  const W = chartCanvas.width;
  const H = chartCanvas.height;

  chartCtx.clearRect(0, 0, W, H);

  const storeName = getStoreName(currentStoreId);

  // Datos (orden pedido)
  const items = [
    { label: "Clientes que entraron", value: totals.clientesEntraron, color: "#1C6DD0" },
    { label: "Clientes que salieron", value: totals.clientesSalieron, color: "#c0392b" },
    { label: "Niños que entraron", value: totals.ninosEntraron, color: "#16a085" },
    { label: "Niños que salieron", value: totals.ninosSalieron, color: "#8e44ad" },
    { label: "Trabajadores", value: totals.trabajadores, color: "#2c3e50" },
  ].filter((x) => Number.isFinite(x.value) && x.value > 0);

  const sum = items.reduce((a, b) => a + b.value, 0);

  // Encabezado
  chartCtx.fillStyle = "#0A2342";
  chartCtx.font = "16px system-ui";
  chartCtx.fillText(`${storeName} — ${dateStr}`, 20, 28);
  chartCtx.font = "13px system-ui";
  chartCtx.fillText("Distribución del día (Clientes / Niños / Trabajadores)", 20, 48);

  if (sum <= 0) {
    chartCtx.font = "16px system-ui";
    chartCtx.fillText("No hay datos para graficar en esta fecha.", 20, 90);
    return;
  }

  // Donut a la izquierda
  const cx = 220;
  const cy = Math.floor(H / 2) + 10;
  const outerR = 110;
  const innerR = 55;

  let start = -Math.PI / 2;

  // Slices
  for (const it of items) {
    const angle = (it.value / sum) * Math.PI * 2;
    const end = start + angle;

    chartCtx.beginPath();
    chartCtx.moveTo(cx, cy);
    chartCtx.arc(cx, cy, outerR, start, end);
    chartCtx.closePath();
    chartCtx.fillStyle = it.color;
    chartCtx.fill();

    // % label (solo si es grande)
    const pct = (it.value / sum) * 100;
    if (pct >= 6) {
      const mid = (start + end) / 2;
      const tx = cx + Math.cos(mid) * (outerR + 18);
      const ty = cy + Math.sin(mid) * (outerR + 18);

      chartCtx.fillStyle = "#0A2342";
      chartCtx.font = "12px system-ui";
      chartCtx.fillText(`${pct.toFixed(0)}%`, tx - 10, ty + 4);
    }

    start = end;
  }

  // Agujero
  chartCtx.beginPath();
  chartCtx.arc(cx, cy, innerR, 0, Math.PI * 2);
  chartCtx.fillStyle = "rgba(255,255,255,0.65)";
  chartCtx.fill();

  // Total al centro
  chartCtx.fillStyle = "#0A2342";
  chartCtx.font = "12px system-ui";
  chartCtx.fillText("Total", cx - 14, cy - 6);
  chartCtx.font = "16px system-ui";
  chartCtx.fillText(String(sum), cx - 10, cy + 14);

  // Leyenda a la derecha
  const lx = 400;
  let ly = 85;

  chartCtx.font = "13px system-ui";
  chartCtx.fillStyle = "#0A2342";
  chartCtx.fillText("Leyenda", lx, ly);
  ly += 14;

  for (const it of items) {
    const pct = ((it.value / sum) * 100).toFixed(1);

    chartCtx.fillStyle = it.color;
    chartCtx.fillRect(lx, ly, 12, 12);

    chartCtx.fillStyle = "#0A2342";
    chartCtx.font = "13px system-ui";
    chartCtx.fillText(`${it.label}`, lx + 18, ly + 11);

    chartCtx.font = "12px system-ui";
    chartCtx.fillStyle = "rgba(10,35,66,0.85)";
    chartCtx.fillText(`Valor: ${it.value}  (${pct}%)`, lx + 18, ly + 28);

    ly += 44;
  }
}

if (loadHistoryBtn) loadHistoryBtn.addEventListener("click", loadHistory);
if (loadChartBtn) loadChartBtn.addEventListener("click", loadChart);

// ------------------------------
// Controles generales
// ------------------------------
if (refreshBtn) refreshBtn.addEventListener("click", () => loadSensors());

if (refreshSelect) {
  refreshSelect.addEventListener("change", () => {
    const interval = Number(refreshSelect.value);

    if (autoRefreshId) {
      clearInterval(autoRefreshId);
      autoRefreshId = null;
    }

    if (interval > 0) {
      autoRefreshId = setInterval(() => loadSensors(), interval);
    }
  });
}

// Estado inicial de la UI
if (sensorsContainer) {
  sensorsContainer.innerHTML = "<p>Inicia sesión para ver el contador de personas.</p>";
}
