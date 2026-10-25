require("dotenv").config();
const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const STAFF_IDS = new Set([
  "ENG/2024/32910",
  "ENG/2025/39685",
  "ENG/2024/32421",
  "ENG/2024/32113",
  "ENG/2024/31583",
  "ENG/2024/31983",
  "ENG/2024/31925",
  "ENG/2024/35041",
  "ENG/2024/32014",
  "ENG/2024/31750",
  "ENG/2024/32102"
]);

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  console.log("Supabase configuration found.");
} else {
  console.warn("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
}

function databaseRequired(res) {
  if (!supabase) {
    res.status(503).json({
      error: "The online database is not configured yet. Follow SETUP.md to connect Supabase."
    });
    return false;
  }
  return true;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, databaseConfigured: Boolean(supabase) });
});

app.post("/api/staff/login", (req, res) => {
  const matric = String(req.body?.matric || "").trim().toUpperCase();
  if (!STAFF_IDS.has(matric)) {
    return res.status(401).json({ error: "Invalid staff matriculation number." });
  }
  // Demo login for the mini project. For real use, add passwords and secure sessions.
  return res.json({ ok: true, matric, message: "Staff login accepted." });
});

app.get("/api/orders", async (req, res) => {
  if (!databaseRequired(res)) return;
  const staffMatric = String(req.query.staffMatric || "").trim().toUpperCase();
  if (!STAFF_IDS.has(staffMatric)) {
    return res.status(401).json({ error: "Staff login is required to view orders." });
  }
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: "Could not load orders.", details: error.message });
  res.json({ orders: data || [] });
});

app.post("/api/orders", async (req, res) => {
  if (!databaseRequired(res)) return;
  const name = String(req.body?.customerName || "").trim();
  const matric = String(req.body?.customerMatric || "").trim().toUpperCase();
  const phone = String(req.body?.phone || "").trim();
  const pickupLocation = String(req.body?.pickupLocation || "").trim();
  const paymentType = String(req.body?.paymentType || "Cash payment").trim();
  const note = String(req.body?.note || "").trim();

  const allowedPickupLocations = [
    "Male Hostel", "Female Hostel", "Faculty of Engineering",
    "Faculty of Science", "Main Cafeteria", "Mini Mart Counter"
  ];
  const allowedPaymentTypes = ["Cash payment", "Online payment"];
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!matric || matric.length > 40) return res.status(400).json({ error: "Please enter your student/staff matric ID." });
  if (!allowedPickupLocations.includes(pickupLocation)) return res.status(400).json({ error: "Please select a valid pickup location." });
  if (!allowedPaymentTypes.includes(paymentType)) return res.status(400).json({ error: "Please select a valid payment type." });
  if (items.length < 1) return res.status(400).json({ error: "Your cart is empty." });
  if (items.length > 60) return res.status(400).json({ error: "Too many different items in one order." });

  const cleanItems = [];
  let total = 0;
  for (const item of items) {
    const itemName = String(item.name || "").trim();
    const category = String(item.category || "").trim();
    const price = Number(item.price);
    const quantity = Number(item.quantity);
    // The server verifies prices against the authoritative menu, not browser-submitted totals.
    const menuItem = MENU.find(x => x.name === itemName && x.category === category);
    if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return res.status(400).json({ error: "An item or quantity in your cart is invalid. Please refresh the menu." });
    }
    cleanItems.push({ name: menuItem.name, category: menuItem.category, price: menuItem.price, quantity });
    total += menuItem.price * quantity;
  }

  const { data, error } = await supabase.from("orders").insert({
    customer_name: name,
    customer_matric: matric,
    phone: phone || null,
    pickup_location: pickupLocation,
    payment_type: paymentType,
    note: note || null,
    items: cleanItems,
    total,
    status: "Pending",
    feedback: null,
    accepted_by: null,
    status_history: [{ status: "Pending", at: new Date().toISOString(), by: "Customer" }]
  }).select("*").single();

  if (error) return res.status(500).json({ error: "Could not save your order.", details: error.message });
  res.status(201).json({ order: data, message: "Order placed successfully." });
});

