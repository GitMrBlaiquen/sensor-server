const express = require("express");
const app = express();

// Acepta JSON del sensor
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function logReq(tag, req) {
  console.log("\n==============================");
  console.log("📌", tag);
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("From:", req.ip);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Body:", req.body);
  console.log("==============================\n");
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

app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/api/camera/heartBeat", (req, res) => {
  logReq("HEARTBEAT /api/camera/heartBeat", req);
  return okSensor(res, { uploadInterval: 1, dataMode: "Add" });
});

app.post("/api/camera/dataUpload", (req, res) => {
  logReq("DATAUPLOAD /api/camera/dataUpload", req);
  return okSensor(res);
});

// Si el sensor pega otra ruta por error
app.use((req, res) => {
  logReq("RUTA NO CONFIGURADA", req);
  res.status(404).json({ error: "Ruta no configurada en debug-sensor" });
});

const PORT = 8088;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ debug-sensor escuchando en http://0.0.0.0:${PORT}`);
  console.log(`🔎 Health: http://localhost:${PORT}/health`);
});
