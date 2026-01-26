const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// ---------------- MIDDLEWARES ----------------
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------- FRONTEND ----------------
app.use(express.static(path.join(__dirname, "sensor-app")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sensor-app", "index.html"));
});

// Health (útil para probar en Render)
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
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

// ---------------- LOGIN ----------------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

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
    role: user.role, // "admin" / "dueño"
    stores: userStores,
  });
});

// --------------------------------------------------------------
// -----------   CONTADOR + HISTORIAL POR TIENDA   --------------
// --------------------------------------------------------------

// debug: últimos payloads por sensor
const sensors = {};

// contadores “en vivo”
const storeCounters = {}; // { storeId: { entradas, salidas } }

// historial diario (resumen)
const dailyCounters = {}; // { storeId: { "YYYY-MM-DD": { entradas, salidas } } }

// serie para gráfico (puntos por día)
const dailySeries = {}; // { storeId: { "YYYY-MM-DD": [ {ts, entradas, salidas, dentro, deltaE, deltaS} ] } }

// límites para no explotar memoria
const MAX_POINTS_PER_DAY = 2000;

// helpers
function ensureStore(storeId) {
  if (!storeCounters[storeId]) storeCounters[storeId] = { entradas: 0, salidas: 0 };
  if (!dailyCounters[storeId]) dailyCounters[storeId] = {};
  if (!dailySeries[storeId]) dailySeries[storeId] = {};
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function todayKey() {
  // YYYY-MM-DD en hora local del servidor
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensureDay(storeId, dateKey) {
  ensureStore(storeId);
  if (!dailyCounters[storeId][dateKey]) dailyCounters[storeId][dateKey] = { entradas: 0, salidas: 0 };
  if (!dailySeries[storeId][dateKey]) dailySeries[storeId][dateKey] = [];
}

function addDelta(storeId, deltaEntradas, deltaSalidas, meta = {}) {
  const e = safeNumber(deltaEntradas, 0);
  const s = safeNumber(deltaSalidas, 0);

  ensureStore(storeId);

  // 1) vivo
  storeCounters[storeId].entradas += e;
  storeCounters[storeId].salidas += s;

  // 2) diario
  const dateKey = meta.dateKey || todayKey();
  ensureDay(storeId, dateKey);
  dailyCounters[storeId][dateKey].entradas += e;
  dailyCounters[storeId][dateKey].salidas += s;

  // 3) serie
  const entradasTotal = dailyCounters[storeId][dateKey].entradas;
  const salidasTotal = dailyCounters[storeId][dateKey].salidas;
  const dentro = Math.max(entradasTotal - salidasTotal, 0);

  const arr = dailySeries[storeId][dateKey];
  arr.push({
    ts: Date.now(),
    entradas: entradasTotal,
    salidas: salidasTotal,
    dentro,
    deltaE: e,
    deltaS: s,
  });

  if (arr.length > MAX_POINTS_PER_DAY) {
    arr.splice(0, arr.length - MAX_POINTS_PER_DAY);
  }

  return { dateKey, entradasTotal, salidasTotal, dentro };
}

// --------------------------------------------------------------
// MAPEO: 1 SENSOR REAL (SN) = 1 TIENDA
// --------------------------------------------------------------
const DEVICE_TO_STORE = {
  // ⚠️ Asegúrate que sea EXACTO a lo que llega como body.sn
  "221000002507152508": "arrow-01",
  // agrega más cuando conectes otros sensores:
  // "SN_DE_OTRO_SENSOR": "arrow-02",
};

function getStoreIdFromDevice(sn) {
  if (!sn) return null;
  return DEVICE_TO_STORE[String(sn)] || null;
}

function okSensor(res, extraData = {}) {
  return res.json({
    code: 0,
    msg: "success",
    data: {
      time: Math.floor(Date.now() / 1000),
      ...extraData,
    },
  });
}

function normalizeCounts(body) {
  // nombres típicos
  const entradas = safeNumber(
    body.in ?? body.enter ?? body.Enter ?? body.In ?? body.inNum ?? body.InNum ?? 0,
    0
  );
  const salidas = safeNumber(
    body.out ?? body.leave ?? body.Leave ?? body.Out ?? body.outNum ?? body.OutNum ?? 0,
    0
  );
  return { entradas, salidas };
}

// --------------------------------------------------------------
// 1) ENDPOINT “ANTIGUO” (simulador)
// --------------------------------------------------------------
app.post("/api/sensors/data", (req, res) => {
  const { storeId, deviceId, type, value, unit, extra } = req.body || {};

  if (!storeId) return res.status(400).json({ error: "Falta storeId" });
  if (!deviceId) return res.status(400).json({ error: "Falta deviceId" });

  ensureStore(storeId);

  const safeValue = safeNumber(value, 1);
  const now = new Date();

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

  let dE = 0;
  let dS = 0;
  if (type === "entrada") dE = safeValue;
  else if (type === "salida") dS = safeValue;

  const result = addDelta(storeId, dE, dS);

  console.log("🧪 Simulador:", sensors[sensorKey], "=>", result);
  return res.json({ status: "ok" });
});

// --------------------------------------------------------------
// 2) SENSOR REAL (JSON MODE)
//    POST /api/camera/heartBeat
//    POST /api/camera/dataUpload
// --------------------------------------------------------------
app.post("/api/camera/heartBeat", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;

  console.log("❤️ heartBeat:", { from: req.ip, sn });

  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;
  const storeId = getStoreIdFromDevice(sn);

  console.log("📦 dataUpload:", { from: req.ip, sn, storeId });

  if (!storeId) {
    console.warn("⚠️ SN no mapeado a tienda. Agrega en DEVICE_TO_STORE:", sn);

    sensors[`unknown:SN:${sn || "no-sn"}`] = {
      storeId: null,
      deviceId: `SN:${sn || "no-sn"}`,
      type: "sensor-real",
      value: null,
      unit: "",
      extra: body,
      lastUpdate: new Date(),
    };

    return okSensor(res);
  }

  ensureStore(storeId);

  const { entradas, salidas } = normalizeCounts(body);

  // guardar debug del payload
  sensors[`${storeId}:SN:${sn}`] = {
    storeId,
    deviceId: `SN:${sn}`,
    type: "sensor-real",
    value: null,
    unit: "",
    extra: body,
    lastUpdate: new Date(),
  };

  const result = addDelta(storeId, entradas, salidas);

  console.log(`✅ ${storeId} (SN ${sn}) -> +E ${entradas}, +S ${salidas} =>`, result);
  return okSensor(res);
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------

// contador “en vivo”
app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ storeId, entradas, salidas, dentro });
});

// días con historial (calendario)
app.get("/api/store/days", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const days = Object.keys(dailyCounters[storeId] || {}).sort(); // YYYY-MM-DD
  res.json({ storeId, days });
});

// resumen del día (calendario)
app.get("/api/store/history", (req, res) => {
  const { storeId, date } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });
  if (!date) return res.status(400).json({ error: "Falta date=YYYY-MM-DD" });

  ensureStore(storeId);
  ensureDay(storeId, date);

  const { entradas, salidas } = dailyCounters[storeId][date];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ storeId, date, entradas, salidas, dentro });
});

// serie del día (para gráfico simple)
app.get("/api/store/series", (req, res) => {
  const { storeId, date } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });
  if (!date) return res.status(400).json({ error: "Falta date=YYYY-MM-DD" });

  ensureStore(storeId);
  ensureDay(storeId, date);

  res.json({
    storeId,
    date,
    points: dailySeries[storeId][date] || [],
  });
});

app.get("/api/stores", (req, res) => res.json(Object.values(stores)));
app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));
app.get("/api/debug/counters", (req, res) => res.json(storeCounters));
app.get("/api/debug/daily", (req, res) => res.json(dailyCounters));

// ---------------- START ----------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