app.patch("/api/orders/:id/status", async (req, res) => {
  if (!databaseRequired(res)) return;
  const staffMatric = String(req.body?.staffMatric || "").trim().toUpperCase();
  const status = String(req.body?.status || "");
  const feedback = String(req.body?.feedback || "").trim();
  const allowed = ["Accepted", "Ready", "Delivered"];
  if (!STAFF_IDS.has(staffMatric)) return res.status(401).json({ error: "Valid staff login is required." });
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid order status." });

  const { data: oldOrder, error: readError } = await supabase
    .from("orders").select("status_history").eq("id", req.params.id).single();
  if (readError || !oldOrder) return res.status(404).json({ error: "Order not found." });

  const history = Array.isArray(oldOrder.status_history) ? oldOrder.status_history : [];
  history.push({ status, at: new Date().toISOString(), by: staffMatric });

  const updates = {
    status,
    accepted_by: staffMatric,
    status_history: history
  };
  if (feedback) updates.feedback = feedback;

  const { data, error } = await supabase
    .from("orders").update(updates).eq("id", req.params.id).select("*").single();
  if (error) return res.status(500).json({ error: "Could not update order.", details: error.message });
  res.json({ order: data, message: `Order marked ${status}.` });
});

app.post("/api/orders/track", async (req, res) => {
  if (!databaseRequired(res)) return;
  const id = String(req.body?.id || "").trim();
  const matric = String(req.body?.customerMatric || "").trim().toUpperCase();
  if (!id || !matric) return res.status(400).json({ error: "Enter the order ID and matric ID." });
  const { data, error } = await supabase.from("orders")
    .select("id, customer_name, customer_matric, items, total, status, feedback, customer_feedback, status_history, created_at")
    .eq("id", id)
    .eq("customer_matric", matric)
    .single();
  if (error || !data) return res.status(404).json({ error: "No order found with that order ID and matric ID." });
  res.json({ order: data });
});

app.patch("/api/orders/:id/feedback", async (req, res) => {
  if (!databaseRequired(res)) return;
  const staffMatric = String(req.body?.staffMatric || "").trim().toUpperCase();
  const feedback = String(req.body?.feedback || "").trim();
  if (!STAFF_IDS.has(staffMatric)) return res.status(401).json({ error: "Valid staff login is required." });
  if (!feedback || feedback.length > 500) return res.status(400).json({ error: "Enter a customer update (maximum 500 characters)." });
  const { data, error } = await supabase.from("orders")
    .update({ feedback, accepted_by: staffMatric })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error || !data) return res.status(404).json({ error: "Order not found." });
  res.json({ order: data, message: "Customer update saved." });
});

