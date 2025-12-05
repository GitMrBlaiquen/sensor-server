// URL base de la API
// Si lo sirves desde Render, usar window.location.origin hace que apunte
// automáticamente al mismo dominio del servidor.
const BASE_URL = window.location.origin;
// Si quieres probar en local, puedes comentar la de arriba y usar esta:
// const BASE_URL = "http://localhost:10000";

const COUNTERS_URL = `${BASE_URL}/api/store/counters`;

const sensorsContainer = document.getElementById("sensorsContainer");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSelect = document.getElementById("refreshInterval");

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

// Carga inicial
loadSensors();



