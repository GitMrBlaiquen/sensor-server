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

// Debug: últimos payloads por sensor
const sensors = {};

// Contadores “en vivo”
const storeCounters = {}; // { storeId: { entradas, salidas } }

// Historial por día (resumen)
const dailyCounters = {}; // { storeId: { "YYYY-MM-DD": { entradas, salidas } } }

// Historial por hora del día (para gráfico)
const hourlyCounters = {};
// { storeId: { "YYYY-MM-DD": { "00":{entradas,salidas}, ..., "23":{entradas,salidas} } } }

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureStore(storeId) {
  if (!storeCounters[storeId]) storeCounters[storeId] = { entradas: 0, salidas: 0 };
  if (!dailyCounters[storeId]) dailyCounters[storeId] = {};
  if (!hourlyCounters[storeId]) hourlyCounters[storeId] = {};
}

function ensureDay(storeId, dateKey) {
  ensureStore(storeId);

  if (!dailyCounters[storeId][dateKey]) {
    dailyCounters[storeId][dateKey] = { entradas: 0, salidas: 0 };
  }

  if (!hourlyCounters[storeId][dateKey]) {
    hourlyCounters[storeId][dateKey] = {};
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      hourlyCounters[storeId][dateKey][hh] = { entradas: 0, salidas: 0 };
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

function addDelta(storeId, deltaE, deltaS, ts = Date.now()) {
  const e = safeNumber(deltaE, 0);
  const s = safeNumber(deltaS, 0);

  ensureStore(storeId);

  // vivo
  storeCounters[storeId].entradas += e;
  storeCounters[storeId].salidas += s;

  // diario + hora
  const dateKey = dateKeyFromTs(ts);
  const hourKey = hourKeyFromTs(ts);

  ensureDay(storeId, dateKey);

  dailyCounters[storeId][dateKey].entradas += e;
  dailyCounters[storeId][dateKey].salidas += s;

  hourlyCounters[storeId][dateKey][hourKey].entradas += e;
  hourlyCounters[storeId][dateKey][hourKey].salidas += s;

  const entradasDia = dailyCounters[storeId][dateKey].entradas;
  const salidasDia = dailyCounters[storeId][dateKey].salidas;
  const dentroDia = Math.max(entradasDia - salidasDia, 0);

  return { dateKey, hourKey, entradasDia, salidasDia, dentroDia };
}

// --------------------------------------------------------------
// MAPEO: 1 SENSOR REAL (SN) = 1 TIENDA
// --------------------------------------------------------------
// ✅ Tú confirmaste que este SN es el de la demo:
//    221000002507152508
// Lo dejo mapeado a arrow-01 para la demo.
const DEVICE_TO_STORE = {
  "221000002507152508": "arrow-01",

  // Si tienes otro sensor, lo agregas aquí:
  // "211000002507152051": "arrow-02",
};

function getStoreIdFromDevice(sn) {
  if (!sn) return null;
  return DEVICE_TO_STORE[String(sn)] || null;
}

function getSnFromStoreId(storeId) {
  // Busca el primer SN que apunte a esa tienda (como tienes 1 SN por tienda, sirve perfecto)
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

function normalizeCounts(body) {
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
// ---------   HEARTBEAT TRACKING (ONLINE / OFFLINE)   ----------
// --------------------------------------------------------------
const lastHeartbeatBySn = {}; // { "SN": timestampMs }
const HEARTBEAT_ONLINE_MS = 90 * 1000; // 🟢 online si llegó hb hace <= 90s

function isOnlineBySn(sn) {
  const last = lastHeartbeatBySn[String(sn)] || 0;
  if (!last) return false;
  return Date.now() - last <= HEARTBEAT_ONLINE_MS;
}

// Endpoint para frontend (todos)
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

// Endpoint para frontend (una tienda)
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

// ---------------- DISPLAY POR SN (para pantallas demo) ----------------
// GET /api/display?sn=221000002507152508
app.get("/api/display", (req, res) => {
  const sn = String(req.query.sn || "");
  if (!sn) return res.status(400).json({ error: "Falta sn" });

  const storeId = getStoreIdFromDevice(sn);
  if (!storeId) return res.status(404).json({ error: "SN no mapeado", sn });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ sn, storeId, entradas, salidas, dentro });
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

  let dE = 0;
  let dS = 0;
  if (type === "entrada") dE = safeValue;
  else if (type === "salida") dS = safeValue;

  const result = addDelta(storeId, dE, dS, Date.now());
  console.log("🧪 Simulador:", sensorKey, "=>", result);

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

  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();

  console.log("❤️ heartBeat:", { from: req.ip, sn, online: sn ? isOnlineBySn(sn) : false });

  // Ajustable: cada cuántos minutos manda data
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;
  const storeId = getStoreIdFromDevice(sn);

  // si por algún motivo no llega heartBeat, al menos dataUpload lo marca como “vivo”
  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();

  console.log("📦 dataUpload:", { from: req.ip, sn, storeId });

  // Guardar debug del payload siempre
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

  const { entradas, salidas } = normalizeCounts(body);

  // IMPORTANTE: asumimos que el sensor manda DELTAS (modo Add)
  const result = addDelta(storeId, entradas, salidas, Date.now());

  console.log(`✅ ${storeId} (SN ${sn}) +E ${entradas} +S ${salidas} =>`, result);
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

app.get("/api/store/days", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const days = Object.keys(dailyCounters[storeId] || {}).sort();
  res.json({ storeId, days });
});

app.get("/api/store/history", (req, res) => {
  const { storeId, date } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });
  if (!date) return res.status(400).json({ error: "Falta date=YYYY-MM-DD" });

  ensureDay(storeId, date);

  const { entradas, salidas } = dailyCounters[storeId][date];
  const dentro = Math.max(entradas - salidas, 0);
  const byHour = hourlyCounters[storeId][date] || {};

  res.json({ storeId, date, entradas, salidas, dentro, byHour });
});

// Debug / utilidades
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
