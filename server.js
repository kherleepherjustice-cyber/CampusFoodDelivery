// Campus Food Delivery / Mini Mart - local server (no installs needed, just Node.js)
// Run:  node server.js     Then open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "orders.json");
const STATUSES = ["Pending", "Accepted", "Ready", "Delivered"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Lets phones that opened the app from a saved file (or another address) still sync to this laptop.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true"
};

/* ---------- storage (orders.json) ---------- */
let orders = loadOrders();
function loadOrders() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function saveOrders() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

/* ---------- helpers ---------- */
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const newId = () => "CM-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache", ...CORS, ...extra });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://localhost"); }
  catch { return send(res, 400, "Bad request", "text/plain; charset=utf-8"); }

  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain; charset=utf-8");

  /* ----- API ----- */
  if (url.pathname.startsWith("/api/")) {
    if (req.method === "GET" && url.pathname === "/api/ping") {
      return send(res, 200, { ok: true, time: Date.now() });
    }

    if (req.method === "GET" && url.pathname === "/api/orders") {
      const sid = str(url.searchParams.get("studentId"), 50).toLowerCase();
      const list = sid ? orders.filter(o => o.studentId.toLowerCase() === sid) : orders;
      return send(res, 200, list);
    }

    if (req.method === "POST" && url.pathname === "/api/orders") {
      try {
        const body = await readBody(req);
        let id = str(body.id, 40);
        if (!/^[A-Za-z0-9-]{4,40}$/.test(id)) id = newId();

        // The same order may be sent twice (phone retried after weak signal) - never duplicate it.
        const existing = orders.find(o => o.id === id);
        if (existing) return send(res, 200, existing);

        const name = str(body.name, 100);
        const studentId = str(body.studentId, 50);
        if (!name || !studentId || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
          return send(res, 400, { error: "Enter your name, student ID, and add at least one item." });
        }
        const items = body.items.map(i => ({
          name: str(i.name || "Item", 80),
          emoji: str(i.emoji, 8),
          price: Math.min(1000000, Math.max(0, Number(i.price) || 0)),
          qty: Math.max(1, Math.min(99, Math.floor(Number(i.qty)) || 1))
        }));
        const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
        const type = str(body.type, 30) || "Pickup";
        const fee = type === "Delivery" ? Math.min(100000, Math.max(0, Number(body.fee) || 0)) : 0;

        const order = {
          id, name, studentId,
          phone: str(body.phone, 30),
          type,
          location: str(body.location, 120),
          items,
          fee,
          total: subtotal + fee,
          paymentMethod: str(body.paymentMethod, 60) || "Pay on pickup",
          paymentStatus: str(body.paymentStatus, 60) || "Unpaid",
          paymentRef: str(body.paymentRef, 60),
          status: STATUSES.includes(body.status) ? body.status : "Pending",
          createdAt: str(body.createdAt, 40) || new Date().toISOString(),
          device: str(body.device, 40)
        };
        orders.unshift(order);
        saveOrders();
        return send(res, 201, order);
      } catch (error) {
        return send(res, 400, { error: error.message || "Could not create order." });
      }
    }

    const match = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/status$/);
    if (req.method === "PATCH" && match) {
      try {
        const body = await readBody(req);
        if (!STATUSES.includes(body.status)) return send(res, 400, { error: "Invalid status." });
        const order = orders.find(o => o.id === match[1]);
        if (!order) return send(res, 404, { error: "Order not found." });
        order.status = body.status;
        saveOrders();
        return send(res, 200, order);
      } catch {
        return send(res, 400, { error: "Could not update status." });
      }
    }
    return send(res, 404, { error: "API route not found." });
  }

  /* ----- static files from /public ----- */
  let rel;
  try { rel = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, "Bad request", "text/plain; charset=utf-8"); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");

  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, "File not found", "text/plain; charset=utf-8");
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(content);
  });
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.log("\nPort " + PORT + " is already in use. Close the other terminal running this server, or run:");
    console.log("  Windows:  set PORT=3001 && node server.js");
    console.log("  Mac/Linux: PORT=3001 node server.js\n");
  } else {
    console.log("Server error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log("\n==============================================");
  console.log("  Campus Food Delivery is running");
  console.log("==============================================");
  console.log("  This laptop :  http://localhost:" + PORT);
  const nets = os.networkInterfaces();
  let found = false;
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) {
        console.log("  Phones      :  http://" + n.address + ":" + PORT + "   (" + name + ")");
        found = true;
      }
    }
  }
  if (!found) console.log("  Phones      :  connect this laptop to Wi-Fi or start a hotspot, then restart.");
  console.log("\n  Keep this window open. Orders are saved in orders.json");
  console.log("  Press Ctrl+C to stop.\n");
});
