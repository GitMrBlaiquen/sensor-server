// ==============================
// app.js (reescrito / limpio)
// - Login + admin/dueño + vistas + donut chart + resumen
// - Polling estado (heartbeat)
// - Muestra CLIENTES (ya restado de niños + trabajadores desde el server)
// - Muestra TRABAJADORES y NIÑOS como datos aparte
// - user-badge + sidebar NO aparecen en login
// - TIENDA: muestra datos en "cuadros" (cards) dentro del cuadro principal
// ==============================

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

// Usuario + logout
const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

// UI flotante (para ocultar en login)
const userBadgeEl = document.querySelector(".user-badge");
const sidebarEl = document.querySelector(".sidebar");

// Selector de cliente (solo admin)
const clientSelectorSection = document.getElementById("clientSelectorSection");
const clientSelect = document.getElementById("clientSelect");

// Selector de tienda
const storeSelect = document.getElementById("storeSelect");

// Modal de inactividad
const sessionWarningModal = document.getElementById("sessionWarningModal");
const stayLoggedBtn = document.getElementById("stayLoggedBtn");
const logoutNowBtn = document.getElementById("logoutNowBtn");
const countdownSpan = document.getElementById("countdownSeconds");

// Menú y vistas
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
// Mini-CSS (inyectado desde JS)
// ------------------------------
function ensureUiStyles() {
  if (document.getElementById("appjs-ui-styles")) return;

  const style = document.createElement("style");
  style.id = "appjs-ui-styles";
  style.textContent = `
    .sensor-legend{
      display:flex;
      gap: 12px;
      align-items:center;
      margin: 6px 0 12px;
      font-size: 0.95rem;
      opacity: 0.9;
    }
    .legend-item{ display:inline-flex; gap: 6px; align-items:center; }
    .status-pill{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding: 6px 10px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 0.9rem;
      border: 1px solid rgba(0,0,0,0.10);
      background: rgba(255,255,255,0.55);
    }
    .status-on{ box-shadow: inset 0 0 0 2px rgba(21,171,31,0.20); }
    .status-off{ box-shadow: inset 0 0 0 2px rgba(192,57,43,0.20); }

    .sensor-right{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap: 8px;
      min-width: 190px;
    }
    .sensor-sn{ font-size: 0.95rem; opacity: 0.95; }

    /* ✅ GRID de “cuadros” de información */
    .stats-grid{
      margin-top: 12px;
      display:grid;
      grid-template-columns: repeat(3, minmax(160px, 1fr));
      gap: 12px;
    }
    .stat-card{
      background: rgba(255,255,255,0.45);
      border: 1px solid rgba(0,0,0,0.10);
      border-radius: 12px;
      padding: 12px 12px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.06);
      display:flex;
      flex-direction:column;
      gap: 6px;
      min-height: 74px;
    }
    .stat-title{
      font-size: 0.9rem;
      opacity: 0.85;
      font-weight: 800;
      line-height: 1.15;
    }
    .stat-value{
      font-size: 1.6rem;
      font-weight: 1000;
      color: #1C6DD0;
      line-height: 1;
    }
    .stat-value--ok{ color: #15AB1F; }
    .stat-value--warn{ color: #c0392b; }
    .stat-sub{
      font-size: 0.85rem;
      opacity: 0.78;
    }

    /* Ajuste responsive */
    @media (max-width: 1100px){
      .stats-grid{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }
    }
    @media (max-width: 650px){
      .stats-grid{ grid-template-columns: 1fr; }
      .sensor-right{ align-items:flex-start; }
    }
  `;
  document.head.appendChild(style);
}

// ------------------------------
// Helpers UI: mostrar/ocultar cosas flotantes
// ------------------------------
function setLoggedInUI(isLoggedIn) {
  if (userBadgeEl) userBadgeEl.style.display = isLoggedIn ? "flex" : "none";
  if (sidebarEl) sidebarEl.style.display = isLoggedIn ? "block" : "none";
}

