import { availabilityDays } from "/web/calendar.mjs";
const app = document.body.dataset.app,
  main = document.querySelector("#main"),
  nav = document.querySelector("#nav"),
  notice = document.querySelector("#notice");
let user,
  csrf,
  page = "home",
  stopCamera,
  paymentPreview,
  pricingPreview,
  agreementVersion,
  managementView = "home";
window.addEventListener("pagehide", () => stopCamera?.());
function node(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function friendlyError(text) {
  return (
    {
      "Invalid credentials":
        "That sign-in did not match. Check your private code and try again.",
      "Bag unavailable":
        "That bag could not be used. Check the bag code and try again.",
      "Sign in required": "Please sign in again to continue.",
      "CSRF token required": "Your page expired. Refresh it, then try again.",
    }[text] || text
  );
}
function message(text, error = false) {
  notice.textContent = error ? friendlyError(text) : text;
  notice.className = error ? "error" : "";
  notice.toggleAttribute("hidden", !text);
  if (text)
    requestAnimationFrame(() => {
      notice.setAttribute("tabindex", "-1");
      notice.focus({ preventScroll: true });
      notice.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
}
async function api(path, body) {
  const options = { credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.method = "POST";
    options.headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf || "",
      "Idempotency-Key": crypto.randomUUID(),
    };
    options.body = JSON.stringify(body);
  }
  let r = await fetch(path, options), data;
  try {
    data = await r.json();
  } catch {
    if ([502, 503, 504].includes(r.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      r = await fetch(path, options);
      try {
        data = await r.json();
      } catch {
        throw Error("The private test is restarting. Wait a moment and tap again.");
      }
    } else throw Error("The service did not respond. Please refresh and try again.");
  }
  if (data.code === "private_access_required") {
    window.location.assign(
      "/access?next=" +
        encodeURIComponent(app === "contractor" ? "/contractor" : "/customer"),
    );
    throw Error("Please reopen private test access.");
  }
  if (!r.ok) throw Error(data.error || `Request failed (${r.status})`);
  return data;
}
function button(parent, text, fn, secondary = false) {
  const b = node("button", text, { type: "button" });
  if (parent === nav) b.setAttribute("aria-label", text);
  if (secondary) b.className = "secondary";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      message(e.message, true);
    } finally {
      b.disabled = false;
    }
  });
  parent.append(b);
  return b;
}
function card(icon, title, text) {
  const c = node("section", undefined, { class: "card" });
  c.append(
    node("span", icon, { class: "icon", "aria-hidden": "true" }),
    node("h2", title),
  );
  if (text) c.append(node("p", text, { class: "muted" }));
  main.append(c);
  return c;
}
function field(parent, title, type = "text", value = "") {
  const id = crypto.randomUUID();
  const label = node("label", title, { for: id }),
    input = node("input", undefined, { id, type });
  input.value = value;
  parent.append(label, input);
  return input;
}
function select(parent, title, options, value) {
  const id = crypto.randomUUID(),
    s = node("select", undefined, { id });
  parent.append(node("label", title, { for: id }), s);
  for (const [k, v] of options) s.append(node("option", v, { value: k }));
  if (value) s.value = value;
  return s;
}
function check(parent, title, checked = false) {
  const l = node("label"),
    i = node("input", undefined, { type: "checkbox" });
  i.checked = checked;
  l.append(i, document.createTextNode(title));
  parent.append(l);
  return i;
}
function reset() {
  stopCamera?.();
  main.replaceChildren();
  nav.replaceChildren();
  document.querySelector(".account-action")?.remove();
}
function route(name) {
  stopCamera?.();
  page = name;
  message("");
  window.scrollTo({ top: 0, behavior: "instant" });
  return render();
}
async function scanField(parent, title) {
  const wrap = node("div", undefined, { class: "scan-only" }),
    input = node("input", undefined, { type: "hidden", "data-scan-title": title }),
    status = node("p", "Opening your camera…", { class: "note", role: "status" });
  wrap.append(input, node("h3", title), status);
  parent.append(wrap);
  async function openCamera() {
    wrap.querySelector("button")?.remove();
    status.textContent = "Opening your camera…";
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "Camera scanning is unavailable in this browser. Open the app on a phone with camera access.";
      return;
    }
    let stream, video, cancel;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          video = node("video", undefined, {
            class: "camera",
            playsinline: "",
            muted: "",
          });
          video.srcObject = stream;
          parent.append(video);
          await video.play();
          let active = true;
          const stop = () => {
            active = false;
            stream?.getTracks().forEach((t) => t.stop());
            video?.remove();
            cancel?.remove();
            stopCamera = null;
          };
          stopCamera?.();
          stopCamera = stop;
          cancel = button(parent, "Stop camera", stop, true);
          const detector =
              "BarcodeDetector" in window
                ? new BarcodeDetector({ formats: ["qr_code"] })
                : null,
            canvas = document.createElement("canvas"),
            context = canvas.getContext("2d", { willReadFrequently: true });
          async function poll() {
            if (!active) return;
            try {
              let value;
              if (detector) {
                const codes = await detector.detect(video);
                value = codes[0]?.rawValue;
              } else if (window.jsQR && video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0);
                value = window.jsQR(
                  context.getImageData(0, 0, canvas.width, canvas.height).data,
                  canvas.width,
                  canvas.height,
                  { inversionAttempts: "dontInvert" },
                )?.data;
              }
              if (value) {
                input.value = value;
                stop();
                status.textContent = "QR captured ✓ Continue to the next step.";
                return;
              }
            } catch {}
            requestAnimationFrame(poll);
          }
          poll();
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      video?.remove();
      status.textContent = "Camera permission is needed to scan this QR. Allow camera access, then try again.";
      if (!wrap.querySelector("button")) button(wrap, "Try camera again", openCamera, true);
    }
  }
  queueMicrotask(openCamera);
  return input;
}
function login() {
  reset();
  const c = card(
    "🌿",
    "Welcome back",
    app === "customer"
      ? "Your Customer username is ready. Enter the same private code that opened this preview."
      : "Your Contractor username is ready. Enter the same private code that opened this preview. Owners can replace the username with owner.",
  );
  const f = node("form");
  c.append(f);
  const username = field(
      f,
      "Username",
      "text",
      app === "customer" ? "customer" : "contractor",
    ),
    password = field(f, "Password", "password");
  username.autocomplete = "username";
  username.autocapitalize = "none";
  username.autocorrect = "off";
  username.spellcheck = false;
  password.autocomplete = "current-password";
  const submit = node("button", "Sign in", { type: "submit" });
  f.append(submit);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const d = await api("/api/login", {
        username: username.value.trim().toLowerCase(),
        password: password.value,
      });
      user = d.user;
      csrf = d.csrf;
      page = "home";
      const me = await api("/api/me");
      paymentPreview = me.staging?.payment || null;
      pricingPreview = me.pricing;
      agreementVersion = me.agreement?.version || null;
      user = me.user;
      if (me.staging?.disposable)
        document.querySelector(".staging").textContent =
          "Private preview · practice data only · no real payments or documents";
      await render();
      message("You are signed in.");
    } catch (e) {
      message(e.message, true);
    } finally {
      submit.disabled = false;
    }
  });
}
async function render() {
  if (!user) return login();
  if (
    ["customer", "contractor"].includes(user.role) &&
    agreementVersion &&
    user.agreementVersion !== agreementVersion
  )
    return agreement();
  if (page === "home" && ["owner", "staff"].includes(user.role))
    page = "management";
  reset();
  const isManagement = app === "contractor" && ["owner", "staff"].includes(user.role);
  const pages =
    isManagement
      ? [["management", "Management"]]
      : app === "customer"
      ? [
          ["home", "Home"],
          ["orders", "My laundry"],
          ["book", "New order"],
          ["bags", "My bags"],
          ["profile", "Profile"],
        ]
      : [
          ["home", "Today"],
          ["availability", "Availability"],
          ["offers", "Offers"],
          ["orders", "My jobs"],
          ["earnings", "My pay"],
          ["profile", "Profile"],
        ];
  nav.hidden = isManagement;
  document.querySelector("footer").hidden = isManagement;
  const icons = {
    home: "⌂",
    orders: "🧺",
    book: "✦",
    bags: "🛍",
    availability: "📅",
    offers: "↓",
    earnings: "$",
    management: "⚙",
    profile: "👤",
  };
  for (const [k, t] of pages) {
    const tab = button(
      nav,
      t,
      () => {
        if (k === "management") managementView = "home";
        return route(k);
      },
      page !== k,
    );
    tab.dataset.icon = icons[k] || "•";
    tab.setAttribute("aria-label", t);
    if (page === k) tab.setAttribute("aria-current", "page");
  }
  const account = node("div", undefined, { class: "account-action" });
  document.querySelector("header").append(account);
  button(
    account,
    "Sign out",
    async () => {
      await api("/api/logout", {});
      user = null;
      csrf = null;
      page = "home";
      login();
      message("You are signed out.");
    },
    true,
  );
  if (app === "customer" && user.role !== "customer") {
    card(
      "🌱",
      "Customer account needed",
      "Sign out and use the Customer sign-in.",
    );
    return;
  }
  if (
    app === "contractor" &&
    !["contractor", "owner", "staff"].includes(user.role)
  ) {
    card(
      "🌱",
      "Contractor account needed",
      "Sign out and use the Contractor or owner sign-in.",
    );
    return;
  }
  try {
    await (
      {
        home: home,
        guide: guide,
        offers: orders,
        orders: orders,
        book: book,
        bags: bags,
        profile: profile,
        availability: availability,
        earnings: earnings,
        management: management,
      }[page] || orders
    )();
  } catch (e) {
    message(e.message, true);
  }
}
function agreement() {
  reset();
  nav.hidden = true;
  const customer = user.role === "customer";
  const c = card(
    "📜",
    customer ? "Customer pilot agreement" : "Washing specialist pilot agreement",
    "Read and accept every condition before continuing. This private-pilot draft must receive Texas legal review before public launch.",
  );
  const conditions = customer
    ? [
        "Cotton Roots provides the app and secure drop-off/pickup location and facilitates the transaction.",
        "The accepted washing service is performed by an independent washing specialist; optional transportation is agreed with that specialist.",
        "I will follow the bag scan, custody, payment, and pickup steps shown in the app.",
      ]
    : [
        "I choose my availability and which offered jobs to accept; no job or transportation service is required.",
        "I am responsible for my independent-business taxes, expenses, care of accepted laundry, and agreed transportation.",
        "I will follow the bag scan, custody, deadline, payment-verification, and return steps shown in the app.",
      ];
  const checks = conditions.map((text) => check(c, text));
  button(c, "Agree and continue", async () => {
    if (!checks.every((item) => item.checked))
      throw Error("Check every agreement condition before continuing.");
    const result = await api("/api/agreements/accept", {
      version: agreementVersion,
      accepted: true,
      conditions: customer
        ? ["platform_role", "customer_contractor_service", "pilot_data"]
        : ["platform_role", "independent_business", "pilot_data"],
    });
    user = result.user;
    nav.hidden = false;
    await render();
    message("Agreement accepted.");
  });
}
const statusLabels = {
  awaiting_dropoff: "Ready for drop-off",
  at_shop: "At the shop",
  offered: "Available offer",
  accepted: "Accepted",
  washing: "Being washed",
  payment_pending: "Finished · payment pending",
  paid_hold: "Paid · safely held",
  paid_ready: "Paid · ready to collect",
  picked_up: "Collected",
  cancelled: "Cancelled",
};
function summary(c, o) {
  c.append(
    node("span", statusLabels[o.status] || "Status update", { class: "pill" }),
  );
  const dl = node("dl");
  for (const [k, v] of [
    ["Order", o.id],
    ["Bag", o.bag_id || "Not assigned"],
    [
      "Due",
      o.due_at
        ? new Date(o.due_at).toLocaleString()
        : "Set after shop drop-off",
    ],
    ["Weight", o.billed_pounds ? `${o.billed_pounds} lb` : "Not weighed yet"],
  ])
    dl.append(node("dt", k), node("dd", v));
  c.append(dl);
  if (o.total !== undefined) {
    const amount = node("p", `Laundry total: $${Number(o.total).toFixed(2)}`, {
      class: "price",
    });
    c.append(amount);
  }
  if (o.detergent)
    c.append(
      node(
        "p",
        `Detergent: ${{ standard: "Shop standard", own: "Customer’s sealed, labeled detergent", contact: "Contact the shop before washing" }[o.detergent] || o.detergent}`,
        { class: "muted" },
      ),
    );
  if (o.rush_requested)
    c.append(
      node(
        "p",
        o.rush_approved
          ? "Rush approved"
          : "Rush requested · awaiting approval",
        { class: "pill" },
      ),
    );
  if (o.due_note) c.append(node("p", o.due_note, { class: "muted" }));
}
function contractorReminder(order) {
  if(user?.role!=="contractor"||order.assigned_contractor_id!==user.id||!["accepted","washing"].includes(order.status)||!order.due_at||order.returned_at)return null;
  const minutes=Math.ceil((Date.parse(order.due_at)-Date.now())/60000);
  if(!Number.isFinite(minutes)||minutes>360)return null;
  const late=minutes<=0,amount=Math.abs(minutes),hours=Math.floor(amount/60),remainder=amount%60,time=[hours?`${hours} hr`:"",remainder?`${remainder} min`:""].filter(Boolean).join(" ")||"now";
  return {late,text:late?`LATE by ${time}`:`${time} remaining`,level:late?"late":minutes<=60?"one hour":minutes<=180?"three hours":"six hours"};
}
function contractorReminders(orders) {
  const reminders=orders.map(order=>[order,contractorReminder(order)]).filter(([,reminder])=>reminder);
  if(!reminders.length)return;
  const c=card("⏰","Deadline reminders","These update whenever you open or refresh the app.");
  for(const [order,reminder] of reminders){const row=node("div",undefined,{class:"step"});row.append(node("div",reminder.late?"!":"⏱",{class:"big"}),node("p",`${reminder.text} · ${order.bag_id}\nDue ${new Date(order.due_at).toLocaleString()}`));c.append(row)}
}
function testPaymentPricing(total) {
  const base = Math.round(Number(total) * 100),
    rate = Number(paymentPreview?.estimatedFee?.basisPoints),
    fixed = Number(paymentPreview?.estimatedFee?.fixedCents);
  if (
    !Number.isSafeInteger(base) ||
    base <= 0 ||
    !Number.isInteger(rate) ||
    !Number.isInteger(fixed)
  )
    return null;
  const testTotal = Math.ceil((base + fixed) / (1 - rate / 10000));
  return { base, fee: testTotal - base, testTotal };
}
function addTestCheckout(card, o) {
  const pricing = testPaymentPricing(o.total);
  if (!pricing) return;
  card.append(
    node(
      "p",
      `TEST MODE ESTIMATE · Laundry $${(pricing.base / 100).toFixed(2)} + estimated online payment cost $${(pricing.fee / 100).toFixed(2)} = $${(pricing.testTotal / 100).toFixed(2)} test total. Final live pricing and fee rules are not approved.`,
      { class: "note" },
    ),
  );
  button(card, "Open Stripe test checkout", async () => {
    const result = await api("/api/payments/checkout", { orderId: o.id });
    if (result.pricing?.estimateOnly !== true)
      throw Error("Test payment estimate missing.");
    window.location.assign(result.checkoutUrl);
  });
}
async function orders() {
  const response = await api("/api/orders");
  const orders =
    app === "contractor" && user.role === "contractor"
      ? response.orders.filter((o) =>
          page === "offers"
            ? ["at_shop", "offered"].includes(o.status)
            : o.assigned_contractor_id === user.id,
        )
      : response.orders;
  card(
    "🧺",
    app === "customer"
      ? "Your laundry, step by step"
      : page === "offers"
        ? "Available offers"
        : "My jobs",
    app === "customer"
      ? "Updates are shared securely with the shop. Payment and pickup are separate steps."
      : "Accept only when you can meet the displayed deadline. Scan the bag and shop station at each required visit.",
  );
  if(app==="contractor"&&page!=="offers")contractorReminders(orders);
  const filterBox = node("div", undefined, { class: "filter" });
  main.append(filterBox);
  const filter = select(
    filterBox,
    "Show laundry",
    app === "customer"
      ? [
          ["all", "All my laundry"],
          ["active", "In progress"],
          ["ready", "Paid & ready"],
          ["complete", "Collected"],
        ]
      : page === "offers"
        ? [["all", "All available offers"]]
        : [
            ["all", "All my jobs"],
            ["active", "My active jobs"],
            ["complete", "Returned jobs"],
          ],
  );
  if (app === "contractor") {
    const help = button(
      filterBox,
      "Open step-by-step guide",
      () => route("guide"),
      true,
    );
    help.classList.add("guide-link");
  }
  const orderCards = [];
  filter.addEventListener("change", () => {
    for (const [c, o] of orderCards) {
      const key = filter.value;
      c.hidden = !(
        key === "all" ||
        (key === "offers" && ["at_shop", "offered"].includes(o.status)) ||
        (key === "active" &&
          ![
            "picked_up",
            "cancelled",
            "payment_pending",
            "paid_hold",
            "paid_ready",
          ].includes(o.status) &&
          (app === "customer" || o.assigned_contractor_id === user.id)) ||
        (key === "ready" &&
          o.status === "paid_ready" &&
          o.payment_verified &&
          o.ready_for_pickup) ||
        (key === "complete" &&
          (app === "customer" ? o.status === "picked_up" : !!o.returned_at))
      );
    }
  });
  if (!orders.length)
    card(
      "🌿",
      "Nothing here yet",
      app === "customer"
        ? "Claim a bag, then book your first order."
        : page === "offers"
          ? "No eligible offers right now. Set your availability, then check back."
          : "Your accepted work will appear here. Check Offers to find your next job.",
    );
  for (const o of orders) {
    const c = card(
      "🧺",
      o.service === "full_service" ? "Pickup, wash & return" : "Wash & fold",
    );
    orderCards.push([c, o]);
    summary(c, o);
    timeline(c, o);
    if (app === "customer") {
      if (o.status === "awaiting_dropoff")
        button(c, "Drop off this bag", () => actionWizard(o, "drop_off"));
      if (o.status === "paid_ready" && o.payment_verified && o.ready_for_pickup)
        button(c, "Collect my paid bag", () =>
          actionWizard(o, "customer_pickup"),
        );
      if (o.status === "picked_up" && !o.rating)
        button(c, "Leave a rating", () => actionWizard(o, "rate"));
      if (
        o.status === "payment_pending" &&
        paymentPreview?.provider === "stripe"
      )
        addTestCheckout(c, o);
      else if (["payment_pending", "paid_hold"].includes(o.status))
        c.append(
          node(
            "p",
            o.status === "paid_hold"
              ? "Test payment verified. Your bag stays protected until staff moves it to the paid pickup area."
              : "Payments are not configured. Pickup remains protected.",
            { class: "muted" },
          ),
        );
      button(c, "Report a problem", () => complaintForm(o), true);
    } else if (user.role === "contractor") {
      if (["at_shop", "offered"].includes(o.status))
        button(c, "Review this offer", () => actionWizard(o, "accept_job"));
      if (o.status === "accepted")
        button(
          c,
          o.billed_pounds ? "Scan station & check out" : "Scan bag & weigh",
          () =>
            actionWizard(
              o,
              o.billed_pounds ? "wall_checkout" : "record_weight",
            ),
        );
      if (o.status === "washing") {
        const next = !o.wash_completed_at
          ? "wash_complete"
          : !o.return_bag_scanned_at
            ? "return_bag"
            : "wall_checkin";
        button(
          c,
          {
            wash_complete: "Laundry is clean",
            return_bag: "Scan bag on return",
            wall_checkin: "Check in at shop",
          }[next],
          () => actionWizard(o, next),
        );
      }
    } else if (o.status === "paid_hold")
      button(c, "Verify paid bag for pickup area", () =>
        actionWizard(o, "staff_release"),
      );
  }
}
function complaintForm(order) {
  reset();
  const c = card("💬", "Report a problem", "Management will see this in the Customer complaints tab. Do not enter card numbers or identity documents.");
  c.append(node("p", `Order ${order.id}`, { class: "note" }));
  const category = select(c, "What is this about?", [["service","Service"],["late","Late return"],["bag","Bag"],["payment","Payment"],["other","Other"]]);
  const label=node("label","Tell us what happened"), details=node("textarea");
  details.rows=5;details.maxLength=1000;details.placeholder="At least 10 characters";label.append(details);c.append(label);
  button(c,"Send to Management",async()=>{await api("/api/complaints",{orderId:order.id,category:category.value,message:details.value});await route("orders");message("Your report was sent to Management.");});
  button(c,"Cancel",()=>route("orders"),true);
}
async function actionWizard(o, action) {
  stopCamera?.();
  main.replaceChildren();
  const names = {
    drop_off: ["🏪", "Drop off at the shop"],
    customer_pickup: ["🛍", "Collect your bag"],
    record_weight: ["⚖", "Record measured weight"],
    wall_checkout: ["🏪", "Check out at shop"],
    wash_complete: ["✨", "Finished washing?"],
    return_bag: ["🧺", "Return the same bag"],
    wall_checkin: ["🏪", "Check in at shop"],
    accept_job: ["📅", "Can you meet this deadline?"],
    staff_release: ["🔐", "Move to paid pickup bin"],
    rate: ["⭐", "How was your laundry?"],
  };
  const [icon, title] = names[action],
    c = card(icon, title);
  c.prepend(node("p", stepLabel(action), { class: "eyebrow" }));
  const stage = node("div");
  c.append(stage);
  const body = { action };
  const detail = node("details", undefined, { class: "journey" });
  detail.append(node("summary", "See order details"));
  summary(detail, o);
  c.append(detail);
  const success = {
    drop_off: "Drop-off saved. Your laundry is checked in at the shop.",
    customer_pickup: "Pickup complete. Enjoy your fresh laundry!",
    record_weight: "Weight saved. Next, scan the shop station to check out.",
    wall_checkout:
      "Checked out. Wash, dry, and fold this order, then return to My jobs.",
    wash_complete:
      "Laundry marked clean. Next, bring back and scan the same bag.",
    return_bag: "Bag scan saved. Next, scan the shop station to check in.",
    wall_checkin:
      "Return complete. Earnings stay pending until customer payment is verified.",
    accept_job: "Offer accepted. Open My jobs when you are ready to begin.",
    staff_release: "Bag moved to the paid pickup bin.",
    rate: "Thank you for your feedback.",
  };
  async function submit() {
    await api(`/api/orders/${encodeURIComponent(o.id)}/actions`, body);
    await route("orders");
    message(success[action] || "Done. Your next step is shown below.");
  }
  function clear() {
    stopCamera?.();
    stage.replaceChildren();
  }
  async function station() {
    clear();
    stage.append(
      node(
        "p",
        "Now scan the shop station QR. Your bag scan stays in this guided step until you confirm.",
        { class: "note" },
      ),
    );
    const stationToken = await scanField(stage, "Scan the shop station QR");
    button(stage, "Confirm this step", async () => {
      body.stationToken = stationToken.value.trim();
      await submit();
    });
    if (action === "drop_off") button(stage, "Back: scan bag again", bag, true);
  }
  function weigh() {
    clear();
    stage.append(
      node(
        "p",
        "Slide to the scale reading or enter it below. No weight photo is needed.",
        { class: "note" },
      ),
    );
    const pounds = field(stage, "Measured pounds", "number");
    pounds.min = "0.1";
    pounds.max = "200";
    pounds.step = "0.1";
    weightControl(stage, pounds);
    stage.append(
      node(
        "p",
        "The server confirms the weight and rounds upward to the next half-pound.",
        { class: "muted" },
      ),
    );
    button(stage, "Confirm this step", async () => {
      const n = Number(pounds.value);
      if (!Number.isFinite(n) || n <= 0 || n > 200)
        throw Error("Enter a measured weight between 0.1 and 200 lb.");
      body.measuredPounds = n;
      await submit();
    });
    button(stage, "Back: scan bag again", bag, true);
  }
  async function bag() {
    clear();
    stage.append(
      node(
        "p",
        action === "customer_pickup"
          ? "Match this order to the bag in front of you. Only your paid-and-ready bag can be collected."
          : "First, scan the matching bag. Manual entry is available if your camera cannot scan.",
        { class: "note" },
      ),
    );
    const token = await scanField(stage, "Scan the matching bag QR");
    button(
      stage,
      action === "drop_off"
        ? "Next: scan station"
        : action === "record_weight"
          ? "Next: weigh laundry"
          : "Confirm this step",
      async () => {
        if (!token.value.trim())
          throw Error("Scan or enter the bag token first.");
        body.bagToken = token.value.trim();
        if (action === "drop_off") await station();
        else if (action === "record_weight") weigh();
        else await submit();
      },
    );
  }
  if (
    [
      "drop_off",
      "customer_pickup",
      "record_weight",
      "return_bag",
      "staff_release",
    ].includes(action)
  )
    await bag();
  else if (["wall_checkout", "wall_checkin"].includes(action)) await station();
  else if (action === "accept_job") {
    stage.append(
      node(
        "p",
        `Due: ${o.due_at ? new Date(o.due_at).toLocaleString() : "No confirmed deadline — do not accept."}`,
        { class: "note" },
      ),
    );
    const ack = check(stage, "I can meet this deadline.");
    button(stage, "Confirm this step", async () => {
      if (!o.due_at || !ack.checked)
        throw Error(
          "A confirmed deadline and your acknowledgment are required.",
        );
      body.deadlineAcknowledged = true;
      await submit();
    });
  } else if (action === "rate") {
    const rating = select(stage, "Your rating", [
      ["5", "5 — Wonderful"],
      ["4", "4 — Good"],
      ["3", "3 — Okay"],
      ["2", "2 — Needs work"],
      ["1", "1 — Poor"],
    ]);
    button(stage, "Confirm this step", async () => {
      body.rating = Number(rating.value);
      await submit();
    });
  } else if (action === "wash_complete") {
    stage.append(
      node(
        "p",
        "Confirm the laundry is washed, dried, folded, and ready to bring back. This does not check it in at the shop.",
        { class: "note" },
      ),
    );
    button(stage, "Confirm this step", submit);
  }
  button(c, "Back to laundry", () => route("orders"), true);
}
async function book() {
  const prices=pricingPreview||{dropoff:2.5,full_service:3,rushPerLb:1};
  const c = card(
    "🧺",
    "Let’s book your laundry",
    "Choose one service. Final weight is measured at the shop.",
  );
  c.prepend(node("p", "STEP 1 OF 3 · SERVICE", { class: "eyebrow" }));
  const service = "dropoff",
    choices = node("div", undefined, { class: "choice-grid" });
  c.append(choices);
  const drop = choice(
    choices,
    "🧺",
    "Drop off",
    `$${Number(prices.dropoff).toFixed(2)} / lb · bring it to the shop`,
    () => {},
  );
  drop.setAttribute("aria-pressed", "true");
  const full = choice(
    choices,
    "🚗",
    "Pickup & return",
    `$${Number(prices.full_service).toFixed(2)} / lb · coming later`,
    () => {},
  );
  full.disabled = true;
  c.append(
    node(
      "p",
      "Pickup and return is coming later. It cannot be selected in this preview.",
      { class: "muted" },
    ),
  );
  button(c, "Next: choose detergent", () => {
    main.replaceChildren();
    const d = card(
      "🫧",
      "Choose your detergent",
      "Pick the option you want us to follow.",
    );
    d.prepend(node("p", "STEP 2 OF 3 · PREFERENCES", { class: "eyebrow" }));
    const detergent = select(d, "Detergent preference", [
      ["standard", "Shop standard"],
      ["own", "My sealed, labeled detergent"],
      ["contact", "Please contact me"],
    ]);
    const rush = check(d, "Ask about rush service (approval required)");
    button(d, "Next: review order", () => {
      main.replaceChildren();
      const review = card(
        "🌿",
        "Ready to book?",
        `Drop off · $${Number(prices.dropoff).toFixed(2)} / lb. ${detergent.selectedOptions[0].textContent}. ${rush.checked ? "Rush requested; not yet approved." : "Standard service."}`,
      );
      review.prepend(node("p", "STEP 3 OF 3 · REVIEW", { class: "eyebrow" }));
      review.append(
        node(
          "p",
          `We round the measured weight up to the next ½ lb. Approved rush would add $${Number(prices.rushPerLb).toFixed(2)}/lb. No payment is taken here.`,
          { class: "note" },
        ),
      );
      button(review, "Book this order", async () => {
        await api("/api/orders", {
          service,
          detergent: detergent.value,
          rush_requested: rush.checked,
        });
        await route("orders");
        message(
          "Order booked. Next, bring your bag to the shop and choose Drop off this bag.",
        );
      });
      button(review, "Start again", () => route("book"), true);
    });
    button(d, "Back", () => route("book"), true);
  });
}
async function profile() {
  const me = await api("/api/me"),
    c = card(
      "👤",
      "My account",
      "Update the contact details the Cotton Roots team should use. Card numbers are handled only by Stripe, never stored here.",
    );
  const name = field(c, "Name", "text", me.user.displayName || ""),
    phone = field(c, "Phone", "tel", me.user.phone || ""),
    email = field(c, "Email", "email", me.user.email || "");
  button(c, "Save contact details", async () => {
    const result = await api("/api/profile", {
      displayName: name.value,
      phone: phone.value,
      email: email.value,
    });
    user = result.user;
    message("Contact details saved.");
  });
}
async function bags() {
  const { bags = [] } = await api("/api/bags");
  const intro = card(
    "🛍",
    "Your Cotton Roots bags",
    "Open the bag box, take one bag, then scan the unique QR attached to that bag. The scan registers it to your account.",
  );
  for (const b of bags) {
    const bagCard = node("div", undefined, { class: "bag-card" });
    bagCard.append(
      node("strong", `🛍 ${b.id}`),
      node(
        "p",
        b.claimed_at
          ? "Registered " + new Date(b.claimed_at).toLocaleString()
          : "Assigned to you",
        { class: "muted" },
      ),
    );
    if (b.first_return_due)
      bagCard.append(
        node(
          "p",
          "First return by " + new Date(b.first_return_due).toLocaleString(),
          { class: "note" },
        ),
      );
    if (b.exchange_requested_at)
      bagCard.append(
        node(
          "p",
          "Bag exchange request sent. Management will arrange the replacement.",
          { class: "note" },
        ),
      );
    else
      button(
        bagCard,
        "Request a bag exchange",
        async () => {
          await api("/api/bags/exchange-request", { bagId: b.id });
          await route("bags");
          message("Bag exchange request sent to Management.");
        },
        true,
      );
    intro.append(bagCard);
  }
  intro.append(
    node(
      "p",
      "First bag included. A bag taken without its QR scan is not registered to a customer.",
      { class: "note" },
    ),
  );
  button(intro, "Get bag-box code", async () => {
    const access = await api("/api/bag-box/access", {});
    main.replaceChildren();
    const c = card(
      "🔐",
      "Your bag-box code",
      "Use this reusable code at the bag box. Keep it private.",
    );
    c.append(
      node("div", access.accessCode, { class: "access-code" }),
      node(
        "p",
        "Camera monitoring is handled separately. Taking a bag does not register it—scan the unique QR attached to the bag next.",
        { class: "note" },
      ),
    );
    button(c, "Next: scan my bag", () => route("bags"));
    button(c, "Back", () => route("bags"), true);
  });
  button(intro, "Scan and register my bag", async () => {
    main.replaceChildren();
    const c = card(
      "📦",
      "Scan the bag you took",
      "Scan the unique QR attached to the physical bag. This connects that bag to your account.",
    );
    const lid = check(c, "I took this bag from the box.");
    const bagToken = await scanField(c, "Scan the unique bag QR");
    button(c, "Next: close the box", () => {
      if (!lid.checked || !bagToken.value.trim())
        throw Error("Confirm the bag step and scan its QR first.");
      main.replaceChildren();
      const d = card(
        "🔒",
        "Shut and lock the box",
        "This records your acknowledgment. Camera monitoring remains a separate physical control.",
      );
      const locked = check(d, "I shut and locked the box.");
      button(d, "Register this bag to me", async () => {
        if (!locked.checked)
          throw Error("Please close and lock the box first.");
        const result = await api("/api/claim", {
          bagToken: bagToken.value.trim(),
          boxAcknowledged: true,
          lockedAcknowledged: true,
        });
        await route("bags");
        message(
          result.alreadyRegistered
            ? "This bag was already registered to your account."
            : "Bag registered to your account. Return your first bag with laundry within 24 hours.",
        );
      });
      button(d, "Cancel", () => route("bags"), true);
    });
    button(c, "Cancel", () => route("bags"), true);
  });
}
async function availability() {
  const data = await api("/api/availability");
  const c = card(
    "📅",
    "When can you help?",
    "Tap the days you are available over the next two weeks.",
  );
  const preference = select(
    c,
    "Work preference",
    [
      ["both", "Both services"],
      ["dropoff", "Wash & fold"],
      ["full_service", "Pickup, wash & return"],
    ],
    data.preference,
  );
  const count = node("p", `${(data.days || []).length} days selected`, {
    class: "note",
  });
  c.append(count);
  const grid = node("div", undefined, { class: "dates" });
  c.append(grid);
  const inputs = [];
  for (const key of availabilityDays()) {
    const d = new Date(key + "T12:00:00Z");
    inputs.push([
      key,
      check(
        grid,
        d.toLocaleDateString(undefined, {
          timeZone: "UTC",
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        (data.days || []).includes(key),
      ),
    ]);
  }
  grid.addEventListener("change", () => {
    count.textContent = `${inputs.filter(([, i]) => i.checked).length} days selected`;
  });
  button(c, "Save availability", async () => {
    await api("/api/availability", {
      days: inputs.filter(([, i]) => i.checked).map(([k]) => k),
      preference: preference.value,
    });
    message("Availability saved.");
  });
}
async function earnings() {
  const { earnings = [] } = await api("/api/earnings");
  card(
    "🌱",
    "Your earnings",
    `Contractor rate: $${Number(pricingPreview?.contractor??1).toFixed(2)} per approved pound for newly booked jobs. Each accepted job keeps its booked rate. Machine costs are paid by the contractor. Payout integration is disabled; no funds move here.`,
  );
  const totals = node("div", undefined, { class: "stat-grid" });
  main.append(totals);
  for (const status of ["pending", "approved", "paid"])
    stat(
      totals,
      `$${earnings
        .filter((e) => e.status === status)
        .reduce((n, e) => n + Number(e.amount || 0), 0)
        .toFixed(2)}`,
      status === "approved" ? "Approved for payout" : status,
    );
  if (!earnings.length)
    card(
      "🧾",
      "No earnings yet",
      "Completed work is pending until payment is verified. Payouts follow a full week in arrears.",
    );
  for (const e of earnings) {
    const c = card("🧾", e.order_id || "Earnings");
    for (const [k, v] of Object.entries(e))
      c.append(node("p", `${k.replaceAll("_", " ")}: ${v}`));
  }
}
async function management() {
  const data = await api("/api/management");
  return managementWorkspace(data);
  /* Legacy combined screen retained below during the private pilot. */
  if (user.role === "owner") {
    const kit = await api("/api/management/test-kit");
    const sample = card(
      "🧪",
      "Synthetic test codes",
      "Display this screen on the computer. Scan the bag QR with the Customer app on your phone to practice taking a bag. No real bags or locks are controlled.",
    );
    sample.append(
      node("img", undefined, {
        src: "/api/management/test-kit/bag-qr",
        alt: "Synthetic test bag QR code",
        class: "test-bag-qr",
      }),
      node(
        "p",
        "This QR contains only the synthetic bag code. It contains no customer information.",
        { class: "note" },
      ),
    );
    for (const [label, value] of [
      ["Sample bag code", kit.bagToken],
      ["Sample station code", kit.stationToken],
    ]) {
      const input = field(sample, label, "text", value);
      input.readOnly = true;
      input.addEventListener("focus", () => input.select());
    }
    const create = card(
      "👤",
      "Create pilot login",
      "Give each tester their own login. This is for private testing only; do not enter real identity documents.",
    );
    const role = select(create, "App", [
      ["customer", "Customer"],
      ["contractor", "Contractor"],
    ]);
    const username = field(create, "Username", "text");
    username.placeholder = "example: jordan-test";
    username.autocapitalize = "none";
    const password = field(create, "Temporary password", "password");
    password.placeholder = "At least 12 characters";
    button(create, "Create pilot login", async () => {
      const result = await api("/api/management/accounts", {
        role: role.value,
        username: username.value,
        temporaryPassword: password.value,
      });
      main.replaceChildren();
      const done = card(
        "✓",
        "Pilot login created",
        `Give this to ${result.user.username} privately. They sign in through the ${result.user.role === "customer" ? "Customer" : "Contractor"} app.`,
      );
      const login = node("div", undefined, { class: "bag-card" });
      login.append(
        node("strong", "Username: " + result.user.username),
        node("p", "Temporary password: " + password.value),
      );
      done.append(
        login,
        node(
          "p",
          "This password is shown once. Contractors still need Management approval before accepting jobs.",
          { class: "note" },
        ),
      );
      button(done, "Back to Management", () => route("management"));
    });
  }
  const overview = card(
    "🔐",
    "Management",
    "Server-protected staging access. Real documents, payments, and payouts are disabled. Production management requires MFA and an independent security review.",
  );
  const stats = node("div", undefined, { class: "stat-grid" });
  overview.append(stats);
  stat(
    stats,
    (data.orders || []).filter(
      (o) => !["picked_up", "cancelled"].includes(o.status),
    ).length,
    "Active orders",
  );
  stat(
    stats,
    (data.orders || []).filter((o) => o.status === "payment_pending").length,
    "Payment hold",
  );
  stat(
    stats,
    (data.users || []).filter((u) => u.role === "contractor" && !u.approved)
      .length,
    "Need review",
  );
  managementTables(data);
  for (const o of data.orders || []) {
    const c = card("🧺", "Order");
    summary(c, o);
    if (o.status === "paid_hold")
      button(c, "Verify paid-bin release", () =>
        actionWizard(o, "staff_release"),
      );
  }
  const audit = card("📖", "Audit trail", "Latest recorded server events.");
  for (const e of (data.audit || []).slice(-30).reverse())
    audit.append(node("pre", JSON.stringify(e, null, 2)));
}
function managementWorkspace(data) {
  if (managementView === "customers") return accountTable(data, "customer");
  if (managementView === "contractors") return accountTable(data, "contractor");
  if (managementView === "bags") return bagInventory(data);
  if (managementView === "money") return moneyManagement(data);
  if (managementView === "tools") return managementTestTools();
  if (managementView === "orders") return managementOrders(data);
  if (managementView === "alerts") return managementAlerts(data);
  if (managementView === "complaints") return managementComplaints(data);
  if (managementView === "pricing") return managementPricing(data);
  const c = card(
    "⚙️",
    "Management",
    "Choose one area. Customers, contractors, bags, and money each have their own workspace.",
  );
  const stats = node("div", undefined, { class: "stat-grid" });
  c.append(stats);
  stat(stats, (data.users || []).filter((u) => u.role === "customer").length, "Customers");
  stat(stats, (data.users || []).filter((u) => u.role === "contractor").length, "Contractors");
  stat(stats, (data.bags || []).filter((b) => b.exchange_requested_at).length, "Bag exchanges");
  stat(stats, (data.orders || []).filter((o) => o.status === "paid_ready" && o.payment_verified && o.ready_for_pickup).length, "Ready for pickup");
  stat(stats, (data.orders || []).filter((o) => o.deadline_alert).length, "Late alerts");
  stat(stats, (data.complaints || []).filter((item) => item.status === "open").length, "Open complaints");
  const choices = node("div", undefined, { class: "choice-grid" });
  c.append(choices);
  for (const [key, icon, title, description] of [
    ["customers", "👤", "Customers", "Accounts, contact details, and assigned bags"],
    ["contractors", "🧺", "Contractors", "Approvals, access, availability, and jobs"],
    ["bags", "🛍", "Bag inventory", "Available, assigned, exchange, and retired bags"],
    ["money", "💵", "Money", "Payment status and contractor amounts due"],
    ["orders", "📦", "Orders", "Ready for pickup and completed orders"],
    ["alerts", "⏰", "Late alerts", "Due within 6 hours and overdue work"],
    ["complaints", "💬", "Customer complaints", "Review and resolve customer reports"],
    ["pricing", "🏷", "Pricing", "Customer rates, bag price, and contractor pay"],
    ["tools", "🧪", "Pilot tools", "Synthetic QR and station test codes"],
  ])
    choice(choices, icon, title, description, () => {
      managementView = key;
      route("management");
    });
}
function managementPricing(data){
  const prices=data.pricing||{dropoff:2.5,full_service:3,rushPerLb:1,extraBag:10,contractor:1},c=card("🏷","Pricing","Changes apply only to orders booked after you save. Existing jobs keep their original rates.");managementBack(c);
  if(!data.pricingPinSet){c.append(node("p","Create a separate six-digit PIN. You will enter it every time pricing changes.",{class:"note"}));const pin=field(c,"New six-digit pricing PIN","password"),confirmPin=field(c,"Enter the PIN again","password");for(const input of [pin,confirmPin]){input.inputMode="numeric";input.maxLength=6;input.pattern="[0-9]{6}"}button(c,"Set pricing PIN",async()=>{await api("/api/management/pricing",{action:"set_pin",pin:pin.value,confirmPin:confirmPin.value});await route("management");message("Pricing PIN created. Open Pricing again to make changes.")});return}
  const inputs={};for(const [key,label] of [["dropoff","Customer drop-off price per lb"],["full_service","Customer pickup & return price per lb"],["rushPerLb","Rush addition per lb"],["extraBag","Extra or replacement bag price"],["contractor","Contractor pay per approved lb"]]){inputs[key]=field(c,label,"number",Number(prices[key]).toFixed(2));inputs[key].min="0";inputs[key].max="100";inputs[key].step="0.01"}
  const pin=field(c,"Confirm with six-digit pricing PIN","password");pin.inputMode="numeric";pin.maxLength=6;pin.pattern="[0-9]{6}";
  button(c,"Confirm and publish pricing",async()=>{const body={pin:pin.value};for(const [key,input] of Object.entries(inputs))body[key]=Number(input.value);const result=await api("/api/management/pricing",body);pricingPreview=result.pricing;managementView="home";await route("management");message(`Pricing published effective ${new Date(result.effectiveAt).toLocaleString()}.`) });
  if((data.pricingHistory||[]).length){c.append(node("h3","Pricing history"));for(const item of data.pricingHistory)c.append(node("p",`${new Date(item.effective_at).toLocaleString()} · Drop-off $${Number(item.pricing.dropoff).toFixed(2)}/lb · Contractor $${Number(item.pricing.contractor).toFixed(2)}/lb`,{class:"note"}))}
}
function managementOrders(data) {
  const c=card("📦","Orders","Every order appears here from booking through pickup.");managementBack(c);
  const awaiting=(data.orders||[]).filter(o=>o.status==="awaiting_dropoff");
  const waiting=(data.orders||[]).filter(o=>["at_shop","offered"].includes(o.status));
  const active=(data.orders||[]).filter(o=>["accepted","washing","payment_pending","paid_hold"].includes(o.status));
  const ready=(data.orders||[]).filter(o=>o.status==="paid_ready"&&o.payment_verified&&o.ready_for_pickup);
  const completed=(data.orders||[]).filter(o=>o.status==="picked_up").sort((a,b)=>Date.parse(b.picked_up_at||0)-Date.parse(a.picked_up_at||0));
  for(const [title,empty,list] of [
    ["Awaiting customer drop-off","No newly booked orders are waiting for drop-off.",awaiting],
    ["At shop · waiting for contractor","No dropped-off orders are waiting for a contractor.",waiting],
    ["In progress","No orders are currently being washed or processed.",active],
    ["Ready for pickup","No orders are waiting for pickup.",ready],
    ["Completed","No completed orders yet.",completed],
  ]){c.append(node("h3",`${title} (${list.length})`));if(!list.length)c.append(node("p",empty,{class:"muted"}));for(const o of list)managementOrderRow(c,o,data)}
}
function managementOrderRow(parent,o,data) {
  const customer=(data.users||[]).find(u=>u.id===o.customer_id),contractor=(data.users||[]).find(u=>u.id===o.assigned_contractor_id);
  const row=node("div",undefined,{class:"step"});
  const detail=o.status==="picked_up"?`Completed ${new Date(o.picked_up_at).toLocaleString()}`:o.status==="awaiting_dropoff"?"Booked · customer has not checked it in at the shop":["at_shop","offered"].includes(o.status)?"Checked in · available to approved contractors":statusLabels[o.status]||o.status;
  row.append(node("div",o.status==="picked_up"?"✓":"🧺",{class:"big"}),node("p",`${o.bag_id||"No bag"} · Customer: ${customer?.displayName||customer?.username||o.customer_id||"Unknown"}\nContractor: ${contractor?.displayName||contractor?.username||"Not assigned"}\n${detail}`));parent.append(row);
}
function alertText(alert){
 const minutes=alert.state==="overdue"?alert.minutesLate:alert.minutesUntil,hours=Math.floor(minutes/60),remainder=minutes%60,amount=[hours?`${hours}h`:"",remainder?`${remainder}m`:""].filter(Boolean).join(" ")||"now";
 return alert.state==="overdue"?`${amount} late`:`Due in ${amount}`;
}
function managementAlerts(data) {
  const c=card("⏰","Late alerts","Warnings begin 6 hours before the promised return time.");managementBack(c);
  const alerts=(data.orders||[]).filter(o=>o.deadline_alert).sort((a,b)=>{if(a.deadline_alert.state!==b.deadline_alert.state)return a.deadline_alert.state==="overdue"?-1:1;return Date.parse(a.due_at)-Date.parse(b.due_at)});
  const overdue=alerts.filter(o=>o.deadline_alert.state==="overdue"),soon=alerts.filter(o=>o.deadline_alert.state==="due_soon");
  for(const [title,list] of [["Late now",overdue],["Due within 6 hours",soon]]){c.append(node("h3",`${title} (${list.length})`));if(!list.length)c.append(node("p","Nothing in this section.",{class:"muted"}));for(const o of list){const contractor=(data.users||[]).find(u=>u.id===o.assigned_contractor_id),row=node("div",undefined,{class:"step"});row.append(node("div",o.deadline_alert.state==="overdue"?"!":"⏱",{class:"big"}),node("p",`${alertText(o.deadline_alert)} · ${o.bag_id}\nContractor: ${contractor?.displayName||contractor?.username||"Not assigned"}\nDue ${new Date(o.due_at).toLocaleString()}`));c.append(row)}}
}
function managementComplaints(data) {
  const c=card("💬","Customer complaints","Open reports appear first. Customer messages are shown exactly as submitted.");managementBack(c);
  const items=[...(data.complaints||[])].sort((a,b)=>(a.status==="open"?-1:1)-(b.status==="open"?-1:1)||Date.parse(b.created_at)-Date.parse(a.created_at));
  if(!items.length)c.append(node("p","No customer complaints have been submitted.",{class:"muted"}));
  for(const item of items){const customer=(data.users||[]).find(u=>u.id===item.customer_id),box=card(item.status==="open"?"🔴":"✓",`${item.category} · ${item.status}`,`Order ${item.order_id}`);box.append(node("p",item.message),node("p",`${customer?.displayName||customer?.username||"Customer"} · ${new Date(item.created_at).toLocaleString()}`,{class:"muted"}));button(box,item.status==="open"?"Mark resolved":"Reopen",async()=>{await api(`/api/management/complaints/${item.id}`,{status:item.status==="open"?"resolved":"open"});message("Complaint updated.");route("management")},item.status!=="open")}
}
function managementBack(parent) {
  button(parent, "← Management home", () => {
    managementView = "home";
    route("management");
  }, true);
}
function moneyManagement(data) {
  const c = card("💵", "Money", "Test-mode ledger only. No contractor payout is sent from this screen.");
  managementBack(c);
  const jobs = (data.orders || []).filter((o) => o.assigned_contractor_id);
  const wrap = node("div", undefined, { class: "table-wrap" }), table = node("table"), head = node("thead"), row = node("tr");
  for (const label of ["Job", "Contractor", "Customer payment", "Contractor amount", "Payout status"]) row.append(node("th", label));
  head.append(row); table.append(head); const body = node("tbody");
  for (const order of jobs) {
    const tr = node("tr"), amount = Number(order.billed_pounds || 0)*Number(order.contractor_rate_per_lb??data.pricing?.contractor??1);
    for (const value of [order.id, order.assigned_contractor_id, order.payment_verified ? "Verified" : "Waiting", `$${amount.toFixed(2)}`, order.payment_verified && order.returned_at ? "Ready for approval" : "Not ready"]) tr.append(node("td", value));
    body.append(tr);
  }
  table.append(body); wrap.append(table); c.append(wrap);
}
async function managementTestTools() {
  const kit = await api("/api/management/test-kit"), c = card("🧪", "Pilot tools", "Synthetic QR and station codes for private testing only.");
  managementBack(c);
  c.append(
    node("h3", "Shop drop-off QR"),
    node("p", "Post this QR at the drop-off station. Customers scan it after scanning their bag.", { class: "note" }),
    node("img", undefined, { src: "/api/management/test-kit/station-qr", alt: "Shop drop-off station QR code", class: "test-bag-qr" }),
    node("h3", "Sample bag QR"),
    node("img", undefined, { src: "/api/management/test-kit/bag-qr", alt: "Synthetic test bag QR code", class: "test-bag-qr" }),
  );
  for (const [label, value] of [["Sample bag code", kit.bagToken], ["Sample station code", kit.stationToken]]) { const input = field(c, label, "text", value); input.readOnly = true; input.addEventListener("focus", () => input.select()); }
}
function managementTables(data) {
  const c = card(
    "📋",
    "Accounts and bag inventory",
    "Scroll sideways to see every account. Use Edit to update contact details, reset a temporary password, or pause access.",
  );
  const wrap = node("div", undefined, { class: "table-wrap" }),
    table = node("table"),
    head = node("thead"),
    row = node("tr");
  for (const label of [
    "Account",
    "Role",
    "Contact",
    "Status",
    "Bag",
    "Options",
  ])
    row.append(node("th", label));
  head.append(row);
  table.append(head);
  const body = node("tbody");
  for (const account of data.users || []) {
    const tr = node("tr");
    const bag = (data.bags || []).find(
      (b) => b.customer_id === account.id && b.status !== "retired",
    );
    for (const value of [
      account.username,
      account.role,
      [account.displayName, account.phone, account.email]
        .filter(Boolean)
        .join(" · ") || "—",
      account.active === false
        ? "Paused"
        : account.approved
          ? "Active"
          : "Needs approval",
      bag?.id || "—",
    ])
      tr.append(node("td", value));
    const actions = node("td");
    button(actions, "Edit", () => editManagedAccount(account), true);
    if (account.role === "contractor" && !account.approved)
      button(
        actions,
        "Approve",
        async () => {
          await api("/api/management/approve", { userId: account.id });
          route("management");
        },
        true,
      );
    tr.append(actions);
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  c.append(wrap);
}
function editManagedAccount(account) {
  main.replaceChildren();
  const c = card(
    "✎",
    "Edit " + account.username,
    "Update account contact details or access. Payment card numbers are not stored here.",
  );
  const name = field(c, "Name", "text", account.displayName || ""),
    phone = field(c, "Phone", "tel", account.phone || ""),
    email = field(c, "Email", "email", account.email || "");
  button(c, "Save account details", async () => {
    await api("/api/management/accounts/" + encodeURIComponent(account.id), {
      action: "update_profile",
      displayName: name.value,
      phone: phone.value,
      email: email.value,
    });
    route("management");
  });
  if (account.role === "contractor" && !account.approved) {
    const review = node("div", undefined, { class: "bag-card" });
    review.append(
      node("h3", "Contractor approval"),
      node(
        "p",
        "Approve only after you have spoken with this contractor and met them at the shop.",
        { class: "muted" },
      ),
    );
    const phoneConfirmed = check(review, "I spoke with this contractor by phone."),
      inPersonConfirmed = check(review, "I met this contractor in person at the shop.");
    button(review, "Approve contractor", async () => {
      if (!phoneConfirmed.checked || !inPersonConfirmed.checked)
        throw Error("Complete both contractor review steps first.");
      await api("/api/management/approve", {
        userId: account.id,
        phoneConfirmed: true,
        inPersonConfirmed: true,
      });
      await route("management");
      message("Contractor approved.");
    });
    c.append(review);
  }
  if (account.id !== user.id)
    button(
      c,
      account.active === false ? "Restore account" : "Pause account",
      async () => {
        await api(
          "/api/management/accounts/" + encodeURIComponent(account.id),
          { action: "set_active", active: account.active === false },
        );
        route("management");
      },
      true,
    );
  const password = field(c, "New temporary password", "password");
  password.placeholder = "At least 12 characters";
  button(
    c,
    "Reset password",
    async () => {
      await api(
        "/api/management/accounts/" + encodeURIComponent(account.id),
        { action: "reset_password", temporaryPassword: password.value },
      );
      main.replaceChildren();
      const done = card(
        "✓",
        "Password reset",
        "Give this temporary password to the account holder privately.",
      );
      done.append(node("p", password.value, { class: "note" }));
      button(done, "Back to Management", () => route("management"));
    },
    true,
  );
  if (account.id !== user.id)
    button(
      c,
      "Delete unused account",
      async () => {
        if (
          !confirm(
            `Delete ${account.username}? This works only when the account has no bag or job history.`,
          )
        )
          return;
        await api(
          "/api/management/accounts/" + encodeURIComponent(account.id),
          { action: "delete_account" },
        );
        await route("management");
        message("Account deleted.");
      },
      true,
    );
  button(c, "Back", () => route("management"), true);
}

function accountTable(data, role) {
  const people = (data.users || []).filter((u) => u.role === role),
    c = card(
      role === "customer" ? "👤" : "🧺",
      role === "customer" ? "Customers" : "Contractors",
      role === "customer"
        ? "Find a customer, update their contact details, pause access, or manage their bag."
        : "Approve workers, update contact details, pause access, or reset a password.",
    );
  managementBack(c);
  button(c, role === "customer" ? "Add customer login" : "Add contractor login", () => createPilotLogin(role));
  const wrap = node("div", undefined, { class: "table-wrap" }),
    table = node("table"),
    head = node("thead"),
    row = node("tr");
  for (const label of ["Account", "Name", "Phone", "Approval", "Bag", "Options"])
    row.append(node("th", label));
  head.append(row);
  table.append(head);
  const body = node("tbody");
  for (const account of people) {
    const tr = node("tr"),
      bag = (data.bags || []).find(
        (b) => b.customer_id === account.id && b.status !== "retired",
      );
    for (const value of [
      account.username,
      account.displayName || "Not added yet",
      account.phone || "Not added yet",
      account.active === false
        ? "Paused"
        : role === "customer"
          ? "Active"
          : account.approved
            ? "Approved"
            : "Pending review",
      bag?.id || "—",
    ])
      tr.append(node("td", value));
    const actions = node("td");
    button(actions, "Account options", () => editManagedAccount(account), true);
    if (role === "contractor" && !account.approved)
      button(actions, "Review for approval", () => reviewContractor(account));
    tr.append(actions);
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  c.append(wrap);
}
function reviewContractor(account) {
  main.replaceChildren();
  const c=card("🧺","Contractor approval","Review the information they entered. You do not need to edit it before deciding.");
  const details=node("dl");
  for(const [label,value] of [["Name",account.displayName||"Not provided"],["Phone",account.phone||"Not provided"],["Email",account.email||"Not provided"],["Username",account.username]])details.append(node("dt",label),node("dd",value));
  c.append(details,node("p","Approve only after speaking with this contractor by phone and meeting them in person at the shop.",{class:"note"}));
  const phoneConfirmed=check(c,"I spoke with this contractor by phone."),inPersonConfirmed=check(c,"I met this contractor in person at the shop.");
  button(c,"Approve contractor",async()=>{if(!phoneConfirmed.checked||!inPersonConfirmed.checked)throw Error("Complete both contractor review steps first.");await api("/api/management/approve",{userId:account.id,phoneConfirmed:true,inPersonConfirmed:true});managementView="contractors";await route("management");message("Contractor approved.");});
  button(c,"Not yet — go back",()=>{managementView="contractors";route("management")},true);
}
function bagInventory(data) {
  const c = card(
    "🛍",
    "Bag inventory",
    "Add tagged bags, see who has each bag, and complete exchange requests.",
  );
  managementBack(c);
  const id = field(c, "New bag ID", "text");
  id.placeholder = "bag-002";
  button(c, "Add bag to inventory", async () => {
    await api("/api/management/bags", { action: "add", id: id.value });
    route("management");
  });
  const wrap = node("div", undefined, { class: "table-wrap" }),
    table = node("table"),
    head = node("thead"),
    row = node("tr");
  for (const label of ["Bag", "Status", "Customer", "Action"])
    row.append(node("th", label));
  head.append(row);
  table.append(head);
  const body = node("tbody");
  for (const bag of data.bags || []) {
    const tr = node("tr"),
      customer = (data.users || []).find((u) => u.id === bag.customer_id);
    for (const value of [
      bag.id,
      bag.status || "Active",
      customer?.username || "Available",
    ])
      tr.append(node("td", value));
    const action = node("td");
    if (bag.status !== "retired") {
      const qr = node("a", "Print bag tag", {
        href: "/api/management/bags/" + encodeURIComponent(bag.id) + "/label",
        target: "_blank",
        rel: "noopener",
        class: "button secondary",
      });
      action.append(qr);
    }
    if (bag.exchange_requested_at) {
      const replacements = (data.bags || []).filter(
        (b) => !b.customer_id && b.status !== "retired",
      );
      const replacementPicker = select(
        action,
        "Replacement bag",
        replacements.map((b) => [b.id, b.id]),
      );
      button(
        action,
        "Complete exchange",
        async () => {
          await api("/api/management/bags", {
            action: "exchange",
            oldBagId: bag.id,
            newBagId: replacementPicker.value,
          });
          route("management");
        },
        true,
      );
    } else action.append(node("span", "—"));
    tr.append(action);
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  c.append(wrap);
}
function createPilotLogin(role) {
  main.replaceChildren();
  const c = card(role === "customer" ? "👤" : "🧺", role === "customer" ? "Add customer login" : "Add contractor login", "They must accept every pilot agreement condition on first sign-in.");
  const username = field(c, "Username", "text"), password = field(c, "Temporary password", "password");
  username.placeholder = "example: jordan-test"; password.placeholder = "At least 12 characters";
  button(c, "Create login", async () => {
    const result = await api("/api/management/accounts", { role, username: username.value, temporaryPassword: password.value });
    main.replaceChildren(); const done = card("✓", "Login created", "Give these details to the tester privately. The password is shown once.");
    done.append(node("p", `Username: ${result.user.username}`, { class: "note" }), node("p", `Temporary password: ${password.value}`, { class: "note" }));
    button(done, "Back", () => route("management"));
  });
  button(c, "Cancel", () => route("management"), true);
}
function choice(parent, icon, title, description, fn) {
  const b = button(parent, "", fn, true);
  b.classList.add("choice");
  b.append(
    node("span", icon, { class: "choice-icon", "aria-hidden": "true" }),
    node("strong", title),
    node("small", description),
  );
  return b;
}
function stat(parent, value, label) {
  const c = node("div", undefined, { class: "stat" });
  c.append(node("strong", value), node("span", label));
  parent.append(c);
}
function stepLabel(action) {
  return (
    {
      drop_off: "SHOP VISIT 1 · CUSTOMER DROPOFF",
      accept_job: "BEFORE YOU ACCEPT · CHECK THE DEADLINE",
      record_weight: "SHOP VISIT 1 · BAG + WEIGHT",
      wall_checkout: "SHOP VISIT 1 · STATION CHECKOUT",
      wash_complete: "AWAY FROM SHOP · CLEAN & FOLD",
      return_bag: "SHOP VISIT 2 · SAME BAG",
      wall_checkin: "SHOP VISIT 2 · STATION CHECK-IN",
      staff_release: "PAYMENT VERIFIED · PAID BIN",
      customer_pickup: "PAID & READY · MATCH YOUR BAG",
      rate: "ORDER COMPLETE · THANK YOU",
    }[action] || "YOUR NEXT STEP"
  );
}
function timeline(parent, o) {
  const steps = [
    ["Bag linked", true],
    ["At shop", !!o.dropped_at],
    ["Washing", !!o.checked_out_at],
    ["Returned", !!o.returned_at],
    ["Paid & ready", o.payment_verified && o.ready_for_pickup],
    ["Collected", !!o.picked_up_at],
  ];
  const details = node("details", undefined, { class: "journey" });
  details.append(node("summary", "Your laundry journey"));
  const list = node("ol");
  for (const [label, done] of steps)
    list.append(
      node("li", `${done ? "✓" : "○"} ${label}`, { class: done ? "done" : "" }),
    );
  details.append(list);
  parent.append(details);
}
function weightControl(parent, input) {
  const panel = node("div", undefined, { class: "weight-panel" });
  const slider = field(panel, "Slide to the scale reading", "range", "0");
  slider.min = "0";
  slider.max = "200";
  slider.step = "0.1";
  const out = node("output", "Choose a positive measured weight", {
    class: "weight-output",
    "aria-live": "polite",
  });
  const update = (value) => {
    const n = Number(value);
    out.textContent =
      Number.isFinite(n) && n > 0
        ? `${n.toFixed(1)} lb → ${(Math.ceil((n - 1e-10) * 2) / 2).toFixed(1)} lb billed`
        : "Choose a positive measured weight";
  };
  slider.addEventListener("input", () => {
    input.value = slider.value;
    update(slider.value);
  });
  input.addEventListener("input", () => {
    slider.value = input.value;
    update(input.value);
  });
  const controls = node("div", undefined, { class: "choice-grid" });
  button(
    controls,
    "− 0.1 lb",
    () => {
      input.value = Math.max(0, Number(input.value || 0) - 0.1).toFixed(1);
      slider.value = input.value;
      update(input.value);
    },
    true,
  );
  button(
    controls,
    "+ 0.1 lb",
    () => {
      input.value = Math.min(200, Number(input.value || 0) + 0.1).toFixed(1);
      slider.value = input.value;
      update(input.value);
    },
    true,
  );
  panel.append(controls, out);
  parent.append(panel);
}
async function home() {
  const [{ orders: all = [] }, { dashboard }, {notices=[]}] = await Promise.all([
    api("/api/orders"),
    api("/api/dashboard"),
    api("/api/notices"),
  ]);
  const customer = app === "customer";
  const intro = card(
    customer ? "🌿" : "☀️",
    customer ? "A little less laundry." : "A good day to help.",
    customer
      ? "A simple path from your first bag to fresh, folded laundry."
      : "Your availability, offered work, and accepted jobs in one place.",
  );
  intro.classList.add("welcome-card");
  intro.append(
    node("p", `Signed in as ${user.username || user.id}`, { class: "pill" }),
  );
  for(const notice of notices.filter(item=>item.type==="pricing").slice(0,1)){
    const prices=notice.pricing||{};
    const update=card("🏷",notice.title||"Pricing update",`Effective ${new Date(notice.effective_at).toLocaleDateString()}. Existing booked orders keep their original rates.`);
    update.append(node("p",customer?`Drop-off $${Number(prices.dropoff).toFixed(2)}/lb · Rush +$${Number(prices.rushPerLb).toFixed(2)}/lb`:`Contractor pay $${Number(prices.contractor).toFixed(2)}/approved lb`,{class:"note"}));
  }
  const counts = node("div", undefined, { class: "stat-grid" });
  intro.append(counts);
  stat(
    counts,
    customer ? dashboard.activeOrders : dashboard.activeJobs,
    customer ? "In progress" : "Active jobs",
  );
  stat(
    counts,
    customer
      ? all.filter(
          (o) =>
            o.status === "paid_ready" &&
            o.payment_verified &&
            o.ready_for_pickup,
        ).length
      : dashboard.availableDays,
    customer ? "Ready to collect" : "Available days",
  );
  stat(
    counts,
    customer ? dashboard.bagCount : dashboard.offers,
    customer ? "My bags" : "Available offers",
  );
  const actions = node("div", undefined, { class: "choice-grid" });
  intro.append(actions);
  if (customer) {
    choice(actions, "🛍", "Get your bag", "First bag included", () =>
      route("bags"),
    );
    choice(actions, "🧺", "Book laundry", `Drop off · $${Number(pricingPreview?.dropoff??2.5).toFixed(2)} / lb`, () =>
      route("book"),
    );
    const how = card("✨", "Easy as one, two, three.");
    for (const [n, title, description] of [
      [
        "1",
        "Bring & scan",
        "Claim your bag, book laundry, then scan your bag and the shop station.",
      ],
      [
        "2",
        "We wash & fold",
        "See measured weight and custody updates from the same shared backend.",
      ],
      [
        "3",
        "Pay, then collect",
        "Only your paid-and-ready matching bag can be picked up. Payments are not connected in this trial.",
      ],
    ]) {
      const row = node("div", undefined, { class: "instruction" });
      row.append(node("span", n, { class: "step-number" }));
      const copy = node("div");
      copy.append(
        node("h3", title),
        node("p", description, { class: "muted" }),
      );
      row.append(copy);
      how.append(row);
    }
  } else {
    choice(actions, "📅", "My days", "Set the next two weeks", () =>
      route("availability"),
    );
    choice(actions, "📥", "Offers", "Review available work", () =>
      route("offers"),
    );
    choice(actions, "🧺", "My jobs", "Continue accepted work", () =>
      route("orders"),
    );
    choice(actions, "📖", "Step-by-step guide", "Know what comes next", () =>
      route("guide"),
    );
    choice(actions, "🌱", "My pay", `$${Number(pricingPreview?.contractor??1).toFixed(2)} / approved lb`, () =>
      route("earnings"),
    );
    const next = all.find(
      (o) =>
        o.assigned_contractor_id === user.id &&
        ["accepted", "washing"].includes(o.status),
    );
    contractorReminders(all);
    if (next) {
      const c = card("🧺", "Continue your current job");
      summary(c, next);
      button(c, "Open my jobs", () => route("orders"));
    }
    const c = card(
      "🛡",
      "Work safely, one order at a time.",
      "Keep customers’ items separate. Follow the detergent instructions and care labels. If anything looks unsafe or unclear, stop and contact management.",
    );
    c.append(
      node(
        "p",
        "Identity onboarding and legal agreements stay disabled until approved secure services are connected.",
        { class: "note" },
      ),
    );
  }
  const shop = card("🏪", "At the shop", "307 Locust Street, Sweetwater, TX");
  shop.append(
    node(
      "p",
      "Bring your own bag on your first visit. Transfer laundry into your tagged Cotton Roots bag. Only synthetic test codes are used in this trial.",
      { class: "muted" },
    ),
  );
  button(shop, customer ? "See my laundry" : "Open my jobs", () =>
    route("orders"),
  );
}
function guide(index = 0) {
  main.replaceChildren();
  const steps = [
    [
      "📋",
      "Read the order.",
      "Check the deadline, bag ID and detergent preference. Only accept when your availability and work preference match.",
    ],
    [
      "🧺",
      "Match the bag.",
      "At the shop, scan the assigned bag. Never combine different customers’ laundry.",
    ],
    [
      "⚖️",
      "Weigh before you leave.",
      "Use the measured scale reading. We round up to the next ½ lb. Confirm the weight, then scan the wall station to check out.",
    ],
    [
      "🫧",
      "Wash with care.",
      "Follow garment care labels and product directions. Use shop detergent unless the order specifies the customer’s sealed, labeled detergent. Stop and contact management if instructions are unclear.",
    ],
    [
      "🧴",
      "Keep it simple.",
      "No bleach, scent boosters, softener, or extra products unless specifically authorized. You pay machine fees up front; contractor rate is $1.00 per approved pound.",
    ],
    [
      "✨",
      "Dry, fold, and check.",
      "Use a clean, dry surface. Keep each order separate. Return everything in the same correct, labeled bag. Mark washing complete in My Jobs.",
    ],
    [
      "🏪",
      "Return on your second visit.",
      "Scan the same bag, then the shop station to check in. Returned laundry is not automatically paid or ready for customer pickup.",
    ],
    [
      "🌱",
      "Review your earnings.",
      "Completion creates pending earnings. Verified payment is required before approval. Weekly payouts are one full week in arrears; this trial moves no money.",
    ],
  ];
  const [icon, title, copy] = steps[index];
  const c = card(icon, title, copy);
  c.prepend(
    node("p", `GUIDE · STEP ${index + 1} OF ${steps.length}`, {
      class: "eyebrow",
    }),
  );
  const progress = node("progress", undefined, {
    max: steps.length,
    value: index + 1,
    "aria-label": "Guide progress",
  });
  c.append(progress);
  if (index) button(c, "Previous guide step", () => guide(index - 1), true);
  button(
    c,
    index === steps.length - 1 ? "Back to my jobs" : "Next guide step",
    () => (index === steps.length - 1 ? route("orders") : guide(index + 1)),
  );
  const note = card(
    "⚠️",
    "When in doubt, stop.",
    "Damage, unsafe items, special-care garments, or unclear instructions need management review. Never guess. Home collection is not yet available.",
  );
  note.classList.add("safety-card");
}
try {
  const d = await api("/api/me");
  paymentPreview = d.staging?.payment || null;
  pricingPreview = d.pricing;
  agreementVersion = d.agreement?.version || null;
  if (d.staging?.disposable)
    document.querySelector(".staging").textContent =
      "Private preview · practice data only · no real payments or documents";
  user = d.user;
  csrf = d.csrf;
  await render();
  const checkout = new URLSearchParams(location.search).get("checkout");
  if (checkout) {
    history.replaceState({}, "", location.pathname);
    message(
      checkout === "success"
        ? "Test checkout returned. Waiting for the verified Stripe test webhook."
        : "Test checkout canceled. No payment was recorded.",
      checkout !== "success",
    );
  }
} catch {
  login();
}
