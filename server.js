const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());

// Body universal: capturamos TODO como Buffer (JSON o XML)
app.use(
  express.raw({
    type: "*/*",
    limit: "2mb",
  })
);

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
// -------------------- Helpers Body / Parseo -------------------
// --------------------------------------------------------------

function getRawText(req) {
  if (!req.body) return "";
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  // Por si algo raro
  try {
    return JSON.stringify(req.body);
  } catch {
    return String(req.body);
  }
}

function tryParseJsonFromText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getJsonBody(req) {
  // Si viene como Buffer -> texto -> JSON
  const text = getRawText(req).trim();
  if (!text) return null;

  // A veces el sensor manda JSON pero con Content-Type raro, igual lo intentamos
  const parsed = tryParseJsonFromText(text);
  return parsed;
}

// Parseo XML simple (suficiente para detectar tags típicos)
function extractXmlValue(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = String(xml).match(re);
  return m ? m[1] : null;
}

function normalizeCounts(obj) {
  const entradas =
    obj.in ??
    obj.enter ??
    obj.Enter ??
    obj.In ??
    obj.inNum ??
    obj.InNum ??
    obj.inCount ??
    obj.EnterCount ??
    0;

  const salidas =
    obj.out ??
    obj.leave ??
    obj.Leave ??
    obj.Out ??
    obj.outNum ??
    obj.OutNum ??
    obj.outCount ??
    obj.LeaveCount ??
    0;

  const e = Number(entradas);
  const s = Number(salidas);

  return {
    entradas: Number.isFinite(e) ? e : 0,
    salidas: Number.isFinite(s) ? s : 0,
  };
}

