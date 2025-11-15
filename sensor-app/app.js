// URL base de la API (ajusta si se usa IP en vez de localhost)
const BASE_URL = "https://sensor-server-54ak.onrender.com";
// Ejemplo con IP en red local:
// const BASE_URL = "http://192.10.10.17:3000";

const API_URL = `${BASE_URL}/api/sensors`;
const ALERTS_URL = `${BASE_URL}/api/alerts`;

const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

const alertForm = document.getElementById("alertForm");
const alertTypeSelect = document.getElementById("alertType");
const alertBusIdInput = document.getElementById("alertBusId");
const alertMessageInput = document.getElementById("alertMessage");
const alertsContainer = document.getElementById("alertsContainer");

let autoRefreshId = null;

// Nombres para los IDs de los sensores
const prettyNames = {
  "puerta-delantera": "Puerta delantera",
  "puerta-trasera": "Puerta trasera",
  "temperatura-bus": "Temperatura del bus",
  "asientos-disponibles": "Asientos disponibles",
};

// Nombres para los tipos de sensores
const prettyTypes = {
  "contador_personas": "Contador de personas",
  "temperatura": "Temperatura",
  "": "",
  "asientos": "Asientos disponibles",
};

// -------- SENSORES --------

async function loadSensors() {
  try {
    sensorsContainer.innerHTML = "<p>Cargando sensores...</p>";

    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error("Error al obtener los datos: " + res.status);
    }

    const data = await res.json();
    renderSensors(data);
  } catch (err) {
    console.error(err);
    sensorsContainer.innerHTML =
      `<p style="color:red;">No se pudieron cargar los datos. Revisa el servidor.</p>`;
  }
}

function renderSensors(sensors) {
  if (!sensors || sensors.length === 0) {
    sensorsContainer.innerHTML = "<p>No hay sensores registrados aún.</p>";
    return;
  }

  sensorsContainer.innerHTML = "";

  sensors.forEach((s) => {
    const card = document.createElement("article");
    card.className = "sensor-card";

    const lastUpdate = s.lastUpdate
      ? new Date(s.lastUpdate).toLocaleTimeString()
      : "N/A";

    // Mostrar nombres amigables
    const deviceName = prettyNames[s.deviceId] || s.deviceId;
    const typeName = prettyTypes[s.type] || s.type || "tipo desconocido";

    card.innerHTML = `
      <div class="sensor-header">
        <div class="sensor-id">${deviceName}</div>
        <div class="sensor-type">${typeName}</div>
      </div>
      <div class="sensor-value">
        ${s.value !== null && s.value !== undefined ? s.value : "-"}
        <span class="sensor-unit">${s.unit || ""}</span>
      </div>
      <div class="sensor-meta">
        Última actualización: ${lastUpdate}
      </div>
    `;

    sensorsContainer.appendChild(card);
  });
}

// -------- ALERTAS --------

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
    else if (a.type === "falla_bus") typeClass = "alert-falla_bus";

    const timeStr = a.timestamp
      ? new Date(a.timestamp).toLocaleTimeString()
      : "";

    // Texto legible para el tipo de alerta
    const typeTextMap = {
      robo: "Robo / asalto",
      disturbio: "Disturbio / pelea",
      emergencia_medica: "Emergencia médica",
      falla_bus: "Falla del bus",
      otro: "Otro",
    };
    const typeText = typeTextMap[a.type] || a.type;

    card.className = `alert-card ${typeClass}`;

    const busLabel = a.busId ? `Bus ${a.busId}` : "Bus no especificado";

    card.innerHTML = `
      <div class="alert-header">
        <span class="alert-type">${typeText}</span>
        <span class="alert-time">${timeStr}</span>
      </div>
      <div class="alert-message">
        <strong>${busLabel}</strong><br/>
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
  const busId = alertBusIdInput.value.trim();
  const message = alertMessageInput.value.trim();

  if (!busId) {
    alert("Por favor, indica el bus donde ocurrió el incidente.");
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
        busId,
        message,
        source: "web",
      }),
    });

    if (!res.ok) {
      throw new Error("Error al enviar alerta");
    }

    // Limpiar el formulario
    alertMessageInput.value = "";
    // alertBusIdInput.value = "";

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

