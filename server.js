const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Servir el frontend (sensor-app) ---
app.use(express.static(path.join(__dirname, "sensor-app")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sensor-app", "index.html"));
});

// --------------------------------------------------------------
// ---------   MODELO EN MEMORIA: USUARIOS Y TIENDAS   ----------
// --------------------------------------------------------------

// Tiendas disponibles
const stores = {
  "tienda-1": { id: "tienda-1", name: "Tienda 1 - Centro" },
  "tienda-2": { id: "tienda-2", name: "Tienda 2 - Mall" },
};

// Usuarios de ejemplo (2 dueños, cada uno con su tienda)
const users = {
  dueno1: {
    username: "dueno1",
    stores: ["tienda-1"],
  },
  dueno2: {
    username: "dueno2",
    stores: ["tienda-2"],
  },
};

// --------------------------------------------------------------
// ---------------------   LOGIN DE USUARIOS   ------------------
// --------------------------------------------------------------

// POST /api/login
// Body: { username: "dueno1" }
// Respuesta: { username, stores: [ {id, name}, ... ] }
app.post("/api/login", (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Falta username" });
  }

  const user = users[username];
  if (!user) {
    return res.status(401).json({ error: "Usuario no encontrado" });
  }

  // Mapear IDs de tiendas a objetos con id y name
  const userStores = user.stores
    .map((storeId) => stores[storeId])
    .filter(Boolean);

  return res.json({
    username: user.username,
    stores: userStores,
  });
});

// --------------------------------------------------------------
// -----------   CONTADOR DE PERSONAS POR TIENDA   --------------
// --------------------------------------------------------------

// Último dato por sensor (para debug)
const sensors = {};

// Contadores por tienda:
// storeCounters["tienda-1"] = { entradas: X, salidas: Y }
const storeCounters = {};

// Asegurar que exista el objeto de una tienda
function ensureStore(storeId) {
  if (!storeCounters[storeId]) {
    storeCounters[storeId] = { entradas: 0, salidas: 0 };
  }
}

// POST /api/sensors/data
// Espera algo como:
// {
//   storeId: "tienda-1",
//   deviceId: "t1-puerta-entrada",
//   type: "entrada" | "salida",
//   value: 1,
//   unit: "personas"
// }
app.post("/api/sensors/data", (req, res) => {
  const { storeId, deviceId, type, value, unit, extra } = req.body;

  if (!storeId) {
    return res.status(400).json({ error: "Falta storeId" });
  }
  if (!deviceId) {
    return res.status(400).json({ error: "Falta deviceId" });
  }

  const now = new Date();
  const numericValue = value !== undefined ? Number(value) : 1;
  const safeValue = isNaN(numericValue) ? 1 : numericValue;

  // Guardar último dato del sensor
  const sensorKey = `${storeId}:${deviceId}`;
  sensors[sensorKey] = {
    storeId,
    deviceId,
    type: type || "desconocido",
    value: safeValue,
    unit: unit || "",
    extra: extra || {},
    lastUpdate: now,
  };

  // Actualizar contadores de la tienda
  ensureStore(storeId);
  if (type === "entrada") {
    storeCounters[storeId].entradas += safeValue;
  } else if (type === "salida") {
    storeCounters[storeId].salidas += safeValue;
  }

  console.log("Dato recibido:", sensors[sensorKey]);
  console.log(
    `Tienda ${storeId} -> Entradas: ${storeCounters[storeId].entradas}, Salidas: ${storeCounters[storeId].salidas}`
  );

  res.json({ status: "ok" });
});

// GET /api/store/counters?storeId=tienda-1
// Devuelve contadores de UNA tienda
app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;

  if (!storeId) {
    return res.status(400).json({ error: "Falta storeId en la query" });
  }

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({
    storeId,
    entradas,
    salidas,
    dentro,
  });
});

// (Opcional) lista de todas las tiendas
app.get("/api/stores", (req, res) => {
  res.json(Object.values(stores));
});

// (Opcional) debug de sensores
app.get("/api/sensors", (req, res) => {
  res.json(Object.values(sensors));
});

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