// Al cargar la página: ocultar badge/menu (hasta login)
setLoggedInUI(false);
ensureUiStyles();

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
// Menú lateral: cambiar vista
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
const INACTIVITY_LIMIT_MS = 1 * 60 * 1000; // 1 minuto
const WARNING_DURATION_MS = 30 * 1000; // 30 segundos

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
// Polling estado (heartbeat)
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
    loginStatus.textContent = "Ingresa usuario y contraseña.";
    loginStatus.style.color = "red";
    return;
  }

  try {
    loginStatus.textContent = "Ingresando...";
    loginStatus.style.color = "inherit";

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
      loginStatus.textContent = "El usuario no tiene tiendas asignadas.";
      loginStatus.style.color = "red";
      return;
    }

    if (userInfo) {
      const roleLabel = currentRole === "admin" ? "Administrador" : "Dueño";
      userInfo.innerHTML = `
        <span class="user-icon">👤</span>
        <span class="user-name">${currentUser}</span>
        <span class="user-role">(${roleLabel})</span>
      `;
    }

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

    loginStatus.textContent = "";
    if (loginPanel) loginPanel.style.display = "none";
    if (mainContent) mainContent.style.display = "block";

    // ✅ Mostrar user-badge + sidebar solo después de login
    setLoggedInUI(true);

    showView("view-store");

    const today = new Date().toISOString().slice(0, 10);
    if (chartDate && !chartDate.value) chartDate.value = today;
    if (historyDate && !historyDate.value) historyDate.value = today;

    resetInactivityTimers();
    startStatusPolling();

    if (currentStoreId) {
      await loadSensors();
      refreshStatusOnly();
    } else {
      sensorsContainer.innerHTML = "<p>No hay tiendas disponibles para este usuario.</p>";
    }
  } catch (err) {
    console.error(err);
    loginStatus.textContent = err.message || "No se pudo iniciar sesión.";
    loginStatus.style.color = "red";
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
  if (storeSelect) storeSelect.innerHTML = "";
  if (clientSelect) clientSelect.innerHTML = "";
  if (clientSelectorSection) clientSelectorSection.style.display = "none";

  if (sensorsContainer) sensorsContainer.innerHTML = "<p>Inicia sesión para ver el contador de personas.</p>";
  if (historyResult) historyResult.innerHTML = "<p>Selecciona una fecha para ver el resumen del día.</p>";
  if (chartCtx && chartCanvas) chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  if (loginStatus) loginStatus.textContent = "";
  if (usernameInput) usernameInput.value = "";
  if (passwordInput) passwordInput.value = "";

  // ✅ Ocultar UI flotante
  setLoggedInUI(false);

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
    } else {
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
    sensorsContainer.innerHTML = "<p>Selecciona una tienda para ver los datos.</p>";
    return;
  }

  try {
    sensorsContainer.innerHTML = "<p>Cargando datos de la tienda...</p>";

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
    sensorsContainer.innerHTML =
      `<p style="color:red;">No se pudieron cargar los datos de la tienda. Revisa el servidor.</p>`;
  }
}

