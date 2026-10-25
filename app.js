const MENU = [
  ["Meals", "🍛", [["Rice & Beans",1500],["White Rice",1200],["Jollof Rice",1500],["Fried Rice",1500],["Spaghetti",1000],["Macaroni",1000],["Pounded Yam",2000],["Moi-Moi",500],["Indomie and Egg",750],["Amala",500],["Chips and Eggs",2500]]],
  ["Meat", "🍗", [["Chicken",1500],["Beef Meat",1000],["Cow Legs",1500],["Fish",1000],["Cat Fish",3000],["Cow Tail",1000],["Cow Head",1000]]],
  ["Snacks", "🥟", [["Shawarma",2500],["Puff Puff",250],["Meat Pie",500],["Chicken Pie",700],["Egg Roll",500],["Spring Roll",700],["Pizza",4000],["Mac-D",800],["Milk Donuts",500],["Donut",500]]],
  ["Soft Drinks", "🥤", [["Coca-Cola",500],["Teem",500],["Fanta",500],["Sprite",500],["Go Fresh",500],["Maltina",700],["Bottle Water",250],["Predator",500],["Zobo",200],["Suya Milk",200],["Kunun Aya",300],["Kunun Zaki",150],["Kunun Gaida",300]]],
  ["Bread", "🍞", [["Sliced Bread",800],["Wheat Bread",1500],["Ahmad Bread",800],["Nakowa Bread",600]]],
  ["Mini Mart", "🛒", [["Note Book (Big)",600],["Note Book (Small)",300],["Ballpoint Pen (Blue/Black)",150],["Mathematical Set",1200],["A4 Paper (1 Rim)",4500],["Tissue Paper",400],["Toothpaste",800],["Soap / Detergent",350]]]
].map(([category, icon, products]) => ({category, icon, products:products.map(([name,price])=>({name,price,category}))}));

const $ = (selector) => document.querySelector(selector);
const naira = (value) => "₦" + Number(value).toLocaleString("en-NG");
const cart = new Map();
let staffMatric = "";
let trackedOrder = null;
let noticeTimer;

