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
  // Tiendas de Arrow
  "arrow-01": { id: "arrow-01", name: "Tienda Arrow 01" },
  "arrow-02": { id: "arrow-02", name: "Tienda Arrow 02" },
  "arrow-03": { id: "arrow-03", name: "Tienda Arrow 03" },

  // Tiendas de Leoniza
  "leoniza-01": { id: "leoniza-01", name: "Tienda Leoniza 01" },
  "leoniza-02": { id: "leoniza-02", name: "Tienda Leoniza 02" },
  "leoniza-03": { id: "leoniza-03", name: "Tienda Leoniza 03" },
  "leoniza-04": { id: "leoniza-04", name: "Tienda Leoniza 04" },
};

// Usuarios del sistema
const users = {
  // Administradores: ven TODAS las tiendas
  Vicente: {
    username: "Vicente",
    password: "Admin09867",
    stores: Object.keys(stores), // todas las tiendas
  },
  Rodrigo: {
    username: "Rodrigo",
    password: "Admin170817",
    stores: Object.keys(stores), // todas las tiendas
  },

  // Arrow: solo sus 3 tiendas
  Arrow: {
    username: "Arrow",
    password: "Arrow57105",
    stores: ["arrow-01", "arrow-02", "arrow-03"],
  },

  // Leoniza: sus 4 tiendas
  Leoniza: {
    username: "Leoniza",
    password: "Leoniza99481",
    stores: ["leoniza-01", "leoniza-02", "leoniza-03", "leoniza-04"],
  },
};

// --------------------------------------------------------------
// ---------------------   LOGIN DE USUARIOS   ------------------
// --------------------------------------------------------------

// POST /api/login
// Body: { username: "dueno1", password: "1234" }
// Respuesta: { username, stores: [ {id, name}, ... ] }
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

