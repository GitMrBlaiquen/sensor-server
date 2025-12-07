// URL base de la API
const BASE_URL = window.location.origin;
// Para pruebas locales, puedes usar:
// const BASE_URL = "http://localhost:10000";

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;

// Elementos principales
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
const storeSelectorSection = document.getElementById("storeSelectorSection");
const storeSelect = document.getElementById("storeSelect");

let autoRefreshId = null;

// Estado actual
let currentUser = null;
let currentRole = null;       // "admin" o "dueño"
let currentStores = [];       // tiendas asignadas al usuario
let currentStoreId = null;

// Solo para admin:
let clients = [];             // [{id: "arrow", name: "Arrow"}, ...]
let currentClientId = null;

// ------------------------------------
// Utilidades para clientes / tiendas
// ------------------------------------

function getClientIdFromStoreId(storeId) {
  // Ej: "arrow-01" => "arrow"
  const parts = storeId.split("-");
  return parts[0] || storeId;
}

function formatClientName(clientId) {
  if (!clientId) return "";
  return clientId.charAt(0).toUpperCase() + clientId.slice(1);
}

function buildClientsFromStores(stores) {
  const found = new Set();
  const list = [];

  stores.forEach((store) => {
    const clientId = getClientIdFromStoreId(store.id);
    if (!found.has(clientId)) {
      found.add(clientId);
      list.push({
        id: clientId,
        name: formatClientName(clientId),
      });
    }
  });

  return list;
}

function fillClientSelect() {
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
  }
}

function fillStoreSelectForClient(clientId) {
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

// ------------------------------------
// LOGIN
// ------------------------------------

async function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Usuario o contraseña incorrectos.");
      }
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
        clientSelectorSection.style.display = "block";
      } else {
        clientSelectorSection.style.display = "none";
        fillStoreSelectSimple();
      }
    } else {
      clients = [];
      currentClientId = null;
      clientSelectorSection.style.display = "none";
      fillStoreSelectSimple();
    }

    loginStatus.textContent = "";
    loginPanel.style.display = "none";
    mainContent.style.display = "block";

    if (currentStoreId) {
      loadSensors();
    } else {
      sensorsContainer.innerHTML =
        "<p>No hay tiendas disponibles para este usuario.</p>";
    }
  } catch (err) {
    console.error(err);
    loginStatus.textContent = err.message || "No se pudo iniciar sesión.";
    loginStatus.style.color = "red";
  }
}

// Eventos login
loginBtn.addEventListener("click", login);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// ------------------------------------
// LOGOUT
// ------------------------------------

function logout() {
  if (autoRefreshId) {
    clearInterval(autoRefreshId);
    autoRefreshId = null;
  }

  currentUser = null;
  currentRole = null;
  currentStores = [];
  currentStoreId = null;
  clients = [];
  currentClientId = null;

  if (userInfo) userInfo.textContent = "";
  storeSelect.innerHTML = "";
  clientSelect.innerHTML = "";
  clientSelectorSection.style.display = "none";

  sensorsContainer.innerHTML =
    "<p>Inicia sesión para ver el contador de personas.</p>";

  loginStatus.textContent = "";
  usernameInput.value = "";
  passwordInput.value = "";

  mainContent.style.display = "none";
  loginPanel.style.display = "block";
}

logoutBtn.addEventListener("click", logout);

// ------------------------------------
// SELECTORES (cliente y tienda)
// ------------------------------------

clientSelect.addEventListener("change", () => {
  currentClientId = clientSelect.value;
  fillStoreSelectForClient(currentClientId);
  if (currentStoreId) {
    loadSensors();
  } else {
    sensorsContainer.innerHTML =
      "<p>No hay tiendas asociadas a este cliente.</p>";
  }
});

storeSelect.addEventListener("change", () => {
  currentStoreId = storeSelect.value;
  loadSensors();
});

// ------------------------------------
// CONTADOR TIENDA (ENTRADAS / SALIDAS)
// ------------------------------------

async function loadSensors() {
  if (!currentStoreId) {
    sensorsContainer.innerHTML =
      "<p>Selecciona una tienda para ver los datos.</p>";
    return;
  }

  try {
    sensorsContainer.innerHTML = "<p>Cargando datos de la tienda...</p>";

    const url = `${COUNTERS_URL}?storeId=${encodeURIComponent(currentStoreId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Error al obtener los contadores: " + res.status);
    }

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

  let storeName = storeId;
  const found = currentStores.find((s) => s.id === storeId);
  if (found && found.name) storeName = found.name;

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

// ------------------------------------
// CONTROLES GENERALES
// ------------------------------------

refreshBtn.addEventListener("click", () => {
  loadSensors();
});

refreshSelect.addEventListener("change", () => {
  const interval = Number(refreshSelect.value);

  if (autoRefreshId) {
    clearInterval(autoRefreshId);
    autoRefreshId = null;
  }

  if (interval > 0) {
    autoRefreshId = setInterval(() => {
      loadSensors();
    }, interval);
  }
});

// Mensaje inicial
sensorsContainer.innerHTML =
  "<p>Inicia sesión para ver el contador de personas.</p>";
