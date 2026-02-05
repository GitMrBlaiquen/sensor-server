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
const sensors = {}; // debug

// ✅ Ahora guardamos:
// - totalEntradas/totalSalidas (RAW del sensor)
// - entradas/salidas = CLIENTES (ya restado workcard de entradas)
// - workersIn = trabajadores entraron (por workcard)
// - niños in/out
function emptyCounters() {
  return {
    // RAW del sensor
    totalEntradas: 0,
    totalSalidas: 0,

    // ✅ clientes (lo que verá el usuario)
    entradas: 0,
    salidas: 0,

    // extras
    inChild: 0,
    outChild: 0,
    workersIn: 0, // ✅ trabajadores que entraron (workcard)
  };
}

const storeCounters = {}; // vivo
const dailyCounters = {}; // por día
const hourlyCounters = {}; // por hora

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

// delta: { totalEntradas, totalSalidas, entradas, salidas, inChild, outChild, workersIn }
function addDelta(storeId, delta, ts = Date.now()) {
  ensureStore(storeId);

  const d = {
    totalEntradas: safeNumber(delta.totalEntradas, 0),
    totalSalidas: safeNumber(delta.totalSalidas, 0),
    entradas: safeNumber(delta.entradas, 0),
    salidas: safeNumber(delta.salidas, 0),
    inChild: safeNumber(delta.inChild, 0),
    outChild: safeNumber(delta.outChild, 0),
    workersIn: safeNumber(delta.workersIn, 0),
  };

  // vivo
  Object.keys(d).forEach((k) => (storeCounters[storeId][k] += d[k]));

  // día + hora
  const dateKey = dateKeyFromTs(ts);
  const hourKey = hourKeyFromTs(ts);
  ensureDay(storeId, dateKey);

  Object.keys(d).forEach((k) => (dailyCounters[storeId][dateKey][k] += d[k]));
  Object.keys(d).forEach((k) => (hourlyCounters[storeId][dateKey][hourKey][k] += d[k]));

  const dentroDia = Math.max(
    dailyCounters[storeId][dateKey].entradas - dailyCounters[storeId][dateKey].salidas,
    0
  );

  return { dateKey, hourKey, dentroDia };
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
    data: { time: Math.floor(Date.now() / 1000), ...extraData },
  });
}

function normalizeCounts(body) {
  const totalEntradas = safeNumber(
    body.in ?? body.enter ?? body.Enter ?? body.In ?? body.inNum ?? body.InNum ?? 0,
    0
  );

  const totalSalidas = safeNumber(
    body.out ?? body.leave ?? body.Leave ?? body.Out ?? body.outNum ?? body.OutNum ?? 0,
    0
  );

  const inChild = safeNumber(body.inChild ?? body.InChild ?? 0, 0);
  const outChild = safeNumber(body.outChild ?? body.OutChild ?? 0, 0);

  const attrs = Array.isArray(body.attributes) ? body.attributes : [];

  // ✅ workcard: 1 por trabajador (solo entrada)
  let workersIn = 0;
  for (const a of attrs) {
    if (Number(a?.workcard || 0) === 1) workersIn += 1;
  }

  // ✅ CLIENTES = total - niños - trabajadores
  const entradasClientes = Math.max(totalEntradas - inChild - workersIn, 0);

  // ✅ salidasClientes = totalSalidas - niños que salieron (trabajadores no afectan out)
  const salidasClientes = Math.max(totalSalidas - outChild, 0);

  return {
    totalEntradas,
    totalSalidas,

    entradas: entradasClientes, // clientes
    salidas: salidasClientes,   // clientes

    inChild,
    outChild,
    workersIn,
  };
}

// --------------------------------------------------------------
// ---------   HEARTBEAT TRACKING (ONLINE / OFFLINE)   ----------
// --------------------------------------------------------------
const lastHeartbeatBySn = {};
const HEARTBEAT_ONLINE_MS = 90 * 1000;

function isOnlineBySn(sn) {
  const last = lastHeartbeatBySn[String(sn)] || 0;
  return !!last && Date.now() - last <= HEARTBEAT_ONLINE_MS;
}

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

app.post("/api/camera/heartBeat", (req, res) => {
  const sn = req.body?.sn;
  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  const body = req.body || {};
  const sn = body.sn;
  const storeId = getStoreIdFromDevice(sn);

  if (sn) lastHeartbeatBySn[String(sn)] = Date.now();

  const sensorKey = `${storeId || "unknown"}:SN:${sn || "no-sn"}`;
  sensors[sensorKey] = {
    storeId: storeId || null,
    deviceId: `SN:${sn || "no-sn"}`,
    type: "sensor-real",
    extra: body,
    lastUpdate: new Date(),
  };

  if (!storeId) return okSensor(res);

  const delta = normalizeCounts(body);
  addDelta(storeId, delta, Date.now());

  console.log(
    `✅ ${storeId} SN=${sn} | totalIn=${delta.totalEntradas} workersIn=${delta.workersIn} => clientesIn=${delta.entradas} | out=${delta.salidas}`
  );

  return okSensor(res);
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------
app.get("/api/store/counters", (req, res) => {
  const storeId = String(req.query.storeId || "");
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const c = storeCounters[storeId];

  const dentroClientes = Math.max(c.entradas - c.salidas, 0);

  res.json({
    storeId,

    // ✅ lo que mostrarás como CLIENTES
    entradas: c.entradas,
    salidas: c.salidas,
    dentro: dentroClientes,

    // ✅ extras
    inChild: c.inChild,
    outChild: c.outChild,
    workersIn: c.workersIn,

    // ✅ para debug (por si quieres verlo)
    totalEntradas: c.totalEntradas,
    totalSalidas: c.totalSalidas,
  });
});

app.get("/api/store/history", (req, res) => {
  const storeId = String(req.query.storeId || "");
  const date = String(req.query.date || "");
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });
  if (!date) return res.status(400).json({ error: "Falta date=YYYY-MM-DD" });

  ensureDay(storeId, date);

  const d = dailyCounters[storeId][date];
  const dentro = Math.max(d.entradas - d.salidas, 0);
  const byHour = hourlyCounters[storeId][date] || {};

  res.json({ storeId, date, ...d, dentro, byHour });
});

// Debug
app.get("/api/sensors", (req, res) => res.json(Object.values(sensors)));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});

