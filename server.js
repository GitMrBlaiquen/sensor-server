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

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ✅ Guardamos:
// - totalIn/totalOut (RAW del sensor)
// - entradas/salidas = CLIENTES (adultos sin workers, sin niños)
// - workersIn = total workers detectados (workcard) (no tiene dirección real)
// - niños in/out
function emptyCounters() {
  return {
    totalEntradas: 0,
    totalSalidas: 0,

    // ✅ CLIENTES
    entradas: 0,
    salidas: 0,

    // extras
    inChild: 0,
    outChild: 0,
    workersIn: 0, // aquí guardamos el total workcard detectado (por periodo)
  };
}

const storeCounters = {};
const dailyCounters = {};
const hourlyCounters = {};

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

/**
 * ✅ Reparte workers (workcard) entre IN / OUT.
 * Como workcard NO trae dirección, lo más sano es repartir proporcionalmente
 * a los adultos IN/OUT del payload.
 */
function splitWorkers(adultIn, adultOut, workers) {
  const aIn = safeNumber(adultIn, 0);
  const aOut = safeNumber(adultOut, 0);
  const w = Math.max(0, safeNumber(workers, 0));

  const sum = aIn + aOut;

  if (w <= 0) return { wIn: 0, wOut: 0 };
  if (sum <= 0) return { wIn: 0, wOut: 0 };

  if (aIn > 0 && aOut === 0) return { wIn: w, wOut: 0 };
  if (aOut > 0 && aIn === 0) return { wIn: 0, wOut: w };

  const wIn = Math.round((w * aIn) / sum);
  const wOut = w - wIn;
  return { wIn, wOut };
}

/**
 * delta = {
 *  totalEntradas,totalSalidas,
 *  entradas,salidas (CLIENTES),
 *  inChild,outChild,workersIn
 * }
 */
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

/**
 * ✅ NORMALIZADOR NUEVO (CORRIGE EL BUG)
 * - Toma totalIn/totalOut RAW
 * - Toma niños in/out
 * - Toma adultos in/out (mejor: inAdult/outAdult)
 * - Cuenta workers desde attributes[].workcard
 * - Reparte workers entre IN/OUT y los resta en ambos
 * - Clientes = Adultos - Workers (niños ya no cuentan)
 */
function normalizeCounts(body) {
  const totalEntradas = safeNumber(body.in ?? 0, 0);
  const totalSalidas = safeNumber(body.out ?? 0, 0);

  const inChild = safeNumber(body.inChild ?? 0, 0);
  const outChild = safeNumber(body.outChild ?? 0, 0);

  // Adultos (ideal)
  const adultIn = safeNumber(body.inAdult ?? (totalEntradas - inChild), 0);
  const adultOut = safeNumber(body.outAdult ?? (totalSalidas - outChild), 0);

  // workers por workcard dentro de attributes
  const attrs = Array.isArray(body.attributes) ? body.attributes : [];
  const workers = attrs.reduce((acc, item) => acc + (safeNumber(item?.workcard, 0) ? 1 : 0), 0);

  // repartir workers entre in/out
  const { wIn, wOut } = splitWorkers(adultIn, adultOut, workers);

  // ✅ Clientes (adultos sin workers; niños aparte)
  const entradasClientes = Math.max(adultIn - wIn, 0);
  const salidasClientes = Math.max(adultOut - wOut, 0);

  return {
    totalEntradas,
    totalSalidas,

    entradas: entradasClientes,
    salidas: salidasClientes,

    inChild,
    outChild,

    // workcard total del periodo (lo mostramos aparte)
    workersIn: workers,

    // debug opcional
    _debug: { adultIn, adultOut, workers, wIn, wOut },
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

  // debug payload
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

  // Log útil para validar
  console.log(
    `✅ ${storeId} SN=${sn} | RAW in=${delta.totalEntradas} out=${delta.totalSalidas} | child in=${delta.inChild} out=${delta.outChild} | workers=${delta.workersIn} | CLIENTS in=${delta.entradas} out=${delta.salidas}`
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

    // ✅ CLIENTES
    entradas: c.entradas,
    salidas: c.salidas,
    dentro: dentroClientes,

    // ✅ extras
    inChild: c.inChild,
    outChild: c.outChild,
    workersIn: c.workersIn,

    // ✅ debug
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
app.get("/api/debug/heartbeat", (req, res) => res.json(lastHeartbeatBySn));

// ---------------- START ----------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
