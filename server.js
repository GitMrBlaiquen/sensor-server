const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Servir el frontend (sensor-app) ---
app.use(express.static(path.join(__dirname, "sensor-app")));

// Cuando el usuario entra a la raíz "/", se envía index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sensor-app", "index.html"));
});

// --------------------------------------------------------------
// -----------   CONTADOR DE PERSONAS EN TIENDA   ---------------
// --------------------------------------------------------------

// Estado en memoria: último dato por sensor (puertas, etc.)
const sensors = {};

// Contadores globales para la tienda
let totalEntradas = 0;
let totalSalidas = 0;

// POST /api/sensors/data
// Espera algo como:
// { deviceId: "puerta-entrada", type: "entrada" | "salida", value: 1, unit: "personas" }
app.post("/api/sensors/data", (req, res) => {
  const { deviceId, type, value, unit, extra } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "Falta deviceId" });
  }

  const now = new Date();
  const numericValue = value !== undefined ? Number(value) : 1;
  const safeValue = isNaN(numericValue) ? 1 : numericValue;

  // Guardar último dato del sensor
  sensors[deviceId] = {
    deviceId,
    type: type || "desconocido",
    value: safeValue,
    unit: unit || "",
    extra: extra || {},
    lastUpdate: now,
  };

  // Actualizar contadores globales según el tipo
  if (type === "entrada") {
    totalEntradas += safeValue;
  } else if (type === "salida") {
    totalSalidas += safeValue;
  }

  console.log("Dato recibido:", sensors[deviceId]);
  console.log(
    "Totales tienda -> Entradas:",
    totalEntradas,
    "Salidas:",
    totalSalidas
  );

  res.json({ status: "ok" });
});

// GET /api/store/counters
// Devuelve resumen para el panel: entradas, salidas y personas dentro
app.get("/api/store/counters", (req, res) => {
  const dentro = Math.max(totalEntradas - totalSalidas, 0);
  res.json({
    entradas: totalEntradas,
    salidas: totalSalidas,
    dentro,
  });
});

// --------------------------------------------------------------
// ---------   RUTA OPCIONAL: listar sensores (debug)   ---------
// --------------------------------------------------------------

// GET /api/sensors -> lista completa de últimos datos por sensor
app.get("/api/sensors", (req, res) => {
  const list = Object.values(sensors).map((s) => ({
    ...s,
    lastUpdate: s.lastUpdate,
  }));
  res.json(list);
});

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDA activo en el puerto ${PORT}`);
});



