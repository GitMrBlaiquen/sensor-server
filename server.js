const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());

// IMPORTANTE: el sensor manda JSON (application/json)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Servir el frontend (sensor-app) ---
app.use(express.static(path.join(__dirname, "sensor-app")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sensor-app", "index.html"));
});

// --------------------------------------------------------------
// ---------   MODELO EN MEMORIA: USUARIOS Y TIENDAS   ----------
// --------------------------------------------------------------

const stores = {
  "arrow-01": { id: "arrow-01", name: "Tienda Arrow 01" },
  "arrow-02": { id: "arrow-02", name: "Tienda Arrow 02" },
  "arrow-03": { id: "arrow-03", name: "Tienda Arrow 03" },

  "leonisa-01": { id: "leonisa-01", name: "Tienda Leonisa 01" },
  "leonisa-02": { id: "leonisa-02", name: "Tienda Leonisa 02" },
  "leonisa-03": { id: "leonisa-03", name: "Tienda Leonisa 03" },
  "leonisa-04": { id: "leonisa-04", name: "Tienda Leonisa 04" },
};

const users = {
  Vicente: {
    username: "Vicente",
    password: "Admin09867",
    role: "admin",
    stores: Object.keys(stores),
  },
  Rodrigo: {
    username: "Rodrigo",
    password: "Admin170817",
    role: "admin",
    stores: Object.keys(stores),
  },
  Arrow: {
    username: "Arrow",
    password: "Arrow57105",
    role: "dueño",
    stores: ["arrow-01", "arrow-02", "arrow-03"],
  },
  Leonisa: {
    username: "Leonisa",
    password: "Leonisa99481",
    role: "dueño",
    stores: ["leonisa-01", "leonisa-02", "leonisa-03", "leonisa-04"],
  },
};

// --------------------------------------------------------------
// ---------------------   LOGIN DE USUARIOS   ------------------
// --------------------------------------------------------------

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Faltan username o password" });
  }

  const user = users[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Usuario o contraseña inválidos" });
  }

  const userStores = user.stores.map((id) => stores[id]).filter(Boolean);

  return res.json({
    username: user.username,
    role: user.role,
    stores: userStores,
  });
});

// --------------------------------------------------------------
// -----------   CONTADOR DE PERSONAS POR TIENDA   --------------
// --------------------------------------------------------------

// Debug: últimos payloads recibidos
const sensors = {};

// Contadores por tienda (en memoria)
const storeCounters = {};
function ensureStore(storeId) {
  if (!storeCounters[storeId]) {
    storeCounters[storeId] = { entradas: 0, salidas: 0 };
  }
}

// --------------------------------------------------------------
//  MAPEO: SN DEL SENSOR -> TIENDA
//  (Pon aquí TODOS tus sensores reales cuando los tengas)
// --------------------------------------------------------------
const DEVICE_TO_STORE = {
  // ESTE ES EL SN QUE TE APARECIÓ EN LA TERMINAL:
  "221000002507152508": "arrow-01",
};

function getStoreIdFromDevice(deviceId) {
  if (!deviceId) return null;
  return DEVICE_TO_STORE[String(deviceId)] || null;
}

function okSensor(res, extraData = {}) {
  // Respuesta típica que esperan estos sensores
  return res.json({
    code: 0,
    msg: "success",
    data: {
      time: Math.floor(Date.now() / 1000),
      ...extraData,
    },
  });
}

// --------------------------------------------------------------
// 1) ENDPOINT “ANTIGUO” (simulador / pruebas manuales)
// --------------------------------------------------------------
app.post("/api/sensors/data", (req, res) => {
  const { storeId, deviceId, type, value, unit, extra } = req.body;

  if (!storeId) return res.status(400).json({ error: "Falta storeId" });
  if (!deviceId) return res.status(400).json({ error: "Falta deviceId" });

  ensureStore(storeId);

  const now = new Date();
  const numericValue = value !== undefined ? Number(value) : 1;
  const safeValue = Number.isFinite(numericValue) ? numericValue : 1;

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

  if (type === "entrada") storeCounters[storeId].entradas += safeValue;
  else if (type === "salida") storeCounters[storeId].salidas += safeValue;

  console.log("🧪 Simulador:", sensors[sensorKey]);
  return res.json({ status: "ok" });
});

// --------------------------------------------------------------
// 2) ENDPOINTS SENSOR REAL (JSON Mode)
// --------------------------------------------------------------

// Heartbeat del sensor
app.post("/api/camera/heartBeat", (req, res) => {
  console.log("❤️ HEARTBEAT /api/camera/heartBeat", req.body);

  // Puedes ajustar uploadInterval si quieres (minutos)
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

// Data upload del sensor (contiene in/out)
app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  console.log("📦 DATAUPLOAD /api/camera/dataUpload", body);

  const deviceId = body.sn || body.SN || body.deviceId || body.DeviceId || body.id || body.ID;
  const storeId = getStoreIdFromDevice(deviceId);

  // Guardar payload aunque no esté mapeado (para debug)
  sensors[`sensor-real:${deviceId || "no-id"}`] = {
    storeId: storeId || null,
    deviceId: deviceId ? `SN:${deviceId}` : "SN:unknown",
    type: "sensor-real",
    value: null,
    unit: "",
    extra: body,
    lastUpdate: new Date(),
  };

  if (!storeId) {
    console.warn("⚠️ SN/DeviceId no mapeado a tienda:", deviceId);
    return okSensor(res);
  }

  ensureStore(storeId);

  const entradas = Number(body.in ?? body.enter ?? body.Enter ?? body.In ?? 0);
  const salidas = Number(body.out ?? body.leave ?? body.Leave ?? body.Out ?? 0);

  const safeEntradas = Number.isFinite(entradas) ? entradas : 0;
  const safeSalidas = Number.isFinite(salidas) ? salidas : 0;

  storeCounters[storeId].entradas += safeEntradas;
  storeCounters[storeId].salidas += safeSalidas;

  console.log(`✅ ${storeId} (SN ${deviceId}) +E ${safeEntradas} +S ${safeSalidas}`);
  return okSensor(res);
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------

app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ storeId, entradas, salidas, dentro });
});

// (Opcional) lista de tiendas
app.get("/api/stores", (req, res) => res.json(Object.values(stores)));

// (Opcional) debug sensores
app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));

// (Opcional) ver contadores internos (debug)
app.get("/api/debug/counters", (req, res) => res.json(storeCounters));

// Health check (útil para Render)
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
