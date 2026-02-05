const BASE_URL = window.location.origin;

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;
const HISTORY_URL = `${BASE_URL}/api/store/history`;
const STATUS_URL = `${BASE_URL}/api/store/status`;

const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

const loginPanel = document.getElementById("loginPanel");
const mainContent = document.getElementById("mainContent");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

const clientSelectorSection = document.getElementById("clientSelectorSection");
const clientSelect = document.getElementById("clientSelect");

const storeSelect = document.getElementById("storeSelect");

const sessionWarningModal = document.getElementById("sessionWarningModal");
const stayLoggedBtn = document.getElementById("stayLoggedBtn");
const logoutNowBtn = document.getElementById("logoutNowBtn");
const countdownSpan = document.getElementById("countdownSeconds");

const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

const chartDate = document.getElementById("chartDate");
const loadChartBtn = document.getElementById("loadChartBtn");
const chartCanvas = document.getElementById("chartCanvas");
const chartCtx = chartCanvas ? chartCanvas.getContext("2d") : null;

const historyDate = document.getElementById("historyDate");
const loadHistoryBtn = document.getElementById("loadHistoryBtn");
const historyResult = document.getElementById("historyResult");

let autoRefreshId = null;

let statusPollId = null;
const STATUS_POLL_MS = 3000;

let currentUser = null;
let currentRole = null;
let currentStores = [];
let currentStoreId = null;

let clients = [];
let currentClientId = null;

// ---------------- Utils
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
  const filteredStores = currentStores.filter((s) => getClientIdFromStoreId(s.id) === clientId);
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

// ---------------- Views
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

// ---------------- Inactividad
const INACTIVITY_LIMIT_MS = 1 * 60 * 1000;
const WARNING_DURATION_MS = 30 * 1000;

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

// ---------------- Polling estado
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
  } catch {}
}

// ---------------- Login
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

// ---------------- Logout
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

  if (mainContent) mainContent.style.display = "none";
  if (loginPanel) loginPanel.style.display = "flex";
}
if (logoutBtn) logoutBtn.addEventListener("click", logout);

// ---------------- Selectores
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

// ---------------- loadSensors
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
    entradas = 0,     // ✅ clientes (ya restado)
    salidas = 0,      // ✅ clientes
    dentro = 0,       // ✅ clientes dentro
    inChild = 0,
    outChild = 0,
    workersIn = 0,    // ✅ trabajadores (no suman a clientes)
    totalEntradas = 0, // opcional debug
  } = counters || {};

  const online = !!status?.online;
  const sn = status?.sn || "SN desconocido";

  sensorsContainer.innerHTML = "";

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
        <span class="label">Clientes que han ENTRADO (sin trabajadores)</span>
        <span class="value">${entradas}</span>
      </div>

      <div class="store-counter-item">
        <span class="label">Clientes que han SALIDO</span>
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

      <div class="store-counter-item" style="opacity:0.75;">
        <span class="label">Total entradas del sensor (debug)</span>
        <span class="value">${totalEntradas}</span>
      </div>
    </div>

    <div class="sensor-meta">
      Última actualización: ${nowStr}
    </div>
  `;

  sensorsContainer.appendChild(card);
}

// (el resto: history/chart queda igual si lo quieres mantener)
if (loadHistoryBtn) loadHistoryBtn.addEventListener("click", async () => {});
if (loadChartBtn) loadChartBtn.addEventListener("click", async () => {});

if (refreshBtn) refreshBtn.addEventListener("click", () => loadSensors());
if (refreshSelect) {
  refreshSelect.addEventListener("change", () => {
    const interval = Number(refreshSelect.value);
    if (autoRefreshId) {
      clearInterval(autoRefreshId);
      autoRefreshId = null;
    }
    if (interval > 0) autoRefreshId = setInterval(() => loadSensors(), interval);
  });
}

if (sensorsContainer) {
  sensorsContainer.innerHTML = "<p>Inicia sesión para ver el contador de personas.</p>";
}
