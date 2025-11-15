const axios = require("axios");

const API_URL = "http://localhost:3000/api/sensors/data";

// Lista de sensores de ejemplo
const sensors = [
  { deviceId: "puerta-delantera", type: "contador_personas", unit: "personas" },
  { deviceId: "puerta-trasera", type: "contador_personas", unit: "personas" },
  { deviceId: "temperatura-bus", type: "temperatura", unit: "°C" },
  { deviceId: "asientos-disponibles", type: "asientos", unit: "asientos" }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendRandomData() {
  for (const s of sensors) {
    let value;

    if (s.type === "contador_personas") {
      value = randomInt(0, 60);    // 0–60 personas
    } else if (s.type === "temperatura") {
      value = randomInt(18, 35);   // 18–35 °C
    } else if (s.type === "asientos") {
      value = randomInt(0, 40);   // Asientos disponibles
    } else {
      value = randomInt(0, 100);
    }

    const body = {
      deviceId: s.deviceId,
      type: s.type,
      value,
      unit: s.unit,
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
