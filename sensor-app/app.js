// URL base de la API
const BASE_URL = window.location.origin;
// const BASE_URL = "http://localhost:10000";

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;
const HISTORY_URL = `${BASE_URL}/api/store/history`;

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

let currentUser = null;
let currentRole = null;       // "admin" o "dueño"
let currentStores = [];
let currentStoreId = null;

// Solo admin
let clients = [];
let currentClientId = null;

// ------------------------------
// Inactividad
// ------------------------------
const INACTIVITY_LIMIT_MS = 1 * 60 * 1000;  // 1 minuto
const WARNING_DURATION_MS = 30 * 1000;      // 30 segundos

let inactivityTimer = null;
let logoutTimer = null;
let countdownInterval = null;

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

  if (clients.length > 0) {
    currentClientId = clients[0].id;
    clientSelect.value = currentClientId;
  } else {
    currentClientId = null;
  }
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

  if (filteredStores.length > 0) {
    currentStoreId = filteredStores[0].id;
    storeSelect.value = currentStoreId;
  } else {
    currentStoreId = null;
  }
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

  if (currentStores.length > 0) {
    currentStoreId = currentStores[0].id;
    storeSelect.value = currentStoreId;
  } else {
    currentStoreId = null;
  }
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

    showView("view-store");

    const today = new Date().toISOString().slice(0, 10);
    if (chartDate && !chartDate.value) chartDate.value = today;
    if (historyDate && !historyDate.value) historyDate.value = today;

    resetInactivityTimers();

    if (currentStoreId) loadSensors();
    else sensorsContainer.innerHTML = "<p>No hay tiendas disponibles para este usuario.</p>";
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

  if (mainContent) mainContent.style.display = "none";
  if (loginPanel) loginPanel.style.display = "flex"; // importante: mantener centrado
}

if (logoutBtn) logoutBtn.addEventListener("click", logout);

// ------------------------------
// Selectores
// ------------------------------
if (clientSelect) {
  clientSelect.addEventListener("change", () => {
    currentClientId = clientSelect.value;
    fillStoreSelectForClient(currentClientId);

    if (currentStoreId) loadSensors();
    else sensorsContainer.innerHTML = "<p>No hay tiendas asociadas a este cliente.</p>";
  });
}

if (storeSelect) {
  storeSelect.addEventListener("change", () => {
    currentStoreId = storeSelect.value;
    loadSensors();
  });
}

// ------------------------------
// Contador TIENDA
// ------------------------------
async function loadSensors() {
  if (!currentStoreId) {
    sensorsContainer.innerHTML = "<p>Selecciona una tienda para ver los datos.</p>";
    return;
  }

  try {
    sensorsContainer.innerHTML = "<p>Cargando datos de la tienda...</p>";

    const url = `${COUNTERS_URL}?storeId=${encodeURIComponent(currentStoreId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al obtener los contadores: " + res.status);

    const data = await res.json();
    renderStoreCounters(data);
  } catch (err) {
    console.error(err);
    sensorsContainer.innerHTML =
      `<p style="color:red;">No se pudieron cargar los datos de la tienda. Revisa el servidor.</p>`;
  }
}

function renderStoreCounters(counters) {
  if (!counters) {
    sensorsContainer.innerHTML = "<p>No hay datos disponibles aún.</p>";
    return;
  }

  const { storeId, entradas = 0, salidas = 0, dentro = 0 } = counters;
  sensorsContainer.innerHTML = "";

  const card = document.createElement("article");
  card.className = "sensor-card";

  const nowStr = new Date().toLocaleTimeString();
  const storeName = getStoreName(storeId);

  card.innerHTML = `
    <div class="sensor-header">
      <div class="sensor-id">${storeName}</div>
      <div class="sensor-type">Contador de personas</div>
    </div>

    <div class="store-counters">
      <div class="store-counter-item">
        <span class="label">Personas que han ENTRADO</span>
        <span class="value">${entradas}</span>
      </div>
      <div class="store-counter-item">
        <span class="label">Personas que han SALIDO</span>
        <span class="value">${salidas}</span>
      </div>
      <div class="store-counter-item">
        <span class="label">Personas DENTRO de la tienda</span>
        <span class="value">${dentro}</span>
      </div>
    </div>

    <div class="sensor-meta">
      Última actualización: ${nowStr}
    </div>
  `;

  sensorsContainer.appendChild(card);
}

// ------------------------------
// Historial / Gráfico (requiere /api/store/history)
// ------------------------------
async function fetchHistory(dateStr) {
  if (!currentStoreId) throw new Error("No hay tienda seleccionada.");
  if (!dateStr) throw new Error("Selecciona una fecha.");

  const url = `${HISTORY_URL}?storeId=${encodeURIComponent(currentStoreId)}&date=${encodeURIComponent(dateStr)}`;
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
      <p><strong>Entradas:</strong> ${entradas}</p>
      <p><strong>Salidas:</strong> ${salidas}</p>
      <p><strong>Dentro (estimado):</strong> ${dentro}</p>
    `;
  } catch (e) {
    historyResult.innerHTML = `<p style="color:red;">${e.message}</p>`;
  }
}

async function loadChart() {
  if (!chartCtx || !chartCanvas) return;

  try {
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    const dateStr = chartDate?.value;
    const data = await fetchHistory(dateStr);
    drawSimpleChart(data.byHour || {}, dateStr);
  } catch (e) {
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    chartCtx.fillStyle = "#0A2342";
    chartCtx.font = "16px system-ui";
    chartCtx.fillText("No se pudo cargar el gráfico.", 20, 40);
  }
}

function drawSimpleChart(byHour, dateStr) {
  const W = chartCanvas.width;
  const H = chartCanvas.height;

  chartCtx.clearRect(0, 0, W, H);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

  let accE = 0;
  let accS = 0;
  const pointsE = [];
  const pointsS = [];

  hours.forEach((h) => {
    const item = byHour[h] || { entradas: 0, salidas: 0 };
    accE += Number(item.entradas || 0);
    accS += Number(item.salidas || 0);
    pointsE.push(accE);
    pointsS.push(accS);
  });

  const maxY = Math.max(1, ...pointsE, ...pointsS);

  const padL = 50, padR = 15, padT = 20, padB = 45;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  chartCtx.strokeStyle = "rgba(0,0,0,0.25)";
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(padL, padT);
  chartCtx.lineTo(padL, padT + plotH);
  chartCtx.lineTo(padL + plotW, padT + plotH);
  chartCtx.stroke();

  chartCtx.fillStyle = "#0A2342";
  chartCtx.font = "12px system-ui";
  chartCtx.fillText(String(maxY), 10, padT + 5);
  chartCtx.fillText("0", 22, padT + plotH);

  const xAt = (i) => padL + (i / 23) * plotW;
  const yAt = (v) => padT + plotH - (v / maxY) * plotH;

  // Entradas
  chartCtx.strokeStyle = "#1C6DD0";
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  pointsE.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();

  // Salidas
  chartCtx.strokeStyle = "#c0392b";
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  pointsS.forEach((v, i) => {
    const x = xAt(i);
    const y = yAt(v);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();

  const storeName = getStoreName(currentStoreId);
  chartCtx.fillStyle = "#0A2342";
  chartCtx.font = "14px system-ui";
  chartCtx.fillText(`${storeName} — ${dateStr} (acumulado por hora)`, padL, H - 20);
  chartCtx.font = "13px system-ui";
  chartCtx.fillText("Azul: Entradas | Rojo: Salidas", padL, H - 5);
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
