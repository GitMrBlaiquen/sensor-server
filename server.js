const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Estado en memoria: último dato por sensor
const sensors = {};

// POST /api/sensors/data
app.post("/api/sensors/data", (req, res) => {
  const { deviceId, type, value, unit, extra } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "Falta deviceId" });
  }

  const now = new Date();

  sensors[deviceId] = {
    deviceId,
    type: type || "desconocido",
    value: value !== undefined ? value : null,
    unit: unit || "",
    extra: extra || {},
    lastUpdate: now,
  };

  console.log("Dato recibido:", sensors[deviceId]);

  res.json({ status: "ok" });
});

// ---------- ALERTAS ----------

// Lista de alertas en memoria
// Cada alerta: { id, type, message, source, busId, timestamp }
let nextAlertId = 1;
const alerts = [];

// POST /api/alerts  -> registrar nueva alerta
app.post("/api/alerts", (req, res) => {
  let { type, message, source, busId } = req.body;

  if (!type) type = "otro";
  if (!message) message = "";
  if (!busId) {
    return res.status(400).json({ error: "Falta busId en la alerta" });
  }

  const alert = {
    id: nextAlertId++,
    type,                    // robo, disturbio, emergencia, etc.
    message,                 // texto libre
    busId,                   // bus al que corresponde la alerta
    source: source || "app", // desde dónde vino (opcional)
    timestamp: new Date(),
  };

  // Insertar al principio (más reciente primero)
  alerts.unshift(alert);

  // Limitar a las últimas 50 alertas
  if (alerts.length > 50) {
    alerts.pop();
  }

  console.log("Alerta recibida:", alert);

  res.json({ status: "ok", alert });
});

// GET /api/alerts -> lista de alertas recientes
app.get("/api/alerts", (req, res) => {
  res.json(alerts);
});

// GET /api/sensors
app.get("/api/sensors", (req, res) => {
  const list = Object.values(sensors).map((s) => ({
    ...s,
    lastUpdate: s.lastUpdate,
  }));
  res.json(list);
});

// GET /api/sensors/:id
app.get("/api/sensors/:id", (req, res) => {
  const sensor = sensors[req.params.id];
  if (!sensor) return res.status(404).json({ error: "Sensor no encontrado" });
  res.json(sensor);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor de sensores accesible en tu red local en el puerto ${PORT}`);
});