app.post("/api/orders/:id/feedback", async (req, res) => {
  if (!databaseRequired(res)) return;
  const matric = String(req.body?.customerMatric || "").trim().toUpperCase();
  const feedback = String(req.body?.feedback || "").trim();
  if (!matric || !feedback || feedback.length > 1000) {
    return res.status(400).json({ error: "Enter your matric ID and feedback (maximum 1000 characters)." });
  }
  const { data, error } = await supabase.from("orders")
    .update({ customer_feedback: feedback })
    .eq("id", req.params.id)
    .eq("customer_matric", matric)
    .select("id, customer_feedback")
    .single();
  if (error || !data) return res.status(404).json({ error: "Order not found for that matric ID." });
  res.json({ ok: true, message: "Thank you. Your feedback has been saved." });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Keep this menu in sync with public/app.js. Server-side prices are authoritative.
const MENU = [
  { category: "Meals", name: "Rice & Beans", price: 1500 },
  { category: "Meals", name: "White Rice", price: 1200 },
  { category: "Meals", name: "Jollof Rice", price: 1500 },
  { category: "Meals", name: "Fried Rice", price: 1500 },
  { category: "Meals", name: "Spaghetti", price: 1000 },
  { category: "Meals", name: "Macaroni", price: 1000 },
  { category: "Meals", name: "Pounded Yam", price: 2000 },
  { category: "Meals", name: "Moi-Moi", price: 500 },
  { category: "Meals", name: "Indomie and Egg", price: 750 },
  { category: "Meals", name: "Amala", price: 500 },
  { category: "Meals", name: "Chips and Eggs", price: 2500 },
  { category: "Meat", name: "Chicken", price: 1500 },
  { category: "Meat", name: "Beef Meat", price: 1000 },
  { category: "Meat", name: "Cow Legs", price: 1500 },
  { category: "Meat", name: "Fish", price: 1000 },
  { category: "Meat", name: "Cat Fish", price: 3000 },
  { category: "Meat", name: "Cow Tail", price: 1000 },
  { category: "Meat", name: "Cow Head", price: 1000 },
  { category: "Snacks", name: "Shawarma", price: 2500 },
  { category: "Snacks", name: "Puff Puff", price: 250 },
  { category: "Snacks", name: "Meat Pie", price: 500 },
  { category: "Snacks", name: "Chicken Pie", price: 700 },
  { category: "Snacks", name: "Egg Roll", price: 500 },
  { category: "Snacks", name: "Spring Roll", price: 700 },
  { category: "Snacks", name: "Pizza", price: 4000 },
  { category: "Snacks", name: "Mac-D", price: 800 },
  { category: "Snacks", name: "Milk Donuts", price: 500 },
  { category: "Snacks", name: "Donut", price: 500 },
  { category: "Soft Drinks", name: "Coca-Cola", price: 500 },
  { category: "Soft Drinks", name: "Teem", price: 500 },
  { category: "Soft Drinks", name: "Fanta", price: 500 },
  { category: "Soft Drinks", name: "Sprite", price: 500 },
  { category: "Soft Drinks", name: "Go Fresh", price: 500 },
  { category: "Soft Drinks", name: "Maltina", price: 700 },
  { category: "Soft Drinks", name: "Bottle Water", price: 250 },
  { category: "Soft Drinks", name: "Predator", price: 500 },
  { category: "Soft Drinks", name: "Zobo", price: 200 },
  { category: "Soft Drinks", name: "Suya Milk", price: 200 },
  { category: "Soft Drinks", name: "Kunun Aya", price: 300 },
  { category: "Soft Drinks", name: "Kunun Zaki", price: 150 },
  { category: "Soft Drinks", name: "Kunun Gaida", price: 300 },
  { category: "Bread", name: "Sliced Bread", price: 800 },
  { category: "Bread", name: "Wheat Bread", price: 1500 },
  { category: "Bread", name: "Ahmad Bread", price: 800 },
  { category: "Bread", name: "Nakowa Bread", price: 600 },
  { category: "Mini Mart", name: "Note Book (Big)", price: 600 },
  { category: "Mini Mart", name: "Note Book (Small)", price: 300 },
  { category: "Mini Mart", name: "Ballpoint Pen (Blue/Black)", price: 150 },
  { category: "Mini Mart", name: "Mathematical Set", price: 1200 },
  { category: "Mini Mart", name: "A4 Paper (1 Rim)", price: 4500 },
  { category: "Mini Mart", name: "Tissue Paper", price: 400 },
  { category: "Mini Mart", name: "Toothpaste", price: 800 },
  { category: "Mini Mart", name: "Soap / Detergent", price: 350 }
];

const originalListen = app.listen.bind(app);
originalListen(PORT, "0.0.0.0", () => {
  console.log("\\nFUDMA Group 8 Campus Food & Mini Mart");
  console.log(`Local computer: http://localhost:${PORT}`);
  console.log(`LAN access: use this computer's Wi-Fi/hotspot IPv4 address, port ${PORT}`);
  console.log("Keep the terminal running while people use the local version.\\n");
});
