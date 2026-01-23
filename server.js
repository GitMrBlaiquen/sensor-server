const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: "1mb" }));

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

// POST /api/login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Faltan username o password" });
  }

  const user = users[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Usuario o contraseña inválidos" });
  }

  const userStores = user.stores
    .map((storeId) => stores[storeId])
    .filter(Boolean);

  return res.json({
    username: user.username,
    role: user.role, // admin / dueño
    stores: userStores,
  });
});

// --------------------------------------------------------------
// -----------   CONTADOR DE PERSONAS POR TIENDA   --------------
// --------------------------------------------------------------

// Último dato por sensor (debug)
const sensors = {};

// Contadores por tienda
const storeCounters = {};
function ensureStore(storeId) {
  if (!storeCounters[storeId]) {
    storeCounters[storeId] = { entradas: 0, salidas: 0 };
  }
}

// --------------------------------------------------------------
//  1) ENDPOINT “ANTIGUO” (simulador / pruebas manuales)
// --------------------------------------------------------------
//
// POST /api/sensors/data
// {
//   storeId: "arrow-01",
//   deviceId: "t1-puerta-entrada",
//   type: "entrada" | "salida",
//   value: 1,
//   unit: "personas"
// }
app.post("/api/sensors/data", (req, res) => {
  const { storeId, deviceId, type, value, unit, extra } = req.body;

  if (!storeId) return res.status(400).json({ error: "Falta storeId" });
  if (!deviceId) return res.status(400).json({ error: "Falta deviceId" });

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

  ensureStore(storeId);
  if (type === "entrada") storeCounters[storeId].entradas += safeValue;
  else if (type === "salida") storeCounters[storeId].salidas += safeValue;

  console.log("🧪 Dato (simulador) recibido:", sensors[sensorKey]);

  res.json({ status: "ok" });
});

// --------------------------------------------------------------
//  2) ENDPOINTS DEL SENSOR REAL (los que pide el PDF)
// --------------------------------------------------------------
//
// IMPORTANTE: debes mapear el SN del sensor a una tienda.
//
// EJEMPLO:
//   "201000002412101534": "arrow-01"
//
const SN_TO_STORE = {
   "22100000250715250": "arrow-01",
};

function getStoreIdFromSN(sn) {
  if (!sn) return null;
  return SN_TO_STORE[String(sn)] || null;
}

// POST /api/camera/heartBeat
app.post("/api/camera/heartBeat", (req, res) => {
  // El sensor suele enviar { sn, time, ... }
  console.log("❤️ heartBeat:", req.body);

  // Respuesta que el sensor espera: code=0
  return res.json({
    code: 0,
    msg: "success",
    data: {
      time: Math.floor(Date.now() / 1000),
      uploadInterval: 1, // minutos (ajústalo si quieres)
      dataMode: "Add",
    },
  });
});

// POST /api/camera/dataUpload
app.post("/api/camera/dataUpload", (req, res) => {
  console.log("📦 dataUpload:", req.body);

  const body = req.body || {};
  const sn = body.sn || body.SN || body.deviceId || body.DeviceId; // por si viene con nombre distinto
  const storeId = getStoreIdFromSN(sn);

  // Si no está mapeado, igual se responde success para que no “se corte”,
  // pero dejamos log claro.
  if (!storeId) {
    console.warn(
      "⚠️ Llegó dataUpload pero el SN no está mapeado a una tienda. SN:",
      sn
    );

    return res.json({
      code: 0,
      msg: "success",
      data: { time: Math.floor(Date.now() / 1000) },
    });
  }

  ensureStore(storeId);

  // Según muchos sensores de conteo, llegan como in/out o enter/leave
  const entradas = Number(body.in ?? body.enter ?? body.In ?? body.Enter ?? 0);
  const salidas = Number(body.out ?? body.leave ?? body.Out ?? body.Leave ?? 0);

  const safeEntradas = Number.isFinite(entradas) ? entradas : 0;
  const safeSalidas = Number.isFinite(salidas) ? salidas : 0;

  storeCounters[storeId].entradas += safeEntradas;
  storeCounters[storeId].salidas += safeSalidas;

  // Guardar como “sensor” debug
  const sensorKey = `${storeId}:SN:${sn || "unknown"}`;
  sensors[sensorKey] = {
    storeId,
    deviceId: `SN:${sn || "unknown"}`,
    type: "sensor-real",
    value: null,
    unit: "",
    extra: body,
    lastUpdate: new Date(),
  };

  console.log(
    `✅ Tienda ${storeId} (SN ${sn}) -> +Entradas ${safeEntradas}, +Salidas ${safeSalidas}`
  );

  return res.json({
    code: 0,
    msg: "success",
    data: {
      time: Math.floor(Date.now() / 1000),
    },
  });
});

// --------------------------------------------------------------
// ------------------------   CONSULTAS WEB   -------------------
// --------------------------------------------------------------

// GET /api/store/counters?storeId=arrow-01
app.get("/api/store/counters", (req, res) => {
  const { storeId } = req.query;
  if (!storeId) return res.status(400).json({ error: "Falta storeId en la query" });

  ensureStore(storeId);
  const { entradas, salidas } = storeCounters[storeId];
  const dentro = Math.max(entradas - salidas, 0);

  res.json({ storeId, entradas, salidas, dentro });
});

// (Opcional) lista de tiendas
app.get("/api/stores", (req, res) => {
  res.json(Object.values(stores));
});

// (Opcional) debug sensores
app.get("/api/sensors", (req, res) => {
  res.json(Object.values(sensors));
});

// (Opcional) ver contadores internos (debug)
app.get("/api/debug/counters", (req, res) => {
  res.json(storeCounters);
});

// --------------------------------------------------------------
// ---------------------   INICIO DEL SERVER   ------------------
// --------------------------------------------------------------

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor TIENDAS activo en el puerto ${PORT}`);
});
