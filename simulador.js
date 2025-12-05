const axios = require("axios");

// URL del backend
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    const value = randomInt(0, 5);
    if (value === 0) continue;

    const body = {
      storeId: s.storeId,
      deviceId: s.deviceId,
      type: s.type,
      value,
      unit: "personas",
    };

    try {
      const res = await axios.post(API_URL, body);
      console.log("✔️ Enviado:", body);
    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  }
}

// Esperar 3 segundos para evitar que Render ignore la primera llamada
setTimeout(sendRandomData, 3000);

// Luego cada 5s
setInterval(sendRandomData, 5000);
