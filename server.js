// ================================
// server.js (reescrito)
// ================================
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

// Health (útil para Render)
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

  const userStores = (user.stores || []).map((id) => stores[id]).filter(Boolean);

  return res.json({
    username: user.username,
    role: user.role,
    stores: userStores,
  });
});

// --------------------------------------------------------------
// -----------   CONTADOR + HISTORIAL POR TIENDA   --------------
// --------------------------------------------------------------
const sensors = {}; // debug últimos payloads

const storeCounters = {}; // vivo
const dailyCounters = {}; // resumen por día
const hourlyCounters = {}; // por hora

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function emptyCounters() {
  return {
    entradas: 0,
    salidas: 0,
    inChild: 0,
    outChild: 0,
    workcardCount: 0, // ✅ trabajadores separados
  };
}

function ensureStore(storeId) {
  if (!storeCounters[storeId]) storeCounters[storeId] = emptyCounters();
  if (!dailyCounters[storeId]) dailyCounters[storeId] = {};
  if (!hourlyCounters[storeId]) hourlyCounters[storeId] = {};
}

function ensureDay(storeId, dateKey) {
  ensureStore(storeId);

  if (!dailyCounters[storeId][dateKey]) {
    dailyCounters[storeId][dateKey] = emptyCounters();
  }

  if (!hourlyCounters[storeId][dateKey]) {
    hourlyCounters[storeId][dateKey] = {};
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      hourlyCounters[storeId][dateKey][hh] = emptyCounters();
    }
  }
}

function dateKeyFromTs(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hourKeyFromTs(ts = Date.now()) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, "0");
}

function addDelta(storeId, delta, ts = Date.now()) {
  ensureStore(storeId);

  const e = safeNumber(delta?.entradas, 0);
  const s = safeNumber(delta?.salidas, 0);
  const inChild = safeNumber(delta?.inChild, 0);
  const outChild = safeNumber(delta?.outChild, 0);
  const workcardCount = safeNumber(delta?.workcardCount, 0);

  // vivo
  storeCounters[storeId].entradas += e;
  storeCounters[storeId].salidas += s;
  storeCounters[storeId].inChild += inChild;
  storeCounters[storeId].outChild += outChild;
  storeCounters[storeId].workcardCount += workcardCount;

  // diario + hora
  const dateKey = dateKeyFromTs(ts);
  const hourKey = hourKeyFromTs(ts);

  ensureDay(storeId, dateKey);

  dailyCounters[storeId][dateKey].entradas += e;
  dailyCounters[storeId][dateKey].salidas += s;
  dailyCounters[storeId][dateKey].inChild += inChild;
  dailyCounters[storeId][dateKey].outChild += outChild;
  dailyCounters[storeId][dateKey].workcardCount += workcardCount;

  hourlyCounters[storeId][dateKey][hourKey].entradas += e;
  hourlyCounters[storeId][dateKey][hourKey].salidas += s;
  hourlyCounters[storeId][dateKey][hourKey].inChild += inChild;
  hourlyCounters[storeId][dateKey][hourKey].outChild += outChild;
  hourlyCounters[storeId][dateKey][hourKey].workcardCount += workcardCount;

  const entradasDia = dailyCounters[storeId][dateKey].entradas;
  const salidasDia = dailyCounters[storeId][dateKey].salidas;
  const dentroDia = Math.max(entradasDia - salidasDia, 0);

  return { dateKey, hourKey, entradasDia, salidasDia, dentroDia };
}

// --------------------------------------------------------------
// MAPEO: 1 SENSOR REAL (SN) = 1 TIENDA
// --------------------------------------------------------------
const DEVICE_TO_STORE = {
  "221000002507152508": "arrow-01",
  "211000002507152051": "arrow-02",
  "211000002507152052": "arrow-03",
};

function getStoreIdFromDevice(sn) {
  if (!sn) return null;
  return DEVICE_TO_STORE[String(sn)] || null;
}

