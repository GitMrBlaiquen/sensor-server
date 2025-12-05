const axios = require("axios");

// 🔹 URL del backend (Render):
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";
// Para local:
// const API_URL = "http://localhost:10000/api/sensors/data";

// -------------------------------------------------------------
// SENSORES POR TIENDA (entrada/salida)
// -------------------------------------------------------------

const sensors = [
  // ---------------- Arrow (3 tiendas) ----------------
  { storeId: "arrow-01", deviceId: "arrow01-entrada", type: "entrada" },
  { storeId: "arrow-01", deviceId: "arrow01-salida", type: "salida" },

  { storeId: "arrow-02", deviceId: "arrow02-entrada", type: "entrada" },
  { storeId: "arrow-02", deviceId: "arrow02-salida", type: "salida" },

  { storeId: "arrow-03", deviceId: "arrow03-entrada", type: "entrada" },
  { storeId: "arrow-03", deviceId: "arrow03-salida", type: "salida" },

  // ---------------- Leoniza (4 tiendas) ----------------
  { storeId: "leoniza-01", deviceId: "leoniza01-entrada", type: "entrada" },
  { storeId: "leoniza-01", deviceId: "leoniza01-salida", type: "salida" },

  { storeId: "leoniza-02", deviceId: "leoniza02-entrada", type: "entrada" },
  { storeId: "leoniza-02", deviceId: "leoniza02-salida", type: "salida" },

  { storeId: "leoniza-03", deviceId: "leoniza03-entrada", type: "entrada" },
  { storeId: "leoniza-03", deviceId: "leoniza03-salida", type: "salida" },

  { storeId: "leoniza-04", deviceId: "leoniza04-entrada", type: "entrada" },
  { storeId: "leoniza-04", deviceId: "leoniza04-salida", type: "salida" },
];

// -------------------------------------------------------------
// FUNCIONES
// -------------------------------------------------------------

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    // Personas que entran/salen en este intervalo
    const value = randomInt(0, 6); // entre 0 y 6 personas cada ciclo

    if (value === 0) continue; // a veces nadie entra/sale

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

// Enviar una vez al arrancar
sendRandomData();

// Enviar datos cada 5 segundos
setInterval(sendRandomData, 5000);
