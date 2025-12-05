const axios = require("axios");

// URL del backend
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";
// Para pruebas en local:
// const API_URL = "http://localhost:10000/api/sensors/data";

// Sensores de todas las tiendas
const sensors = [
  // Arrow
  { storeId: "arrow-01", deviceId: "arrow01-entrada", type: "entrada" },
  { storeId: "arrow-01", deviceId: "arrow01-salida", type: "salida" },

  { storeId: "arrow-02", deviceId: "arrow02-entrada", type: "entrada" },
  { storeId: "arrow-02", deviceId: "arrow02-salida", type: "salida" },

  { storeId: "arrow-03", deviceId: "arrow03-entrada", type: "entrada" },
  { storeId: "arrow-03", deviceId: "arrow03-salida", type: "salida" },

  // Leoniza
  { storeId: "leoniza-01", deviceId: "leoniza01-entrada", type: "entrada" },
  { storeId: "leoniza-01", deviceId: "leoniza01-salida", type: "salida" },

  { storeId: "leoniza-02", deviceId: "leoniza02-entrada", type: "entrada" },
  { storeId: "leoniza-02", deviceId: "leoniza02-salida", type: "salida" },

  { storeId: "leoniza-03", deviceId: "leoniza03-entrada", type: "entrada" },
  { storeId: "leoniza-03", deviceId: "leoniza03-salida", type: "salida" },

  { storeId: "leoniza-04", deviceId: "leoniza04-entrada", type: "entrada" },
  { storeId: "leoniza-04", deviceId: "leoniza04-salida", type: "salida" },
];

// Estado local: cuántas personas hay dentro según el simulador
const storeState = {}; // { [storeId]: { inside: number } }

function ensureStoreState(storeId) {
  if (!storeState[storeId]) {
    storeState[storeId] = { inside: 0 };
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    ensureStoreState(s.storeId);

    let value = 0;

    if (s.type === "entrada") {
      // Simulamos entradas
      value = randomInt(0, 5);
      if (value === 0) continue;

      storeState[s.storeId].inside += value;
    } else if (s.type === "salida") {
      // No pueden salir más de los que hay dentro
      const currentInside = storeState[s.storeId].inside;
      if (currentInside <= 0) continue;

      const maxSalidaPosible = Math.min(currentInside, randomInt(0, 5));
      if (maxSalidaPosible === 0) continue;

      value = maxSalidaPosible;
      storeState[s.storeId].inside -= value;
    } else {
      continue;
    }

    const body = {
      storeId: s.storeId,
      deviceId: s.deviceId,
      type: s.type,
      value,
      unit: "personas",
    };

    try {
      const res = await axios.post(API_URL, body);
      console.log("✔️ Enviado:", body, "→ dentro simulador:", storeState[s.storeId].inside);
    } catch (err) {
      console.error("❌ Error enviando datos:", err.message);
    }
  }

  console.log("📊 Estado actual (simulador):", storeState);
}

// Esperar 3 segundos para que Render despierte
setTimeout(sendRandomData, 3000);

// Luego cada 5 segundos
setInterval(sendRandomData, 5000);
