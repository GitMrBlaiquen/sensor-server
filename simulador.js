const axios = require("axios");

// 🔹 URL del backend:
// Recordar usar la de Render o la local
// const API_URL = "http://localhost:10000/api/sensors/data";
const API_URL = "https://sensor-server-54ak.onrender.com/api/sensors/data";

// Sensores: puerta de entrada y puerta de salida de la tienda
const sensors = [
  { deviceId: "puerta-entrada", type: "entrada" },
  { deviceId: "puerta-salida", type: "salida" },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    // Personas que entran/salen en este intervalo
    const value = randomInt(0, 5); // entre 0 y 5 personas cada 5 segundos

    if (value === 0) continue; // a veces nadie entra/sale

    const body = {
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