function renderStoreCounters(counters, status) {
  const {
    storeId,

    // ✅ CLIENTES (ya restado en server)
    entradas = 0,
    salidas = 0,
    dentro = 0,

    // ✅ aparte
    inChild = 0,
    outChild = 0,
    workersIn = 0,

    // ✅ debug (RAW sensor)
    totalEntradas = 0,
    totalSalidas = 0,
  } = counters || {};

  const online = !!status?.online;
  const sn = status?.sn || "SN desconocido";

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

  // ✅ Cuadros de información (incluye lo “eliminado” en formato card)
  const statsHtml = `
    <div class="stats-grid">

      <div class="stat-card">
        <div class="stat-title">Clientes que han ENTRADO</div>
        <div class="stat-value">${Number(entradas) || 0}</div>
        <div class="stat-sub">Sin niños ni trabajadores</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Clientes que han SALIDO</div>
        <div class="stat-value">${Number(salidas) || 0}</div>
        <div class="stat-sub">Sin niños</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Clientes DENTRO</div>
        <div class="stat-value">${Number(dentro) || 0}</div>
        <div class="stat-sub">Estimado</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Niños que han ENTRADO</div>
        <div class="stat-value">${Number(inChild) || 0}</div>
        <div class="stat-sub">Conteo separado</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Niños que han SALIDO</div>
        <div class="stat-value">${Number(outChild) || 0}</div>
        <div class="stat-sub">Conteo separado</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Trabajadores detectados</div>
        <div class="stat-value">${Number(workersIn) || 0}</div>
        <div class="stat-sub">Workcard</div>
      </div>

      <!-- ✅ Lo que “habíamos eliminado” vuelve aquí como cuadros -->
      <div class="stat-card">
        <div class="stat-title">Total ENTRADAS del sensor</div>
        <div class="stat-value">${Number(totalEntradas) || 0}</div>
        <div class="stat-sub">Debug (raw)</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Total SALIDAS del sensor</div>
        <div class="stat-value">${Number(totalSalidas) || 0}</div>
        <div class="stat-sub">Debug (raw)</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Última actualización</div>
        <div class="stat-value stat-value--ok" style="font-size:1.1rem;">${nowStr}</div>
        <div class="stat-sub">Hora local</div>
      </div>

    </div>
  `;

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

    ${statsHtml}
  `;

  sensorsContainer.appendChild(card);
}

// ------------------------------
// Historial / Datos día
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
      <hr style="border:none;border-top:1px solid rgba(0,0,0,0.12);margin:10px 0;" />
      <p><strong>Niños entraron:</strong> ${Number(data.inChild || 0)}</p>
      <p><strong>Niños salieron:</strong> ${Number(data.outChild || 0)}</p>
      <p><strong>Trabajadores:</strong> ${Number(data.workersIn || 0)}</p>
    `;
  } catch (e) {
    historyResult.innerHTML = `<p style="color:red;">${e.message}</p>`;
  }
}

// ------------------------------
// GRÁFICO (Donut + Leyenda)
// ------------------------------
async function loadChart() {
  if (!chartCtx || !chartCanvas) return;

  try {
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    const dateStr = chartDate?.value;
    const data = await fetchHistory(dateStr);

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

  const items = [
    { label: "Clientes que entraron", value: totals.clientesEntraron, color: "#1C6DD0" },
    { label: "Clientes que salieron", value: totals.clientesSalieron, color: "#c0392b" },
    { label: "Niños que entraron", value: totals.ninosEntraron, color: "#16a085" },
    { label: "Niños que salieron", value: totals.ninosSalieron, color: "#8e44ad" },
    { label: "Trabajadores", value: totals.trabajadores, color: "#2c3e50" },
  ].filter((x) => Number.isFinite(x.value) && x.value > 0);

  const sum = items.reduce((a, b) => a + b.value, 0);

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

  const cx = 220;
  const cy = Math.floor(H / 2) + 10;
  const outerR = 110;
  const innerR = 55;

  let start = -Math.PI / 2;

  for (const it of items) {
    const angle = (it.value / sum) * Math.PI * 2;
    const end = start + angle;

    chartCtx.beginPath();
    chartCtx.moveTo(cx, cy);
    chartCtx.arc(cx, cy, outerR, start, end);
    chartCtx.closePath();
    chartCtx.fillStyle = it.color;
    chartCtx.fill();

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

  chartCtx.beginPath();
  chartCtx.arc(cx, cy, innerR, 0, Math.PI * 2);
  chartCtx.fillStyle = "rgba(255,255,255,0.65)";
  chartCtx.fill();

  chartCtx.fillStyle = "#0A2342";
  chartCtx.font = "12px system-ui";
  chartCtx.fillText("Total", cx - 14, cy - 6);
  chartCtx.font = "16px system-ui";
  chartCtx.fillText(String(sum), cx - 10, cy + 14);

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

if (sensorsContainer) {
  sensorsContainer.innerHTML = "<p>Inicia sesión para ver el contador de personas.</p>";
}
