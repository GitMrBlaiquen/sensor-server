const axios = require("axios");

async function enviarDatoPrueba() {
  try {
    const body = {
      deviceId: "sensor-test",
      type: "contador_personas",
      value: 8,
      unit: "personas",
    };

    const res = await axios.post(
      "http://localhost:3000/api/sensors/data",
      body
    );

    console.log("Dato enviado correctamente.");
    console.log("Respuesta del servidor:", res.data);
  } catch (err) {
    console.error("Error al enviar dato:", err.message);
  }
}

enviarDatoPrueba();
