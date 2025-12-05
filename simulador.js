const axios = require("axios");

// 🔹 URL del backend:
// Para local: const API_URL = "http://localhost:10000/api/sensors/data";
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";

// Sensores: puertas de entrada y salida de cada tienda
const sensors = [
  // Tienda 1
  { storeId: "tienda-1", deviceId: "t1-puerta-entrada", type: "entrada" },
  { storeId: "tienda-1", deviceId: "t1-puerta-salida", type: "salida" },

  // Tienda 2
  { storeId: "tienda-2", deviceId: "t2-puerta-entrada", type: "entrada" },
  { storeId: "tienda-2", deviceId: "t2-puerta-salida", type: "salida" },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    // Personas que entran/salen en este intervalo
    const value = randomInt(0, 5); // entre 0 y 5 personas cada ciclo

    if (value === 0) continue; // a veces nadie entra/sale

    const body = {
      storeId: s.storeId,
      deviceId: s.deviceId,
      type: s.type,  // "entrada" o "salida"
      value,         // cuántas personas
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