function okSensor(res, extraData = {}) {
  // Respuesta típica que muchos sensores esperan
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
// ---------------------   LOGIN DE USUARIOS   ------------------
// --------------------------------------------------------------

app.post("/api/login", (req, res) => {
  const body = getJsonBody(req) || {};
  const { username, password } = body;

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
//  (SN/DeviceId real del sensor -> tienda)
// --------------------------------------------------------------
const DEVICE_TO_STORE = {
  "22100000250715250": "arrow-01",
  // Agrega más así:
  // "SN_DEL_SENSOR_2": "arrow-02",
  // "SN_DEL_SENSOR_3": "leonisa-01",
};

function getStoreIdFromDevice(deviceId) {
  if (!deviceId) return null;
  return DEVICE_TO_STORE[String(deviceId)] || null;
}

// --------------------------------------------------------------
// 1) ENDPOINT “ANTIGUO” (simulador / pruebas manuales)
// --------------------------------------------------------------
app.post("/api/sensors/data", (req, res) => {
  const body = getJsonBody(req) || {};
  const { storeId, deviceId, type, value, unit, extra } = body;

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
    type,
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
// 2) ENDPOINTS “SENSOR REAL” (del PDF)
//    POST /api/camera/heartBeat
//    POST /api/camera/dataUpload
//
// También dejamos rutas “compatibles” por si tu software manda otras:
//    POST /heartbeat
//    POST /api/posttest
// --------------------------------------------------------------

// ---- HEARTBEAT (JSON o XML) ----
app.post("/api/camera/heartBeat", (req, res) => {
  const text = getRawText(req).trim();
  const asJson = tryParseJsonFromText(text);

  console.log("❤️ /api/camera/heartBeat ->", asJson || text || "(vacío)");

  // Puedes controlar parámetros desde aquí
  return okSensor(res, {
    uploadInterval: 1, // minutos
    dataMode: "Add",
  });
});

// Compatibilidad
app.post("/heartbeat", (req, res) => {
  const text = getRawText(req).trim();
  const asJson = tryParseJsonFromText(text);

  console.log("❤️ /heartbeat ->", asJson || text || "(vacío)");

  return okSensor(res, {
    uploadInterval: 1,
    dataMode: "Add",
  });
});

// ---- DATA UPLOAD (JSON o XML) ----
app.post("/api/camera/dataUpload", (req, res) => {
  const text = getRawText(req).trim();
  const asJson = tryParseJsonFromText(text);

  // Si no es JSON, intentamos leer como XML
  if (!asJson) {
    console.log("📦 /api/camera/dataUpload (RAW/XML):\n", text);

    const deviceId =
      extractXmlValue(text, "sn") ||
      extractXmlValue(text, "SN") ||
      extractXmlValue(text, "deviceId") ||
      extractXmlValue(text, "DeviceId") ||
      extractXmlValue(text, "id");

    const storeId = getStoreIdFromDevice(deviceId);

    if (!storeId) {
      console.warn("⚠️ dataUpload XML pero SN/DeviceId no mapeado:", deviceId);
      sensors[`unknown:SN:${deviceId || "no-id"}`] = {
        storeId: null,
        deviceId,
        type: "sensor-real-xml",
        extra: { raw: text },
        lastUpdate: new Date(),
      };
      return okSensor(res);
    }

    ensureStore(storeId);

    const inVal =
      extractXmlValue(text, "in") ||
      extractXmlValue(text, "enter") ||
      extractXmlValue(text, "Enter") ||
      extractXmlValue(text, "inNum") ||
      "0";

    const outVal =
      extractXmlValue(text, "out") ||
      extractXmlValue(text, "leave") ||
      extractXmlValue(text, "Leave") ||
      extractXmlValue(text, "outNum") ||
      "0";

    const entradas = Number(inVal);
    const salidas = Number(outVal);

    const eSafe = Number.isFinite(entradas) ? entradas : 0;
    const sSafe = Number.isFinite(salidas) ? salidas : 0;

    storeCounters[storeId].entradas += eSafe;
    storeCounters[storeId].salidas += sSafe;

    sensors[`${storeId}:SN:${deviceId}`] = {
      storeId,
      deviceId: `SN:${deviceId}`,
      type: "sensor-real-xml",
      extra: { raw: text },
      lastUpdate: new Date(),
    };

    console.log(`✅ ${storeId} (SN ${deviceId}) XML +E ${eSafe} +S ${sSafe}`);
    return okSensor(res);
  }

  // JSON normal
  const body = asJson || {};
  console.log("📦 /api/camera/dataUpload (JSON):", body);

  const deviceId =
    body.sn || body.SN || body.deviceId || body.DeviceId || body.id || body.ID;

  const storeId = getStoreIdFromDevice(deviceId);

  if (!storeId) {
    console.warn("⚠️ dataUpload JSON pero SN/DeviceId no mapeado:", deviceId);
    sensors[`unknown:SN:${deviceId || "no-id"}`] = {
      storeId: null,
      deviceId,
      type: "sensor-real",
      extra: body,
      lastUpdate: new Date(),
    };
    return okSensor(res);
  }

  ensureStore(storeId);

  const { entradas, salidas } = normalizeCounts(body);
  storeCounters[storeId].entradas += entradas;
  storeCounters[storeId].salidas += salidas;

  sensors[`${storeId}:SN:${deviceId}`] = {
    storeId,
    deviceId: `SN:${deviceId}`,
    type: "sensor-real",
    extra: body,
    lastUpdate: new Date(),
  };

  console.log(`✅ ${storeId} (SN ${deviceId}) +E ${entradas} +S ${salidas}`);
  return okSensor(res);
});

// Compatibilidad: “posttest”
app.post("/api/posttest", (req, res) => {
  const text = getRawText(req).trim();
  const asJson = tryParseJsonFromText(text);

  console.log("📦 /api/posttest ->", asJson || text || "(vacío)");
  // Respondemos OK para que el sensor/software no se quede pegado
  return okSensor(res);
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------

app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;
  if (!storeId)
    return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ storeId, entradas, salidas, dentro });
});

app.get("/api/stores", (req, res) => res.json(Object.values(stores)));
app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));
app.get("/api/debug/counters", (req, res) => res.json(storeCounters));

// Health (útil para Render)
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