function getSnFromStoreId(storeId) {
  const entries = Object.entries(DEVICE_TO_STORE);
  const found = entries.find(([, sId]) => sId === storeId);
  return found ? found[0] : null;
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

/**
 * ✅ Aquí está el cambio clave:
 * - Calculamos workIn/workOut mirando attributes (workcard=1)
 * - Restamos workIn de entradas y workOut de salidas
 * - workcardCount se guarda aparte y NO afecta el conteo de personas
 */
function normalizeCounts(body) {
  const entradasRaw = safeNumber(
    body.in ?? body.enter ?? body.Enter ?? body.In ?? body.inNum ?? body.InNum ?? 0,
    0
  );

  const salidasRaw = safeNumber(
    body.out ?? body.leave ?? body.Leave ?? body.Out ?? body.outNum ?? body.OutNum ?? 0,
    0
  );

  const inChild = safeNumber(body.inChild ?? body.InChild ?? 0, 0);
  const outChild = safeNumber(body.outChild ?? body.OutChild ?? 0, 0);

  const attrs = Array.isArray(body.attributes) ? body.attributes : [];
  let workcardCount = 0;
  let workIn = 0;
  let workOut = 0;

  for (const a of attrs) {
    if (Number(a?.workcard || 0) !== 1) continue;

    workcardCount += 1;

    const eventType = Number(a?.eventType);
    if (eventType === 1) workIn += 1; // asumimos 1=entrada
    else if (eventType === 2) workOut += 1; // asumimos 2=salida
    // si viene otro valor, no restamos (para no meter error)
  }

  const entradas = Math.max(entradasRaw - workIn, 0);
  const salidas = Math.max(salidasRaw - workOut, 0);

  return { entradas, salidas, inChild, outChild, workcardCount };
}

// --------------------------------------------------------------
// ---------   HEARTBEAT TRACKING (ONLINE / OFFLINE)   ----------
// --------------------------------------------------------------
const lastHeartbeatBySn = {};
const HEARTBEAT_ONLINE_MS = 90 * 1000;

function isOnlineBySn(sn) {
  const last = lastHeartbeatBySn[String(sn)] || 0;
  if (!last) return false;
  return Date.now() - last <= HEARTBEAT_ONLINE_MS;
}

app.get("/api/sensors/status", (req, res) => {
  const now = Date.now();
  const result = {};

  Object.keys(DEVICE_TO_STORE).forEach((sn) => {
    const last = lastHeartbeatBySn[String(sn)] || 0;
    result[String(sn)] = {
      sn: String(sn),
      storeId: DEVICE_TO_STORE[String(sn)] || null,
      online: last > 0 && now - last <= HEARTBEAT_ONLINE_MS,
      lastHeartbeat: last || null,
      lastHeartbeatAgoMs: last ? now - last : null,
    };
  });

  res.json(result);
});

app.get("/api/store/status", (req, res) => {
  const storeId = String(req.query.storeId || "");
  if (!storeId) return res.status(400).json({ error: "Falta storeId" });

  const sn = getSnFromStoreId(storeId);
  if (!sn) {
    return res.json({
      storeId,
      sn: null,
      online: false,
      lastHeartbeat: null,
      lastHeartbeatAgoMs: null,
      note: "No hay SN mapeado a esta tienda en DEVICE_TO_STORE",
    });
  }

  const last = lastHeartbeatBySn[String(sn)] || 0;
  const now = Date.now();

  return res.json({
    storeId,
    sn: String(sn),
    online: isOnlineBySn(sn),
    lastHeartbeat: last || null,
    lastHeartbeatAgoMs: last ? now - last : null,
  });
});

// ---------------- DISPLAY POR SN ----------------
app.get("/api/display", (req, res) => {
  const sn = String(req.query.sn || "");
  if (!sn) return res.status(400).json({ error: "Falta sn" });

  const storeId = getStoreIdFromDevice(sn);
  if (!storeId) return res.status(404).json({ error: "SN no mapeado", sn });

  ensureStore(storeId);
  const c = storeCounters[storeId];
  const dentro = Math.max(c.entradas - c.salidas, 0);

  res.json({
    sn,
    storeId,
    entradas: c.entradas,
    salidas: c.salidas,
    dentro,
    inChild: c.inChild,
    outChild: c.outChild,
    workcardCount: c.workcardCount,
  });
});

// --------------------------------------------------------------
// 1) ENDPOINT “ANTIGUO” (simulador)
// --------------------------------------------------------------
app.post("/api/sensors/data", (req, res) => {
  const { storeId, deviceId, type, value, unit, extra } = req.body || {};

  if (!storeId) return res.status(400).json({ error: "Falta storeId" });
  if (!deviceId) return res.status(400).json({ error: "Falta deviceId" });

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

  const delta = {
    entradas: type === "entrada" ? safeValue : 0,
    salidas: type === "salida" ? safeValue : 0,
    inChild: 0,
    outChild: 0,
    workcardCount: 0,
  };

  addDelta(storeId, delta, Date.now());
  return res.json({ status: "ok" });
});

// --------------------------------------------------------------
// 2) SENSOR REAL (JSON MODE)
// --------------------------------------------------------------
app.post("/api/camera/heartBeat", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;

  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();
  console.log("❤️ heartBeat:", { from: req.ip, sn, online: sn ? isOnlineBySn(sn) : false });

  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;
  const storeId = getStoreIdFromDevice(sn);

  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();

  console.log("📦 dataUpload:", { from: req.ip, sn, storeId });

  const sensorKey = `${storeId || "unknown"}:SN:${sn || "no-sn"}`;
  sensors[sensorKey] = {
    storeId: storeId || null,
    deviceId: `SN:${sn || "no-sn"}`,
    type: "sensor-real",
    value: null,
    unit: "",
    extra: body,
    lastUpdate: new Date(),
  };

  if (!storeId) {
    console.warn("⚠️ SN no mapeado. Agrégalo en DEVICE_TO_STORE:", sn);
    return okSensor(res);
  }

  const delta = normalizeCounts(body);
  addDelta(storeId, delta, Date.now());

  console.log(
    `✅ ${storeId} (SN ${sn}) Clientes +E ${delta.entradas} +S ${delta.salidas} | ` +
      `Niños +E ${delta.inChild} +S ${delta.outChild} | WorkCard ${delta.workcardCount}`
  );

  return okSensor(res);
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------
app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const c = storeCounters[storeId];
  const dentro = Math.max(c.entradas - c.salidas, 0);

  res.json({
    storeId,
    entradas: c.entradas,
    salidas: c.salidas,
    dentro,
    inChild: c.inChild,
    outChild: c.outChild,
    workcardCount: c.workcardCount,
  });
});

app.get("/api/store/history", (req, res) => {
  const { storeId, date } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });
  if (!date) return res.status(400).json({ error: "Falta date=YYYY-MM-DD" });

  ensureDay(storeId, date);

  const d = dailyCounters[storeId][date];
  const dentro = Math.max(d.entradas - d.salidas, 0);
  const byHour = hourlyCounters[storeId][date] || {};

  res.json({
    storeId,
    date,
    entradas: d.entradas,
    salidas: d.salidas,
    dentro,
    inChild: d.inChild,
    outChild: d.outChild,
    workcardCount: d.workcardCount,
    byHour,
  });
});

// Debug
app.get("/api/stores", (req, res) => res.json(Object.values(stores)));
app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));
app.get("/api/debug/counters", (req, res) => res.json(storeCounters));
app.get("/api/debug/daily", (req, res) => res.json(dailyCounters));
app.get("/api/debug/hourly", (req, res) => res.json(hourlyCounters));
app.get("/api/debug/heartbeat", (req, res) => res.json(lastHeartbeatBySn));

// ---------------- START ----------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
