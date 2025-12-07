const axios = require("axios");

// Para local:
// const API_URL = "http://localhost:10000/api/sensors/data";
// Para Render:
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";

// Sensores: puertas de entrada y salida de cada tienda
const sensors = [
  // Arrow
  { storeId: "arrow-01", deviceId: "arrow01-entrada", type: "entrada" },
  { storeId: "arrow-01", deviceId: "arrow01-salida", type: "salida" },

  { storeId: "arrow-02", deviceId: "arrow02-entrada", type: "entrada" },
  { storeId: "arrow-02", deviceId: "arrow02-salida", type: "salida" },

  { storeId: "arrow-03", deviceId: "arrow03-entrada", type: "entrada" },
  { storeId: "arrow-03", deviceId: "arrow03-salida", type: "salida" },

  // Leonisa
  { storeId: "leonisa-01", deviceId: "leo01-entrada", type: "entrada" },
  { storeId: "leonisa-01", deviceId: "leo01-salida", type: "salida" },

  { storeId: "leonisa-02", deviceId: "leo02-entrada", type: "entrada" },
  { storeId: "leonisa-02", deviceId: "leo02-salida", type: "salida" },

  { storeId: "leonisa-03", deviceId: "leo03-entrada", type: "entrada" },
  { storeId: "leonisa-03", deviceId: "leo03-salida", type: "salida" },

  { storeId: "leonisa-04", deviceId: "leo04-entrada", type: "entrada" },
  { storeId: "leonisa-04", deviceId: "leo04-salida", type: "salida" },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    const value = randomInt(0, 5); // 0–5 personas por ciclo

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
      console.log("Enviado:", body, "→ respuesta:", res.status);
    } catch (err) {
      console.error("Error enviando datos:", err.message);
    }
  }
}

sendRandomData();
setInterval(sendRandomData, 5000);
