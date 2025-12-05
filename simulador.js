const axios = require("axios");

// URL del backend (Render)
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";
// Para probar en local, puedes usar:
// const API_URL = "http://localhost:10000/api/sensors/data";

// -------------------------------------------------------------
// PERFILES DE TIENDAS (más o menos movimiento)
// -------------------------------------------------------------
// enterMin / enterMax = cuánta gente entra por ciclo (cuando hay entradas)
// exitMax = máximo de personas que pueden salir por ciclo
const storeProfiles = {
  // Arrow
  "arrow-01": { enterMin: 2, enterMax: 7, exitMax: 6 }, // muy concurrida
  "arrow-02": { enterMin: 1, enterMax: 4, exitMax: 4 }, // media
  "arrow-03": { enterMin: 0, enterMax: 2, exitMax: 2 }, // tranquila

  // Leoniza
  "leoniza-01": { enterMin: 0, enterMax: 3, exitMax: 3 }, // tranquila
  "leoniza-02": { enterMin: 1, enterMax: 5, exitMax: 4 }, // media
  "leoniza-03": { enterMin: 0, enterMax: 2, exitMax: 2 }, // tranquila
  "leoniza-04": { enterMin: 3, enterMax: 8, exitMax: 6 }, // muy concurrida
};

// Sensores de todas las tiendas (entrada y salida)
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

// Estado local de cuántas personas hay dentro por tienda
const storeState = {}; // { [storeId]: { inside: number } }

function ensureStoreState(storeId) {
  if (!storeState[storeId]) {
    storeState[storeId] = { inside: 0 };
  }
}

function randomInt(min, max) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    const profile = storeProfiles[s.storeId] || { enterMin: 0, enterMax: 3, exitMax: 3 };
    ensureStoreState(s.storeId);

    let value = 0;

    if (s.type === "entrada") {
      // Entradas según el perfil de la tienda
      value = randomInt(profile.enterMin, profile.enterMax);
      if (value <= 0) continue;

      storeState[s.storeId].inside += value;
    } else if (s.type === "salida") {
      const currentInside = storeState[s.storeId].inside;
      if (currentInside <= 0) continue;

      // No pueden salir más de los que hay dentro
      const maxTeorico = Math.min(profile.exitMax, currentInside);
      value = randomInt(0, maxTeorico);
      if (value <= 0) continue;

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
      await axios.post(API_URL, body);
      console.log(
        `✔️ ${s.storeId} ${s.type} +${value} → dentro ahora: ${storeState[s.storeId].inside}`
      );
    } catch (err) {
      console.error("❌ Error enviando datos:", err.message);
    }
  }

  console.log("📊 Estado simulador:", storeState);
}

// Espera 3 segundos para que Render despierte
setTimeout(sendRandomData, 3000);

// Luego envía datos cada 5 segundos
setInterval(sendRandomData, 5000);
