// URL base de la API
const BASE_URL = window.location.origin;
// Para pruebas locales, puedes usar:
// const BASE_URL = "http://localhost:10000";

const LOGIN_URL = `${BASE_URL}/api/login`;
const COUNTERS_URL = `${BASE_URL}/api/store/counters`;

const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

const usernameInput = document.getElementById("usernameInput");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

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

  if (!username) {
    loginStatus.textContent = "Ingresa un usuario.";
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
      body: JSON.stringify({ username }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Usuario no encontrado. Prueba con dueno1 o dueno2.");
      }
      throw new Error("Error en el login.");
    }

    const data = await res.json();
    currentUser = data.username;
    currentStores = data.stores || [];

    if (currentStores.length === 0) {
      loginStatus.textContent = "El usuario no tiene tiendas asignadas.";
      loginStatus.style.color = "red";
      storeSelectorSection.style.display = "none";
      sensorsContainer.innerHTML = "<p>Este usuario no tiene tiendas para mostrar.</p>";
      return;
    }

    // Llenar el selector de tiendas
    fillStoreSelect();
    storeSelectorSection.style.display = "block";

    loginStatus.textContent = `Sesión iniciada como ${currentUser}.`;
    loginStatus.style.color = "green";

    // Cargar datos de la primera tienda
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

  // Buscar nombre bonito de la tienda
  let storeName = storeId;
  const found = currentStores.find((s) => s.id === storeId);
  if (found && found.name) {
    storeName = found.name;
  }

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

// Carga inicial: mostrar mensaje de login
sensorsContainer.innerHTML =
  "<p>Ingresa un usuario (ej: <strong>dueno1</strong> o <strong>dueno2</strong>) y presiona Entrar.</p>";
