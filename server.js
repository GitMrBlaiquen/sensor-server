const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());

// JSON normal (simulador + algunos sensores)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Para capturar texto/XML crudo en endpoints específicos
const rawText = express.text({ type: "*/*", limit: "2mb" });

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
  // Tiendas de Arrow
  "arrow-01": { id: "arrow-01", name: "Tienda Arrow 01" },
  "arrow-02": { id: "arrow-02", name: "Tienda Arrow 02" },
  "arrow-03": { id: "arrow-03", name: "Tienda Arrow 03" },

  // Tiendas de Leonisa
  "leonisa-01": { id: "leonisa-01", name: "Tienda Leonisa 01" },
  "leonisa-02": { id: "leonisa-02", name: "Tienda Leonisa 02" },
  "leonisa-03": { id: "leonisa-03", name: "Tienda Leonisa 03" },
  "leonisa-04": { id: "leonisa-04", name: "Tienda Leonisa 04" },
};

// Usuarios del sistema
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

// Debug: últimos payloads
const sensors = {};

// Contadores por tienda
const storeCounters = {};
function ensureStore(storeId) {
  if (!storeCounters[storeId]) {
    storeCounters[storeId] = { entradas: 0, salidas: 0 };
  }
}

// --------------------------------------------------------------
//  MAPEO: 1 SENSOR REAL = 1 TIENDA
//  (Pon aquí el SN/DeviceId real del sensor -> tienda)
// --------------------------------------------------------------
const DEVICE_TO_STORE = {
   "22100000250715250": "arrow-01",
};

function getStoreIdFromDevice(deviceId) {
  if (!deviceId) return null;
  return DEVICE_TO_STORE[String(deviceId)] || null;
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
  sensors[sensorKey] = { storeId, deviceId, type, value: safeValue, unit: unit || "", extra: extra || {}, lastUpdate: now };

  if (type === "entrada") storeCounters[storeId].entradas += safeValue;
  else if (type === "salida") storeCounters[storeId].salidas += safeValue;

  console.log("🧪 Simulador:", sensors[sensorKey]);
  return res.json({ status: "ok" });
});

// --------------------------------------------------------------
// 2) ENDPOINTS “SENSOR REAL” (compatibles con JSON y XML)
//    Como NO sabemos exactamente el formato, aceptamos:
//    - /api/camera/heartBeat   /api/camera/dataUpload
//    - /heartbeat             /api/posttest
// --------------------------------------------------------------

// ---- helpers de parseo ----
function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Parseo XML MUY simple (para detectar algunos campos típicos)
function extractXmlValue(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = String(xml).match(re);
  return m ? m[1] : null;
}

function normalizeCounts(obj) {
  // Intenta leer varios nombres típicos de conteo
  const entradas =
    obj.in ?? obj.enter ?? obj.Enter ?? obj.In ?? obj.inNum ?? obj.InNum ?? obj.inCount ?? obj.EnterCount ?? 0;

  const salidas =
    obj.out ?? obj.leave ?? obj.Leave ?? obj.Out ?? obj.outNum ?? obj.OutNum ?? obj.outCount ?? obj.LeaveCount ?? 0;

  const e = Number(entradas);
  const s = Number(salidas);

  return {
    entradas: Number.isFinite(e) ? e : 0,
    salidas: Number.isFinite(s) ? s : 0,
  };
}

function okSensor(res, extraData = {}) {
  // Muchos sensores esperan code=0
  return res.json({
    code: 0,
    msg: "success",
    data: {
      time: Math.floor(Date.now() / 1000),
      ...extraData,
    },
  });
}

// ---- heartbeats ----
app.post("/api/camera/heartBeat", (req, res) => {
  console.log("❤️ heartBeat (json):", req.body);
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/heartbeat", rawText, (req, res) => {
  console.log("❤️ heartBeat (raw):", req.body);
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

// ---- data upload (JSON típico) ----
app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  console.log("📦 dataUpload (json):", body);

  const deviceId = body.sn || body.SN || body.deviceId || body.DeviceId || body.id || body.ID;
  const storeId = getStoreIdFromDevice(deviceId);

  if (!storeId) {
    console.warn("⚠️ dataUpload recibido pero DEVICE/SN no está mapeado:", deviceId);
    sensors[`unknown:SN:${deviceId || "no-id"}`] = { storeId: null, deviceId, type: "sensor-real", extra: body, lastUpdate: new Date() };
    return okSensor(res);
  }

  ensureStore(storeId);

  const { entradas, salidas } = normalizeCounts(body);
  storeCounters[storeId].entradas += entradas;
  storeCounters[storeId].salidas += salidas;

  sensors[`${storeId}:SN:${deviceId}`] = { storeId, deviceId: `SN:${deviceId}`, type: "sensor-real", extra: body, lastUpdate: new Date() };

  console.log(`✅ ${storeId} (SN ${deviceId}) +E ${entradas} +S ${salidas}`);
  return okSensor(res);
});

// ---- data upload (XML típico / posttest) ----
app.post("/api/posttest", rawText, (req, res) => {
  const raw = req.body || "";
  console.log("📦 posttest (raw):", raw);

  // 1) intenta JSON en texto
  const asJson = tryParseJSON(raw);
  if (asJson) {
    // reusa la lógica JSON
    req.body = asJson;
    return app._router.handle(req, res, () => {});
  }

  // 2) intenta XML
  // Estos tags dependen del sensor: ponemos opciones típicas
  const deviceId =
    extractXmlValue(raw, "sn") ||
    extractXmlValue(raw, "SN") ||
    extractXmlValue(raw, "deviceId") ||
    extractXmlValue(raw, "DeviceId") ||
    extractXmlValue(raw, "id");

  const storeId = getStoreIdFromDevice(deviceId);
  if (!storeId) {
    console.warn("⚠️ XML recibido pero DEVICE/SN no mapeado:", deviceId);
    sensors[`unknown:SN:${deviceId || "no-id"}`] = { storeId: null, deviceId, type: "sensor-real-xml", extra: { raw }, lastUpdate: new Date() };
    return okSensor(res);
  }

  ensureStore(storeId);

  const inVal =
    extractXmlValue(raw, "in") ||
    extractXmlValue(raw, "enter") ||
    extractXmlValue(raw, "Enter") ||
    extractXmlValue(raw, "inNum") ||
    "0";

  const outVal =
    extractXmlValue(raw, "out") ||
    extractXmlValue(raw, "leave") ||
    extractXmlValue(raw, "Leave") ||
    extractXmlValue(raw, "outNum") ||
    "0";

  const entradas = Number(inVal);
  const salidas = Number(outVal);

  storeCounters[storeId].entradas += Number.isFinite(entradas) ? entradas : 0;
  storeCounters[storeId].salidas += Number.isFinite(salidas) ? salidas : 0;

  sensors[`${storeId}:SN:${deviceId}`] = { storeId, deviceId: `SN:${deviceId}`, type: "sensor-real-xml", extra: { raw }, lastUpdate: new Date() };

  console.log(`✅ ${storeId} (SN ${deviceId}) XML +E ${entradas} +S ${salidas}`);
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

app.get("/api/stores", (req, res) => res.json(Object.values(stores)));

app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));

app.get("/api/debug/counters", (req, res) => res.json(storeCounters));

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
