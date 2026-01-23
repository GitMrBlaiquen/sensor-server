const express = require("express");
const app = express();

// Captura TODO como texto (JSON o XML)
app.use(
  express.text({
    type: "*/*",
    limit: "2mb",
  })
);

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function logRequest(tag, req) {
  console.log("\n==============================");
  console.log("📦", tag);
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("From:", req.socket.remoteAddress);

  const raw = (req.body || "").trim();
  if (!raw) {
    console.log("Body: (vacío)");
    return;
  }

  const parsed = tryParseJson(raw);
  if (parsed) {
    console.log("Body (JSON):", parsed);
  } else {
    console.log("Body (RAW/XML):\n", raw);
  }
}

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Rutas “oficiales” del PDF
app.post("/api/camera/heartBeat", (req, res) => {
  logRequest("HEARTBEAT /api/camera/heartBeat", req);
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  logRequest("DATAUPLOAD /api/camera/dataUpload", req);
  return okSensor(res);
});

// Rutas “compatibles” que suele traer tu software
app.post("/heartbeat", (req, res) => {
  logRequest("HEARTBEAT /heartbeat", req);
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/posttest", (req, res) => {
  logRequest("POSTTEST /api/posttest", req);
  return okSensor(res);
});

// Si el sensor pega a cualquier otra ruta:
app.use((req, res) => {
  logRequest("RUTA NO CONFIGURADA", req);
  res.status(404).json({ error: "Ruta no configurada en debug-sensor" });
});

// Puerto (si lo subes a Render, usa process.env.PORT)
const PORT = process.env.PORT || 8088;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ debug-sensor escuchando en http://0.0.0.0:${PORT}`);
  console.log(`🔎 Health: http://localhost:${PORT}/health`);
});