function showNotice(message, isError=false) {
  const el = $("#notice");
  el.textContent = message;
  el.className = "notice show" + (isError ? " error" : "");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove("show"), 6500);
}
async function api(url, options={}) {
  const response = await fetch(url, {
    headers: {"Content-Type":"application/json", ...(options.headers || {})},
    ...options
  });
  const data = await response.json().catch(()=>({error:"Unexpected server response."}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function renderMenu() {
  $("#categories").innerHTML = MENU.map((group,index)=>`
    <article class="category">
      <button class="category-toggle" type="button" aria-expanded="false" aria-controls="category-${index}" data-category="${index}">
        <span class="category-icon">${group.icon}</span>
        <span class="category-name">${group.category}</span>
        <span class="category-meta">${group.products.length} items</span>
        <span class="chevron">+</span>
      </button>
      <div id="category-${index}" class="product-grid hidden">
        ${group.products.map(item=>`
          <div class="product">
            <div class="product-top"><span class="product-name">${escapeHtml(item.name)}</span><span class="price">${naira(item.price)}</span></div>
            <button class="add-button" type="button" data-add="${escapeHtml(item.name)}" data-category="${escapeHtml(item.category)}">+ Add to cart</button>
          </div>`).join("")}
      </div>
    </article>`).join("");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function allProducts() { return MENU.flatMap(group=>group.products); }
function addItem(name, category) {
  const item = allProducts().find(x=>x.name===name && x.category===category);
  if (!item) return;
  const key = `${category}::${name}`;
  const existing = cart.get(key);
  cart.set(key,{...item,quantity:(existing?.quantity||0)+1});
  renderCart();
  showNotice(`${name} added to your cart.`);
}
function changeQuantity(key, amount) {
  const item = cart.get(key);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) cart.delete(key);
  renderCart();
}
function renderCart() {
  const items = [...cart.entries()];
  const count = items.reduce((sum,[,item])=>sum+item.quantity,0);
  const total = items.reduce((sum,[,item])=>sum+item.price*item.quantity,0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = naira(total);
  $("#cartItems").innerHTML = items.length ? items.map(([key,item])=>`
    <div class="cart-row">
      <div><div class="cart-name">${escapeHtml(item.name)}</div><div class="cart-sub">${naira(item.price)} each · ${naira(item.price*item.quantity)}</div></div>
      <div class="qty-control"><button type="button" data-minus="${escapeHtml(key)}" aria-label="Decrease quantity">−</button><strong>${item.quantity}</strong><button type="button" data-plus="${escapeHtml(key)}" aria-label="Increase quantity">+</button></div>
    </div>`).join("") : `<div class="empty">Your cart is empty. Open a menu category and add an item.</div>`;
}
function openPanel(id) { $(id).classList.remove("hidden"); $(id).scrollIntoView({behavior:"smooth",block:"start"}); }
function closePanel(id) { $(id).classList.add("hidden"); }
function statusClass(status) { return String(status||"pending").toLowerCase(); }
function orderItemsHtml(items) {
  return (Array.isArray(items)?items:[]).map(i=>`<li>${escapeHtml(i.name)} × ${Number(i.quantity)} — ${naira(i.price* i.quantity)}</li>`).join("");
}
function renderOrderCard(order) {
  const canAccept = order.status === "Pending";
  const canReady = order.status === "Accepted";
  const canDeliver = order.status === "Ready";
  return `<article class="order-card">
    <div class="order-head"><div><strong>${escapeHtml(order.customer_name)}</strong><div class="order-id">Order ID: ${escapeHtml(order.id)}</div><div class="order-id">${escapeHtml(order.customer_matric)} · ${new Date(order.created_at).toLocaleString()}</div></div><span class="status ${statusClass(order.status)}">${escapeHtml(order.status)}</span></div>
    <ul class="order-items">${orderItemsHtml(order.items)}</ul>
    <div class="total-line"><span>Total</span><strong>${naira(order.total)}</strong></div>
    ${order.phone?`<p class="muted">Phone: ${escapeHtml(order.phone)}</p>`:""}
    <p><strong>Pickup Location:</strong> ${escapeHtml(order.pickup_location || "N/A")}</p>
    <p><strong>Payment Type:</strong> ${escapeHtml(order.payment_type || "Cash payment")}</p>
    ${order.note?`<p class="muted">Note: ${escapeHtml(order.note)}</p>`:""}
    ${order.feedback?`<p><strong>Staff feedback:</strong> ${escapeHtml(order.feedback)}</p>`:""}
    ${order.customer_feedback?`<p><strong>Customer feedback:</strong> ${escapeHtml(order.customer_feedback)}</p>`:""}
    <div class="order-actions">
      ${canAccept?`<button class="primary-action" data-status="Accepted" data-id="${escapeHtml(order.id)}">Accept Order</button>`:""}
      ${canReady?`<button class="primary-action" data-status="Ready" data-id="${escapeHtml(order.id)}">Mark Ready</button>`:""}
      ${canDeliver?`<button class="primary-action" data-status="Delivered" data-id="${escapeHtml(order.id)}">Mark Delivered</button>`:""}
      ${order.status!=="Delivered"?`<button data-feedback="${escapeHtml(order.id)}">Add customer update</button>`:""}
    </div>
    <form class="staff-feedback-form hidden" data-feedback-form="${escapeHtml(order.id)}">
      <label>Message for customer<textarea name="feedback" rows="2" maxlength="500" placeholder="e.g. Your order is being prepared."></textarea></label>
      <button class="button button-secondary" type="submit">Save update</button>
    </form>
  </article>`;
}
async function loadOrders() {
  if (!staffMatric) return;
  $("#ordersList").innerHTML = `<div class="empty">Loading orders…</div>`;
  try {
    const data = await api(`/api/orders?staffMatric=${encodeURIComponent(staffMatric)}`);
    $("#ordersList").innerHTML = data.orders.length ? data.orders.map(renderOrderCard).join("") : `<div class="empty">No orders yet. New customer orders will appear here.</div>`;
  } catch (err) {
    $("#ordersList").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}
$("#categories").addEventListener("click", event=>{
  const toggle = event.target.closest("[data-category]");
  const add = event.target.closest("[data-add]");
  if (add) { addItem(add.dataset.add,add.dataset.category); return; }
  if (toggle && toggle.classList.contains("category-toggle")) {
    const panel = $(`#category-${toggle.dataset.category}`);
    const isOpen = !panel.classList.contains("hidden");
    panel.classList.toggle("hidden",isOpen);
    toggle.setAttribute("aria-expanded",String(!isOpen));
    toggle.querySelector(".chevron").textContent = isOpen ? "+" : "−";
  }
});
$("#cartItems").addEventListener("click",event=>{
  const minus=event.target.closest("[data-minus]"), plus=event.target.closest("[data-plus]");
  if(minus)changeQuantity(minus.dataset.minus,-1);
  if(plus)changeQuantity(plus.dataset.plus,1);
});
$("#openCart").addEventListener("click",()=>openPanel("#cartPanel"));
$("#closeCart").addEventListener("click",()=>closePanel("#cartPanel"));
$("#openTracking").addEventListener("click",()=>openPanel("#trackingPanel"));
$("#closeTracking").addEventListener("click",()=>closePanel("#trackingPanel"));

$("#checkoutForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!cart.size){showNotice("Your cart is empty.",true);return;}
  const form = new FormData(event.currentTarget);
  const payload = {
    customerName:form.get("customerName"),
    customerMatric:form.get("customerMatric"),
    phone:form.get("phone"),
    pickupLocation:form.get("pickupLocation"),
    paymentType:form.get("paymentType"),
    note:form.get("note"),
    items:[...cart.values()].map(({name,category,price,quantity})=>({name,category,price,quantity}))
  };
  const button=event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent="Submitting…";
  try {
    const result=await api("/api/orders",{method:"POST",body:JSON.stringify(payload)});
    cart.clear();renderCart();event.currentTarget.reset();
    closePanel("#cartPanel");
    showNotice(`Order placed! Save this order ID to track your order: ${result.order.id}`);
    $("#trackingForm [name=orderId]").value=result.order.id;
    $("#trackingForm [name=customerMatric]").value=payload.customerMatric;
    openPanel("#trackingPanel");
    if(staffMatric)loadOrders();
  } catch(err) { showNotice(err.message,true); }
  finally {button.disabled=false;button.textContent="Place Order";}
});

$("#trackingForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const id=String(form.get("orderId")).trim();
  const matric=String(form.get("customerMatric")).trim().toUpperCase();
  $("#trackingResult").innerHTML=`<div class="empty">Checking order…</div>`;
  $("#feedbackForm").classList.add("hidden");
  try {
    const result=await api("/api/orders/track",{method:"POST",body:JSON.stringify({id,customerMatric:matric})});
    trackedOrder=result.order;
    $("#trackingResult").innerHTML=`<article class="order-card"><div class="order-head"><strong>Order status</strong><span class="status ${statusClass(trackedOrder.status)}">${escapeHtml(trackedOrder.status)}</span></div><p>Order ID: <span class="order-id">${escapeHtml(trackedOrder.id)}</span></p><ul class="order-items">${orderItemsHtml(trackedOrder.items)}</ul><div class="total-line"><span>Total</span><strong>${naira(trackedOrder.total)}</strong></div>${trackedOrder.feedback?`<p><strong>Staff update:</strong> ${escapeHtml(trackedOrder.feedback)}</p>`:""}<p class="muted">Last update is shown above. Check again later for new updates.</p></article>`;
    $("#feedbackForm").classList.remove("hidden");
    $("#feedbackForm [name=orderId]").value=id;
    $("#feedbackForm [name=customerMatric]").value=matric;
  } catch(err) { $("#trackingResult").innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`; }
});

$("#feedbackForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  try {
    const result=await api(`/api/orders/${encodeURIComponent(form.get("orderId"))}/feedback`,{method:"POST",body:JSON.stringify({customerMatric:form.get("customerMatric"),feedback:form.get("feedback")})});
    showNotice(result.message);event.currentTarget.reset();
    if(staffMatric)loadOrders();
  } catch(err) {showNotice(err.message,true);}
});

$("#staffLoginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const matric=String(form.get("matric")).trim().toUpperCase();
  try {
    const result=await api("/api/staff/login",{method:"POST",body:JSON.stringify({matric})});
    staffMatric=result.matric;
    $("#staffIdentity").textContent=`Signed in as ${staffMatric}`;
    $("#staffDashboard").classList.remove("hidden");
    $("#staffLoginForm").classList.add("hidden");
    showNotice("Staff login accepted.");
    await loadOrders();
  } catch(err) {showNotice(err.message,true);}
});
$("#staffLogout").addEventListener("click",()=>{
  staffMatric="";
  $("#staffDashboard").classList.add("hidden");
  $("#staffLoginForm").classList.remove("hidden");
  $("#staffLoginForm").reset();
});
$("#refreshOrders").addEventListener("click",loadOrders);

$("#ordersList").addEventListener("click",async event=>{
  const statusButton=event.target.closest("[data-status]");
  const feedbackButton=event.target.closest("[data-feedback]");
  if(feedbackButton){
    const form=$(`[data-feedback-form="${CSS.escape(feedbackButton.dataset.feedback)}"]`);
    form.classList.toggle("hidden");return;
  }
  if(statusButton){
    const id=statusButton.dataset.id,status=statusButton.dataset.status;
    statusButton.disabled=true;
    try{
      await api(`/api/orders/${encodeURIComponent(id)}/status`,{method:"PATCH",body:JSON.stringify({staffMatric,status})});
      showNotice(`Order marked ${status}.`);await loadOrders();
    }catch(err){showNotice(err.message,true);statusButton.disabled=false;}
  }
});
$("#ordersList").addEventListener("submit",async event=>{
  const form=event.target.closest("[data-feedback-form]");
  if(!form)return;
  event.preventDefault();
  const id=form.dataset.feedbackForm;
  const feedback=new FormData(form).get("feedback");
  try{
    await api(`/api/orders/${encodeURIComponent(id)}/feedback`,{method:"PATCH",body:JSON.stringify({staffMatric,feedback})});
    showNotice("Customer update saved.");await loadOrders();
  }catch(err){showNotice(err.message,true);}
});

renderMenu();
renderCart();
