// URL base de la API (ajusta si se usa IP en vez de localhost)
const BASE_URL = "https://sensor-server-54ak.onrender.com";
// Ejemplo con IP en red local:
// const BASE_URL = "http://192.10.10.17:10000";

const COUNTERS_URL = `${BASE_URL}/api/store/counters`;
const ALERTS_URL = `${BASE_URL}/api/alerts`;

const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

const alertForm = document.getElementById("alertForm");
const alertTypeSelect = document.getElementById("alertType");
// Reutilizar el mismo input, pero ahora usar como "ubicación/zona"
const alertLocationInput = document.getElementById("alertBusId");
const alertMessageInput = document.getElementById("alertMessage");
const alertsContainer = document.getElementById("alertsContainer");

let autoRefreshId = null;

// -------- CONTADOR TIENDA (ENTRADAS / SALIDAS) --------

async function loadSensors() {
  try {
    sensorsContainer.innerHTML = "<p>Cargando datos de la tienda...</p>";

    const res = await fetch(COUNTERS_URL);
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

  const { entradas = 0, salidas = 0, dentro = 0 } = counters;

  sensorsContainer.innerHTML = "";

  const card = document.createElement("article");
  card.className = "sensor-card";

  const nowStr = new Date().toLocaleTimeString();

  card.innerHTML = `
    <div class="sensor-header">
      <div class="sensor-id">Tienda comercial</div>
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

// -------- ALERTAS (adaptadas a tienda) --------

async function loadAlerts() {
  try {
    const res = await fetch(ALERTS_URL);
    if (!res.ok) {
      throw new Error("Error al obtener las alertas: " + res.status);
    }

    const data = await res.json();
    renderAlerts(data);
  } catch (err) {
    console.error(err);
    alertsContainer.innerHTML =
      `<p style="color:red;">No se pudieron cargar las alertas.</p>`;
  }
}

function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    alertsContainer.innerHTML = "<p>No hay alertas registradas.</p>";
    return;
  }

  alertsContainer.innerHTML = "";

  alerts.forEach((a) => {
    const card = document.createElement("article");
    let typeClass = "";

    if (a.type === "robo") typeClass = "alert-robo";
    else if (a.type === "disturbio") typeClass = "alert-disturbio";
    else if (a.type === "emergencia_medica")
      typeClass = "alert-emergencia_medica";
    else if (a.type === "falla_bus") // código legacy, pero lo usamos como falla en sistema/instalación
      typeClass = "alert-falla_sistema";

    const timeStr = a.timestamp
      ? new Date(a.timestamp).toLocaleTimeString()
      : "";

    // Texto legible para el tipo de alerta (en contexto de tienda)
    const typeTextMap = {
      robo: "Robo / hurto",
      disturbio: "Disturbio / pelea",
      emergencia_medica: "Emergencia médica",
      falla_bus: "Falla en sistema o infraestructura",
      otro: "Otro",
    };
    const typeText = typeTextMap[a.type] || a.type;

    card.className = `alert-card ${typeClass}`;

    // Usamos a.busId como "ubicación/zona" en la tienda
    const locationLabel = a.busId
      ? `Ubicación: ${a.busId}`
      : "Ubicación no especificada";

    card.innerHTML = `
      <div class="alert-header">
        <span class="alert-type">${typeText}</span>
        <span class="alert-time">${timeStr}</span>
      </div>
      <div class="alert-message">
        <strong>${locationLabel}</strong><br/>
        ${a.message ? a.message : "<i>Sin descripción</i>"}
      </div>
    `;

    alertsContainer.appendChild(card);
  });
}

// Manejar envío del formulario de alerta
alertForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = alertTypeSelect.value;
  const location = alertLocationInput.value.trim();
  const message = alertMessageInput.value.trim();

  if (!location) {
    alert("Por favor, indica la ubicación o zona donde ocurrió el incidente.");
    return;
  }

  try {
    const res = await fetch(ALERTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        // El backend aún usa el campo "busId", pero aquí lo tratamos como "ubicación"
        busId: location,
        message,
        source: "web",
      }),
    });

    if (!res.ok) {
      throw new Error("Error al enviar alerta");
    }

    // Limpiar el mensaje (puedes limpiar también la ubicación si quieres)
    alertMessageInput.value = "";

    // Recargar la lista de alertas
    loadAlerts();
  } catch (err) {
    console.error(err);
    alert("No se pudo enviar la alerta. Revisa el servidor.");
  }
});

// -------- CONTROLES GENERALES --------

// Botón de refresco manual para sensores y alertas
refreshBtn.addEventListener("click", () => {
  loadSensors();
  loadAlerts();
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
      loadAlerts();
    }, interval);
  }
});

// Carga inicial
loadSensors();
loadAlerts();


