// URL base de la API
const BASE_URL = window.location.origin;
// Para pruebas locales, puedes usar:
// const BASE_URL = "http://localhost:10000";

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;

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

// Selector de tienda
const storeSelectorSection = document.getElementById("storeSelectorSection");
const storeSelect = document.getElementById("storeSelect");

let autoRefreshId = null;

// Estado actual
let currentUser = null;
let currentStores = [];
let currentStoreId = null;

// -------- LOGIN --------

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
    currentStores = data.stores || [];

    if (currentStores.length === 0) {
      loginStatus.textContent = "El usuario no tiene tiendas asignadas.";
      loginStatus.style.color = "red";
      return;
    }

    // Llenar el selector de tiendas
    fillStoreSelect();
    storeSelectorSection.style.display = "block";

    loginStatus.textContent = "";
    // Ocultar login y mostrar panel principal
    loginPanel.style.display = "none";
    mainContent.style.display = "block";

    // Cargar la primera tienda
    currentStoreId = currentStores[0].id;
    loadSensors();
  } catch (err) {
    console.error(err);
    loginStatus.textContent = err.message || "No se pudo iniciar sesión.";
    loginStatus.style.color = "red";
  }
}

function fillStoreSelect() {
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
  }
}

// Cambiar tienda seleccionada
storeSelect.addEventListener("change", () => {
  currentStoreId = storeSelect.value;
  loadSensors();
});

// Click en login
loginBtn.addEventListener("click", login);

// Enter en inputs
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// -------- CONTADOR TIENDA (ENTRADAS / SALIDAS) --------

async function loadSensors() {
  if (!currentStoreId) {
    sensorsContainer.innerHTML =
      "<p>Inicia sesión y selecciona una tienda para ver los datos.</p>";
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

  // Nombre de tienda
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

// -------- CONTROLES GENERALES --------

// Botón de refresco manual
refreshBtn.addEventListener("click", () => {
  loadSensors();
});

// Auto-actualización
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

