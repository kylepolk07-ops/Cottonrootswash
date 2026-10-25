import { availabilityDays, shopDateKey } from "/web/calendar.mjs";
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
  rewardsPreview,
  agreementVersion,
  managementView = "home",
  managementOrderId = null,
  moneyEditOrderId = null,
  moneyPeriod="this_week",
  moneyStart="",
  moneyEnd="";
const rememberedIdentityKey="crc_remembered_identity";
const customerTerms=[
 ["platform_role","Cotton Roots provides the app and secure drop-off/pickup location and facilitates the transaction. The washing service is performed by an independent washing specialist."],
 ["customer_contractor_service","The service agreement is between me and the washing specialist who accepts the order; optional transportation is part of that accepted service."],
 ["inspect_preexisting_damage","I will inspect every garment before drop-off and disclose existing tears, rips, stains, missing buttons, weak seams, damaged zippers, and other deficiencies."],
 ["laundry_risk","I understand ordinary washing and drying can reveal or worsen hidden wear, shrinkage, color loss, fabric weakness, decorations, or pre-existing damage. Subject to applicable law, Cotton Roots is not responsible for undisclosed pre-existing tears, rips, defects, or special risks. School clothing, uniforms, workwear, and time-sensitive items should not be submitted unless I accept that risk."],
 ["empty_pockets","I will empty pockets and remove money, jewelry, electronics, documents, and other valuables before submitting laundry."],
 ["care_disclosure","I will identify special-care, dry-clean-only, hand-wash-only, delicate, valuable, or irreplaceable items before service and will not place undisclosed unsuitable items in the bag."],
 ["claims_process","I will inspect returned laundry promptly and report missing items, damage, or other deficiencies to Management through the app so the matter can be documented and reviewed."],
 ["legal_draft","I understand these are launch-draft terms pending attorney review and agree to the current terms shown before creating my account."],
];
const contractorTerms=[
 ["platform_role","Cotton Roots provides the app and secure location and facilitates customer connections; the accepted washing service is between me and the customer."],
 ["independent_business","I choose my availability and jobs and am responsible for my independent-business taxes, expenses, methods, and optional transportation commitments."],
 ["custody_care","I will inspect, document, keep separate, and carefully handle every accepted bag and stop for Management review when damage, valuables, unsafe items, or unclear care instructions are found."],
 ["deadline_scans","I will follow every bag scan, custody, deadline, photo, and return step and report any delay or problem promptly."],
 ["smartphone_required","I have a smartphone with a working camera, internet access, and a supported web browser, and I will use it for required bag scans, scale photos, custody confirmations, and job updates."],
 ["legal_draft","I understand these are launch-draft terms pending attorney review and agree to the current terms shown with my application."],
];
window.addEventListener("pagehide", () => stopCamera?.());
function node(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const fromBase64url=value=>Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")),char=>char.charCodeAt(0));
const toBase64url=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const credentialJSON=credential=>({id:credential.id,rawId:toBase64url(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:credential.response.attestationObject?{clientDataJSON:toBase64url(credential.response.clientDataJSON),attestationObject:toBase64url(credential.response.attestationObject),transports:credential.response.getTransports?.()||[]}:{clientDataJSON:toBase64url(credential.response.clientDataJSON),authenticatorData:toBase64url(credential.response.authenticatorData),signature:toBase64url(credential.response.signature),userHandle:credential.response.userHandle?toBase64url(credential.response.userHandle):null}});
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
  delete document.body.dataset.sessionRole;
  reset();
  const c = card(
    "🌿",
    "Welcome back",
    app === "customer"
      ? "Sign in with your saved Customer username and password."
      : "Sign in with your Washing Specialist username and password. Owners use their Management login here.",
  );
  const f = node("form");
  c.append(f);
  let remembered=null;try{remembered=JSON.parse(localStorage.getItem(rememberedIdentityKey)||"null")}catch{}
  if(remembered?.role!==app)remembered=null;
  const username = field(
      f,
      "Username",
      "text",
      remembered?.username||"",
    ),
    password = field(f, "Password", "password");
  username.autocomplete = "username";
  username.autocapitalize = "none";
  username.autocorrect = "off";
  username.spellcheck = false;
  password.autocomplete = "current-password";
  const rememberLogin=check(f,"Keep me signed in on this device",Boolean(remembered));
  f.append(node("p","Your browser may also offer to save your password securely.",{class:"muted"}));
  const submit = node("button", "Sign in", { type: "submit" });
  f.append(submit);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const d = await api("/api/login", {
        username: username.value.trim().toLowerCase(),
        password: password.value,
        remember: rememberLogin.checked,
      });
      user = d.user;
      csrf = d.csrf;
      page = "home";
      const me = await api("/api/me");
      paymentPreview = me.staging?.payment || null;
      pricingPreview = me.pricing;
      rewardsPreview = me.rewards;
      agreementVersion = me.agreement?.version || null;
      user = me.user;
      if(rememberLogin.checked){try{localStorage.setItem(rememberedIdentityKey,JSON.stringify({role:user.role==="customer"?"customer":"contractor",username:user.username}))}catch{}}
      else {try{localStorage.removeItem(rememberedIdentityKey)}catch{}}
      if(me.staging?.synthetic===false)document.querySelector(".staging").textContent="Secure live service · real customer payments enabled";
      else if (me.staging?.disposable)
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
  if(app==="contractor"&&window.PublicKeyCredential){const options=node("details",undefined,{class:"management-signin-options"}),summary=node("summary","Management sign-in options"),panel=node("div");options.append(summary,panel);c.append(options);button(panel,"Use a Management passkey",async()=>{const name=username.value.trim().toLowerCase();if(!name)throw Error("Enter your Management username first.");const request=await api("/api/passkeys/authentication/options",{username:name});request.challenge=fromBase64url(request.challenge);request.allowCredentials=(request.allowCredentials||[]).map(item=>({...item,id:fromBase64url(item.id)}));const credential=await navigator.credentials.get({publicKey:request});if(!credential)throw Error("Passkey sign-in was canceled.");const d=await api("/api/passkeys/authentication/verify",{username:name,credential:credentialJSON(credential)});user=d.user;csrf=d.csrf;page="home";const me=await api("/api/me");paymentPreview=me.staging?.payment||null;pricingPreview=me.pricing;rewardsPreview=me.rewards;agreementVersion=me.agreement?.version||null;user=me.user;await render();message("You are signed in with your passkey.")},true);button(panel,"Set up a Management phone with a code",()=>{const existing=document.querySelector(".phone-setup-card");if(existing){existing.scrollIntoView({behavior:"smooth",block:"start"});existing.querySelector("input")?.focus();return}const setup=card("📱","Set up Management on this phone","On a computer already signed into Management, generate a one-time phone setup code. It expires after 10 minutes. The code identifies the correct Management account automatically.");setup.classList.add("phone-setup-card");const code=field(setup,"6-digit phone setup code","text");code.inputMode="numeric";code.autocomplete="one-time-code";code.maxLength=6;button(setup,"Continue",async()=>{const d=await api("/api/management/phone-setup/login",{code:code.value});user=d.user;csrf=d.csrf;page="home";await render();message("Phone verified. Now tap Add a passkey to this device.")});},true)}
  button(c,app==="customer"?"Create a Customer account":"Apply as a Washing Specialist",app==="customer"?customerRegistration:contractorApplication,true);
  const chooser=node("a","← Choose what you want to do",{href:"/?choose=1",class:"role-continue"});c.append(chooser);
}
function scrollAgreement(parent,{heading,title,items,acceptance,extra=[]}){
 parent.append(node("h3",heading),node("p","Scroll through the complete agreement. The acceptance box unlocks when you reach the bottom.",{class:"note"}));
 const terms=node("div",undefined,{class:"agreement-scroll",tabindex:"0","aria-label":heading});
 const brand=node("div",undefined,{class:"agreement-brand"});brand.append(node("img",undefined,{src:"/web/brand-mark.png",alt:"Cotton Roots & Company logo"}),node("strong","COTTON ROOTS & COMPANY"),node("span","WASH & FOLD"));terms.append(brand,node("h3",title));
 [...items,...extra].forEach((item,index)=>terms.append(node("p",`${index+1}. ${Array.isArray(item)?item[1]:item}`)));
 parent.append(terms);
 const reached=node("p","Scroll to the bottom to continue.",{class:"agreement-progress",role:"status"});parent.append(reached);
 const accepted=check(parent,acceptance);accepted.disabled=true;
 const update=()=>{if(terms.scrollTop+terms.clientHeight>=terms.scrollHeight-8){accepted.disabled=false;reached.textContent="Terms reviewed. You may now accept the agreement.";terms.removeEventListener("scroll",update)}};
 terms.addEventListener("scroll",update,{passive:true});queueMicrotask(update);
 return accepted;
}
const customerAgreement=parent=>scrollAgreement(parent,{heading:"Customer terms and disclosures",title:"Cotton Roots & Company Wash & Fold — Customer Agreement",items:customerTerms,acceptance:"I have reviewed and agree to the complete Customer Terms and Disclosures shown above."});
const contractorAgreement=parent=>scrollAgreement(parent,{heading:"Washing Specialist agreement",title:"Cotton Roots & Company — Independent Washing Specialist Agreement",items:contractorTerms,extra:["I understand this is an application. I cannot accept laundry jobs until required tax, identity, and payout onboarding is complete and Management finishes the phone call and in-person shop meeting."],acceptance:"I have reviewed and agree to the complete Washing Specialist Agreement and application requirements shown above."});
function customerRegistration(){
 reset();const c=card("👤","Create a Customer account","Complete every field and agreement. Customer accounts activate automatically after successful registration.");
 const name=field(c,"Full name","text"),phone=field(c,"Mobile phone","tel"),email=field(c,"Email","email"),address=field(c,"Home or camper service address","text"),referralCode=field(c,"Friend’s referral username (optional)","text"),username=field(c,"Choose a username","text"),password=field(c,"Choose a password","password"),confirmPassword=field(c,"Enter password again","password");
 username.autocapitalize="none";username.autocomplete="username";password.autocomplete="new-password";confirmPassword.autocomplete="new-password";c.append(node("p","Password must be at least 8 characters.",{class:"note"}));const accepted=customerAgreement(c);
 button(c,"Create Customer account",async()=>{if(password.value!==confirmPassword.value)throw Error("Passwords do not match");if(accepted.disabled||!accepted.checked)throw Error("Scroll through and accept the complete Customer Terms and Disclosures before registering.");await api("/api/customer-registrations",{displayName:name.value,phone:phone.value,email:email.value,address:address.value,referralCode:referralCode.value,username:username.value,password:password.value,agreed:true,conditions:customerTerms.map(([id])=>id)});login();message("Customer account created. Sign in with your new username and password.")});button(c,"Back to sign in",login,true);
}
function contractorApplication(){
  reset();
  const c=card("🧺","Apply to be a washing specialist","Create your own login. Management will call you and meet you at the shop before approving work access.");
  const name=field(c,"Full name","text"),phone=field(c,"Phone number","tel"),email=field(c,"Email","email"),username=field(c,"Choose a username","text"),password=field(c,"Choose a password","password"),confirmPassword=field(c,"Enter password again","password");
  username.autocapitalize="none";username.autocomplete="username";password.autocomplete="new-password";confirmPassword.autocomplete="new-password";
  c.append(node("p","A smartphone with a working camera and internet access is required for every Washing Specialist. You will use it to scan bags, photograph scale readings, and complete job steps.",{class:"note"}),node("p","Password must be at least 8 characters. Your application stays pending until Management completes the phone call and in-person shop meeting.",{class:"note"}));
  const accepted=contractorAgreement(c);
  button(c,"Submit Washing Specialist application",async()=>{if(password.value!==confirmPassword.value)throw Error("Passwords do not match");if(accepted.disabled||!accepted.checked)throw Error("Scroll through and accept the complete Washing Specialist Agreement before applying.");await api("/api/contractor-applications",{displayName:name.value,phone:phone.value,email:email.value,username:username.value,password:password.value,agreed:true,conditions:contractorTerms.map(([id])=>id)});login();message("Application submitted. Sign in to complete payout setup and follow your approval status.")});
  button(c,"Back to sign in",login,true);
}
async function render() {
  if (!user) return login();
  document.body.dataset.sessionRole=user.role;
  const correctApp=user.role==="customer"?"customer":["contractor","owner","staff"].includes(user.role)?"contractor":null;
  if(correctApp&&correctApp!==app){try{localStorage.setItem("crc_account_type",correctApp)}catch{}location.replace(`/${correctApp}`);return}
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
          ["bags", "My bags"],
          ["alerts", "Alerts"],
          ["profile", "Profile"],
        ]
      : [
          ["home", "Today"],
          ["alerts", "Alerts"],
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
    alerts: "🔔",
    rewards: "★",
  };
  for (const [k, t] of pages) {
    const tab = button(
      nav,
      t,
      () => {
        if (k === "management") {managementView = "home";managementOrderId=null;moneyEditOrderId=null;}
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
  const identity=node("div",undefined,{class:"signed-in-as"});
  identity.append(node("small","SIGNED IN AS"),node("strong",user.displayName||user.username),node("span",user.role==="contractor"?"Washing Specialist":user.role==="customer"?"Customer":"Management"));
  account.append(identity);
  button(
    account,
    "Sign out",
    async () => {
      await api("/api/logout", {});
      user = null;
      csrf = null;
      delete document.body.dataset.sessionRole;
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
      "Washing Specialist account needed",
      "Sign out and use the Washing Specialist or Management sign-in.",
    );
    return;
  }
  if(app==="contractor"&&user.role==="contractor"&&(!user.approved||paymentPreview?.connect&&!user.payoutOnboardingComplete))return pendingContractor();
  try {
    await (
      {
        home: home,
        guide: guide,
        offers: orders,
        orders: orders,
        book: book,
        bags: bags,
        alerts: actionCenter,
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
async function pendingContractor(){
  reset();nav.hidden=true;document.querySelector("footer").hidden=true;
  const onboarding=await api("/api/contractor-onboarding"),needsPayout=!onboarding.status.complete;
  const alert=card("🔔","Required before you can work",needsPayout?"Complete your W-9, identity verification, and bank payout connection. Management cannot approve the application until Stripe verifies these items.":"Your secure documents are complete. Management must finish the phone call and in-person meeting before approving your application.");
  const c=card(needsPayout?"💳":"⏳",needsPayout?"Complete your payout setup":"Application pending",needsPayout?"Stripe securely collects your tax information, verifies your identity, and connects your bank account. Cotton Roots does not receive your Social Security number, ID image, or bank account number.":"Your login works. Management must speak with you by phone and meet you at the shop before you can view or accept laundry jobs.");
  const name=field(c,"Full name","text",user.displayName||""),phone=field(c,"Phone number","tel",user.phone||""),email=field(c,"Email","email",user.email||"");
  button(c,"Save contact information",async()=>{const result=await api("/api/profile",{displayName:name.value,phone:phone.value,email:email.value});user=result.user;message("Contact information saved.")},true);
  if(needsPayout){const steps=node("div",undefined,{class:"bag-card"});steps.append(node("strong","Required before approval"),node("p","1. W-9 tax information\n2. Government ID verification\n3. Bank account for secure payouts",{class:"muted"}));c.append(steps);if(onboarding.enabled){button(c,onboarding.status.started?"Continue secure Stripe setup":"Start secure Stripe setup",async()=>{const result=await api("/api/contractor-onboarding/start",{});window.location.assign(result.onboardingUrl)});button(c,"I finished Stripe setup — refresh status",async()=>{await route("home")},true)}else c.append(node("p","Secure document setup is being activated by Management. You will see the setup button here as soon as it is available.",{class:"confirm-warning"}))}
  if(!user.approved)c.append(node("p","Management must also complete your phone call and in-person shop meeting before work access is approved.",{class:"note"}));
}
function agreement() {
  reset();
  nav.hidden = true;
  const customer = user.role === "customer";
  const c = card(
    "📜",
    customer ? "Customer agreement" : "Washing Specialist agreement",
    "Scroll through the complete agreement, then use the one acceptance box at the bottom.",
  );
  const terms=customer?customerTerms:contractorTerms,accepted=customer?customerAgreement(c):contractorAgreement(c);
  button(c, "Agree and continue", async () => {
    if (accepted.disabled || !accepted.checked)
      throw Error("Scroll through the complete agreement and check the one acceptance box before continuing.");
    const result = await api("/api/agreements/accept", {
      version: agreementVersion,
      accepted: true,
      conditions: terms.map(([id])=>id),
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
  const deliveryStatus=o.service==="full_service"?{offered:"Waiting for a Washing Specialist",accepted:"Pickup accepted",washing:"Picked up · being washed",payment_pending:"Delivered · payment pending",paid_ready:"Paid · confirm delivery",picked_up:"Delivery confirmed"}[o.status]:null;
  c.append(
    node("span", deliveryStatus||statusLabels[o.status] || "Status update", { class: "pill" }),
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
    const amount = node("p", `${o.payment_verified?"Laundry subtotal":"Current laundry total"}: $${Number(o.total).toFixed(2)}`, {
      class: "price",
    });
    c.append(amount);
    if(o.payment_verified&&Number.isSafeInteger(o.sales_tax_cents)&&Number.isSafeInteger(o.payment_total_cents))c.append(node("p",`Sales tax: $${(o.sales_tax_cents/100).toFixed(2)} · Paid total: $${(o.payment_total_cents/100).toFixed(2)}`,{class:"note"}));
  }
  if (o.detergent)
    c.append(
      node(
        "p",
        `Detergent: ${{ standard: "Shop standard", own: "Customer’s sealed, labeled detergent", contact: "Contact the shop before washing" }[o.detergent] || o.detergent}`,
        { class: "muted" },
      ),
    );
  if(o.laundry_notes)c.append(node("p",`Customer care instructions: ${o.laundry_notes}`,{class:"care-instructions"}));
  if(o.service==="full_service"){
    c.append(node("p",`Delivery: ${Number(o.delivery_miles||0).toFixed(1)} round-trip miles · $${Number(o.delivery_fee||0).toFixed(2)} distance fee`,{class:"note"}));
    if(o.pickup_address)c.append(node("p",`Pickup: ${o.pickup_address}\nReturn: ${o.return_address}`,{class:"muted"}));
    if(o.delivery_instructions)c.append(node("p",`Customer delivery note: ${o.delivery_instructions}`,{class:"note"}));
    if(o.delivery_photo_at){const proof=node("a","View delivery photo",{href:`/api/orders/${encodeURIComponent(o.id)}/delivery-proof`,target:"_blank",rel:"noopener",class:"role-continue"});c.append(node("p",`Delivery photo taken ${new Date(o.delivery_photo_at).toLocaleString()}`,{class:"muted"}),proof)}
  }
  if (o.rush_requested)
    c.append(
      node(
        "p",
        o.rush_approved
          ? "Rush order · Washing Specialist earns an extra $0.75/lb"
          : "Rush requested",
        { class: "pill" },
      ),
    );
  if (o.due_note) c.append(node("p", o.due_note, { class: "muted" }));
}
async function customerAlerts(){
 const response=await api("/api/orders"),events=[];
 const add=(order,at,title,text)=>{if(at)events.push({order,at,title,text})};
 for(const order of response.orders){
  add(order,order.picked_up_at,"Laundry collected",`Bag ${order.bag_id} was collected. This order is complete.`);
  add(order,order.paid_at,"Payment confirmed",order.service==="full_service"?`Payment for bag ${order.bag_id} is confirmed. Confirm receipt in My laundry.`:`Bag ${order.bag_id} is paid and ready for pickup at Cotton Roots & Company.`);
  add(order,order.returned_at||order.delivered_at,"Laundry returned",order.service==="full_service"?`Bag ${order.bag_id} was delivered. Payment is ready in My laundry.`:`Bag ${order.bag_id} was returned to the shop. Payment is ready in My laundry.`);
  add(order,order.wash_completed_at,"Washing completed",`Bag ${order.bag_id} is clean and folded. It is being returned next.`);
  add(order,order.checked_out_at,"Picked up for washing",`Bag ${order.bag_id} was checked out to your washing specialist.`);
  add(order,order.dropped_at,"Checked in at the shop",`Bag ${order.bag_id} was confirmed at Cotton Roots & Company.`);
 }
 events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const c=card("🔔","Notifications","Status changes appear here whenever you open or refresh the app.");
 button(c,"Refresh notifications",()=>route("alerts"),true);
 if(!events.length)c.append(node("p","No laundry notifications yet.",{class:"muted"}));
 for(const event of events){const id=`customer:${event.order.id}:${event.title}:${event.at}`,seen=user.notificationAcks?.includes(id),item=node("article",undefined,{class:"notification-item"});item.append(node("strong",event.title),node("p",event.text),node("small",`${new Date(event.at).toLocaleString()} · Order ${event.order.id}`));if(seen)item.append(node("span","Acknowledged",{class:"pill"}));else button(item,"I acknowledge this update",async()=>{await api("/api/notifications/ack",{id});const me=await api("/api/me");user=me.user;await route("alerts");message("Update acknowledged.")},true);c.append(item)}
 const push=card("📲","Phone alerts","This installable web app can support phone push notifications without an App Store app. Background push setup and customer permission will be added with the notification service; for now, alerts update inside Cotton Roots when it opens.");
 push.append(node("p","Text messages can remain the backup notification method after registration is approved.",{class:"note"}));
}
async function actionCenter(){
 if(user.role==="customer"){
  const me=await api("/api/me");user=me.user;
  if(!user.paymentMethodReady){const required=card("🔔","Action required: verify payment","A valid payment method must be securely verified before you can place a laundry order.");button(required,"Set up payment with Stripe",async()=>{const result=await api("/api/payment-profile/setup",{});window.location.assign(result.setupUrl)});}
  return customerAlerts();
 }
 const [{orders=[]},onboarding]=await Promise.all([api("/api/orders"),api("/api/contractor-onboarding")]);
 const c=card("🔔","Action Center","Required items and laundry deadlines appear here. Open each item and acknowledge that you have seen it.");
 if(onboarding.enabled&&!onboarding.status.complete){const item=node("div",undefined,{class:"notification-item"});item.append(node("strong","Required: tax, identity, and payout setup"),node("p","Complete your W-9, government identity check, and bank connection. You cannot be approved or accept work until Stripe verifies everything."));c.append(item);button(item,onboarding.status.started?"Continue secure setup":"Start secure setup",async()=>{const result=await api("/api/contractor-onboarding/start",{});window.location.assign(result.onboardingUrl)})}
 const active=orders.filter(order=>order.assigned_contractor_id===user.id&&!['picked_up','cancelled'].includes(order.status));
 for(const order of active){const id=`job:${order.id}:${order.status}:${order.due_at||''}`,seen=user.notificationAcks?.includes(id),item=node("div",undefined,{class:"notification-item"});item.append(node("strong",order.deadline_alert?.state==="overdue"?"Laundry is overdue":"Laundry job needs attention"),node("p",`Bag ${order.bag_id||"pending"} · ${statusLabels[order.status]||order.status}${order.due_at?` · due ${new Date(order.due_at).toLocaleString()}`:""}`));if(seen)item.append(node("span","Acknowledged",{class:"pill"}));else button(item,"I acknowledge this update",async()=>{await api("/api/notifications/ack",{id});const me=await api("/api/me");user=me.user;await route("alerts");message("Update acknowledged.")},true);c.append(item)}
 if(!active.length&&(!onboarding.enabled||onboarding.status.complete))c.append(node("p","You have no required actions right now.",{class:"muted"}));
 button(c,"Refresh Action Center",()=>route("alerts"),true);
}
async function customerRewards(){
 const me=await api("/api/me");rewardsPreview=me.rewards;
 const c=card("★","Cotton Roots Rewards","Earn rewards while using the service and when friends become paying customers.");
 const stats=node("div",undefined,{class:"stat-grid"});stat(stats,rewardsPreview?.points||0,"points");stat(stats,`$${Number(rewardsPreview?.creditDollars||0).toFixed(0)}`,"earned credit");stat(stats,rewardsPreview?.pointsToNextCredit||250,"points to next $5");c.append(stats,node("p",rewardsPreview?.program||"Rewards will appear after verified payments.",{class:"note"}));
 const code=field(c,"Your referral username","text",rewardsPreview?.referralCode||user.username);code.readOnly=true;code.addEventListener("focus",()=>code.select());
 button(c,"Copy referral username",async()=>{await navigator.clipboard.writeText(code.value);message("Referral username copied.")},true);
 c.append(node("p","Reward credit will be available for eligible future checkout after the live payment redemption step is enabled. Points have no cash value and are tied to this account.",{class:"muted"}));
}
async function registerManagementPasskey(){
 if(!window.PublicKeyCredential)throw Error("This browser does not support passkeys.");const options=await api("/api/passkeys/registration/options",{});options.challenge=fromBase64url(options.challenge);options.user={...options.user,id:fromBase64url(options.user.id)};options.excludeCredentials=(options.excludeCredentials||[]).map(item=>({...item,id:fromBase64url(item.id)}));const credential=await navigator.credentials.create({publicKey:options});if(!credential)throw Error("Passkey setup was canceled.");await api("/api/passkeys/registration/verify",{credential:credentialJSON(credential)});message("Passkey added. You can now use Face ID, fingerprint, Windows Hello, or your device PIN to sign in.");
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
function addStripeCheckout(card, o) {
  const testing=paymentPreview?.mode==="test",pricing=testing?testPaymentPricing(o.total):null;
  card.append(node("p",testing&&pricing?`TEST MODE ESTIMATE · Laundry $${(pricing.base / 100).toFixed(2)} + estimated online payment cost $${(pricing.fee / 100).toFixed(2)} = $${(pricing.testTotal / 100).toFixed(2)} before tax. Stripe calculates applicable sales tax from the billing address at checkout.`:`Secure Stripe checkout · $${Number(o.total).toFixed(2)} before applicable sales tax. Card and Link details stay with Stripe.`,{class:"note"}));
  button(card, "Pay securely with card or Link", async () => {
    const result = await api("/api/payments/checkout", { orderId: o.id });
    if (testing&&result.pricing?.estimateOnly !== true)throw Error("Test payment estimate missing.");
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
  const intro=card(
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
  if(app==="customer")button(intro,"Create a new laundry order",()=>route("book"));
  if(app==="contractor"&&page!=="offers")contractorReminders(orders);
  const filterBox = node("div", undefined, { class: "filter" });
  main.append(filterBox);
  const updated=node("p",`Updated ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`,{class:"muted"});
  filterBox.append(updated);
  const historyMode=app!=="contractor"||page!=="offers";
  const filter = select(filterBox,"Laundry status",page==="offers"?[["all","All available offers"]]:[["active",app==="customer"?"Active laundry":"Active jobs"],["complete",app==="customer"?"Older laundry":"Older jobs"]]);
  if(historyMode)filter.value="active";
  const showing=node("p",undefined,{class:"note"});
  filterBox.append(showing);
  button(filterBox,"Refresh status",()=>route(page),true);
  if(historyMode)button(filterBox,app==="customer"?"View older laundry":"View older jobs",()=>{filter.value=filter.value==="active"?"complete":"active";applyFilter();},true);
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
  function applyFilter() {
    let visibleCount=0;
    for (const [c, o] of orderCards) {
      const key = filter.value;
      c.hidden = !(
        key === "all" ||
        (key === "offers" && ["at_shop", "offered"].includes(o.status)) ||
        (key === "active" &&
          !["picked_up", "cancelled"].includes(o.status) &&
          (app === "customer" || o.assigned_contractor_id === user.id)) ||
        (key === "ready" &&
          o.status === "paid_ready" &&
          o.payment_verified &&
          o.ready_for_pickup) ||
        (key === "complete" &&
          (app === "customer" ? o.status === "picked_up" : !!o.returned_at))
      );
      if(!c.hidden)visibleCount++;
    }
    showing.textContent=`Showing: ${filter.selectedOptions[0]?.textContent||"All"} · ${visibleCount} order${visibleCount===1?"":"s"}`;
  }
  filter.addEventListener("change",applyFilter);
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
      if(o.service==="full_service"&&o.status==="offered")c.append(node("p","Your delivery request is available to approved Washing Specialists. We will update this screen when one accepts it.",{class:"note"}));
      if (o.status === "paid_ready" && o.payment_verified && o.ready_for_pickup)
        c.append(node("p",o.service==="full_service"?"Your delivered laundry is paid. Scan the QR on the bag to confirm that you received the correct order.":"Your laundry is paid and ready. Pick it up at the shop, then scan the QR on your bag to complete pickup.",{class:"note"}));
      if (o.status === "paid_ready" && o.payment_verified && o.ready_for_pickup)
        button(c, o.service==="full_service"?"Scan bag and confirm delivery":"Scan bag and collect", () => actionWizard(o, "customer_pickup"));
      if (o.status === "picked_up" && !o.rating)
        button(c, "Leave a rating", () => actionWizard(o, "rate"));
      if (
        o.status === "payment_pending" &&
        paymentPreview?.provider === "stripe"
      )
        addStripeCheckout(c, o);
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
          o.billed_pounds ? (o.service==="full_service"?"Confirm customer pickup":"Scan station & check out") : (o.service==="full_service"?"Scan bag & weigh at pickup":"Scan bag & weigh"),
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
            return_bag: o.service==="full_service"?"Scan bag at customer return":"Scan bag on return",
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
  applyFilter();
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
    customer_pickup: ["🛍", o.service==="full_service"?"Confirm your delivery":"Collect your bag"],
    record_weight: ["⚖", "Record measured weight"],
    wall_checkout: [o.service==="full_service"?"🚗":"🏪", o.service==="full_service"?"Confirm customer pickup":"Check out at shop"],
    wash_complete: ["✨", "Finished washing?"],
    return_bag: ["🧺", o.service==="full_service"?"Return laundry to customer":"Return the same bag"],
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
    customer_pickup: o.service==="full_service"?"Delivery confirmed. Enjoy your fresh laundry!":"Pickup complete. Enjoy your fresh laundry!",
    record_weight: "Weight saved. Next, scan the shop station to check out.",
    wall_checkout:
      "Checked out. Wash, dry, and fold this order, then return to My jobs.",
    wash_complete:
      "Laundry marked clean. Next, bring back and scan the same bag.",
    return_bag: o.service==="full_service"?"Delivery completed. The bag scan and delivery photo were saved.":"Bag scan saved. Next, scan the shop station to check in.",
    wall_checkin:
      "Return complete. Earnings stay pending until customer payment is verified.",
    accept_job: "Offer accepted. Open My jobs when you are ready to begin.",
    staff_release: "Bag moved to the paid pickup bin.",
    rate: "Thank you for your feedback.",
  };
  async function submit() {
    await api(`/api/orders/${encodeURIComponent(o.id)}/actions`, body);
    if(action==="staff_release"&&["owner","staff"].includes(user.role)){managementView="orders";await route("management")}else await route("orders");
    message(success[action] || "Done. Your next step is shown below.");
  }
  function clear() {
    stopCamera?.();
    stage.replaceChildren();
  }
  function custodyConfirmation(next){
    clear();
    const meta={
      drop_off:{heading:"DIRTY LAUNDRY · SHOP DROP-OFF",action:"I am dropping off this dirty bag at Cotton Roots & Company",condition:"DIRTY — ready for washing"},
      record_weight:{heading:"DIRTY LAUNDRY · CONTRACTOR PICKUP",action:"I am picking up this dirty bag from Cotton Roots & Company",condition:"DIRTY — leaving the shop for washing"},
      wall_checkout:{heading:"DIRTY LAUNDRY · CUSTOMER PICKUP",action:"I am picking up this dirty bag from the customer",condition:"DIRTY — Washing Specialist taking custody"},
      return_bag:{heading:"CLEAN LAUNDRY · RETURN",action:o.service==="full_service"?"I am delivering this clean bag to the customer":"I am dropping off this clean bag at Cotton Roots & Company",condition:"CLEAN — washed, dried, and folded"},
      customer_pickup:{heading:"CLEAN LAUNDRY · CUSTOMER PICKUP",action:o.service==="full_service"?"I am confirming delivery of this clean bag":"I am picking up this clean bag from Cotton Roots & Company",condition:"CLEAN — correct customer pickup"},
      staff_release:{heading:"CLEAN LAUNDRY · PAID PICKUP AREA",action:"I am moving this clean, paid bag to the pickup area",condition:"CLEAN — payment verified"},
    }[action];
    if(!meta)return next();
    const warning=node("section",undefined,{class:"custody-confirmation"});
    warning.append(node("p",meta.heading,{class:"eyebrow"}),node("h2",`Verify ${String(o.bag_id||"bag").toUpperCase()}`));
    const details=node("dl");for(const [label,value] of [["Bag",String(o.bag_id||"Not assigned").toUpperCase()],["Customer",o.customer_name||user.displayName||user.username],["Condition",meta.condition],["Location",o.service==="full_service"&&["wall_checkout","return_bag","customer_pickup"].includes(action)?"Customer address":"Cotton Roots & Company location"]])details.append(node("dt",label),node("dd",value));warning.append(details,node("p","Stop if the bag number, customer, condition, or action does not match what is in front of you.",{class:"confirm-warning"}));stage.append(warning);
    const confirmButton=button(stage,`VERIFY: ${meta.action}`,next);confirmButton.classList.add("custody-confirm");
    button(stage,"Cancel and scan again",bag,true);
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
        "Place the full laundry bag on the scale, then take one clear photo showing the bag and the complete scale reading. The app will read the weight for you.",
        { class: "note" },
      ),
    );
    const photoLabel=node("label","Take scale photo"),photo=node("input",undefined,{type:"file",accept:"image/*",capture:"environment"}),reading=node("p","No photo taken yet.",{class:"weight-output",role:"status"});photoLabel.append(photo);stage.append(photoLabel,node("p","Move close enough that the scale number is sharp, fully visible, and free of glare.",{class:"muted"}),reading);
    let photoData="",detectedWeight=null;
    photo.addEventListener("change",async()=>{const file=photo.files?.[0];if(!file)return;reading.textContent="Reading the scale photo…";detectedWeight=null;try{photoData=await prepareDeliveryPhoto(file);const result=await api("/api/weights/read",{photo:photoData});detectedWeight=Number(result.measuredPounds);reading.textContent=`Detected weight: ${detectedWeight.toFixed(1)} lb`;message("Check that the detected number matches the scale photo, then confirm.")}catch(error){photo.value="";photoData="";reading.textContent="The number was not clear enough. Retake the photo.";message(error.message,true)}});
    stage.append(
      node(
        "p",
        "Check the detected number before confirming. Billing rounds it upward to the next half-pound.",
        { class: "muted" },
      ),
    );
    button(stage, "Confirm this step", async () => {
      if(!photoData||!Number.isFinite(detectedWeight))throw Error("Take a clear scale photo and wait for the app to read it first.");
      body.measuredPounds = detectedWeight;
      body.weightPhoto=photoData;
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
          ? o.service==="full_service"?"Scan the QR on the bag delivered to you. This confirms you received the correct paid order.":"Match this order to the bag in front of you. Only your paid-and-ready bag can be collected."
          : action==="wall_checkout"&&o.service==="full_service"?"At the customer pickup, scan the matching bag again to confirm custody before leaving.":action==="return_bag"&&o.service==="full_service"?"At the return address, scan the matching bag to confirm delivery.":"First, scan the matching bag. Manual entry is available if your camera cannot scan.",
        { class: "note" },
      ),
    );
    const token = await scanField(stage, "Scan the matching bag QR");
    let deliveryPhoto;
    if(action==="return_bag"&&o.service==="full_service"){
      const label=node("label","Take a photo showing where the bag was left"),input=node("input",undefined,{type:"file",accept:"image/jpeg,image/png",capture:"environment"});label.append(input);stage.append(label,node("p",`Follow the customer note: ${o.delivery_instructions||"Hand directly to the customer if available."}`,{class:"note"}));deliveryPhoto=input;
    }
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
        if(deliveryPhoto){const file=deliveryPhoto.files?.[0];if(!file)throw Error("Take a delivery photo first.");body.deliveryPhoto=await prepareDeliveryPhoto(file)}
        custodyConfirmation(action === "drop_off"?station:action === "record_weight"?weigh:submit);
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
      ...(action==="wall_checkout"&&o.service==="full_service"?["wall_checkout"]:[]),
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
    const ack = check(stage, o.rush_requested?"I accept this rush job and can meet its deadline.":"I can meet this deadline.");
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
        o.service==="full_service"?"Confirm the laundry is washed, dried, and folded. Next, return it to the customer and scan the same bag.":"Confirm the laundry is washed, dried, folded, and ready to bring back. This does not check it in at the shop.",
        { class: "note" },
      ),
    );
    button(stage, "Confirm this step", submit);
  }
  button(c, "Back to laundry", () => route("orders"), true);
}
async function prepareDeliveryPhoto(file){
  if(!file.type.startsWith("image/")||file.size>12000000)throw Error("Choose a photo smaller than 12 MB.");
  const image=await createImageBitmap(file),scale=Math.min(1,1280/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);image.close();
  return canvas.toDataURL("image/jpeg",.72);
}
async function book() {
  if(!user.paymentMethodReady){const required=card("🔔","Verify payment before ordering","Cotton Roots requires a verified payment method before a new laundry order can be placed.");button(required,"Set up payment with Stripe",async()=>{const result=await api("/api/payment-profile/setup",{});window.location.assign(result.setupUrl)});button(required,"Go to Action Center",()=>route("alerts"),true);return}
  const prices=pricingPreview||{dropoff:2.5,full_service:3,rushPerLb:1};
  const c = card(
    "🧺",
    "Let’s book your laundry",
    "Choose one service. Final weight is measured at the shop.",
  );
  c.prepend(node("p", "STEP 1 OF 3 · SERVICE", { class: "eyebrow" }));
  let service = "dropoff";
  const choices = node("div", undefined, { class: "choice-grid" });
  c.append(choices);
  const drop = choice(
    choices,
    "🧺",
    "Drop off",
    `$${Number(prices.dropoff).toFixed(2)} / lb · bring it to the shop`,
    () => {service="dropoff";drop.setAttribute("aria-pressed","true");full.setAttribute("aria-pressed","false")},
  );
  drop.setAttribute("aria-pressed", "true");
  const full = choice(
    choices,
    "🚗",
    "Pickup & return",
    `$${Number(prices.full_service).toFixed(2)} / lb · first 5 miles free`,
    () => {service="full_service";full.setAttribute("aria-pressed","true");drop.setAttribute("aria-pressed","false")},
  );
  full.setAttribute("aria-pressed","false");
  c.append(node("p","Delivery distance includes the trip from 307 Locust Street to the customer and back to the shop. The first 5 round-trip miles are free; each additional mile is $1.",{class:"note"}));
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
    if(service==="full_service"){
      if(!user.address){d.append(node("p","Add your home or camper address in My profile before booking pickup and return.",{class:"note"}));button(d,"Add my address",()=>route("profile"),true)}
      else d.append(node("p",`Pickup and return address: ${user.address}\nLeave it here: ${user.deliveryInstructions||"Hand directly to me if available."}\nWe calculate the round trip from 307 Locust Street automatically.`,{class:"note"}));
    }
    const notesLabel=node("label","Special laundry instructions"),laundryNotes=node("textarea");laundryNotes.maxLength=500;laundryNotes.rows=4;laundryNotes.placeholder="Examples: cold water, fragrance-free, hang these shirts, keep this item separate, or contact me before washing.";notesLabel.append(laundryNotes);d.append(notesLabel,node("p","These instructions stay with this order and are shown to the assigned washing specialist.",{class:"muted"}));
    const rush = check(d, "Rush service");
    button(d, "Next: review order", () => {
      if(service==="full_service"&&!user.address)throw Error("Add your home or camper address in My profile first.");
      main.replaceChildren();
      const review = card(
        "🌿",
        "Ready to book?",
        `${service==="full_service"?"Pickup & return":"Drop off"} · $${Number(prices[service]).toFixed(2)} / lb. ${detergent.selectedOptions[0].textContent}. ${rush.checked ? `Rush service adds $${Number(prices.rushPerLb).toFixed(2)}/lb.` : "Standard service."}`,
      );
      review.prepend(node("p", "STEP 3 OF 3 · REVIEW", { class: "eyebrow" }));
      if(laundryNotes.value.trim())review.append(node("p",`Special instructions: ${laundryNotes.value.trim()}`,{class:"care-instructions"}));
      review.append(
        node(
          "p",
          `We round the measured weight up to the next ½ lb.${service==="full_service"?` We calculate the full trip from the shop to ${user.address} and back. The first 5 round-trip miles are free, then $1 per mile.`:""} No payment is taken here.`,
          { class: "note" },
        ),
      );
      button(review, "Book this order", async () => {
        const booked=await api("/api/orders", {
          service,
          detergent: detergent.value,
          laundryNotes: laundryNotes.value,
          rush_requested: rush.checked,
        });
        await route("orders");
        message(
          service==="full_service"?`Delivery order booked. Round-trip distance: ${Number(booked.order.delivery_miles).toFixed(1)} miles. Approved Washing Specialists can now review it.`:"Order booked. Next, bring your bag to the shop and choose Drop off this bag.",
        );
      });
      button(review, "Start again", () => route("book"), true);
    });
    button(d, "Back", () => route("book"), true);
  });
}
async function profile() {
  const me=await api("/api/me");user=me.user;
  const complete=Boolean(user.displayName&&user.phone?.length>=7&&user.email&&(user.role!=="customer"||user.address));
  const showEditor=()=>{
    reset();const c=card("✎","Edit my information","Keep this current so Cotton Roots can contact you about your laundry.");
    const name=field(c,"Name","text",user.displayName||""),phone=field(c,"Phone","tel",user.phone||""),email=field(c,"Email","email",user.email||""),address=user.role==="customer"?field(c,"Home or camper address","text",user.address||""):null,instructions=user.role==="customer"?field(c,"Where should deliveries be left?","text",user.deliveryInstructions||""):null;
    let smsConsent=null;if(user.role==="customer"){const consentLabel=node("label"),consentText=node("span","Text me necessary order-status updates. Message and data rates may apply. Reply STOP to opt out." );smsConsent=node("input");smsConsent.type="checkbox";smsConsent.checked=user.smsConsent===true;consentLabel.append(smsConsent,consentText);c.append(consentLabel)}
    if(address)address.autocomplete="street-address";
    button(c,"Save and review",async()=>{const result=await api("/api/profile",{displayName:name.value,phone:phone.value,email:email.value,...(address?{address:address.value,deliveryInstructions:instructions.value,smsConsent:smsConsent.checked}:{})});user=result.user;await route("profile");message("Information saved. Review it and verify that it is correct.")});
    if(complete)button(c,"Cancel",()=>route("profile"),true);
  };
  if(!complete)return showEditor();
  const c=card("👤","My account",user.profileVerifiedAt?"Your contact information is complete and verified by you.":"Review everything below, then verify that it is correct.");
  c.append(node("span",user.profileVerifiedAt?"✓ Verified":"Needs verification",{class:"pill"}));
  const details=node("dl");for(const [label,value] of [["Username",user.username],["Account type",user.role==="customer"?"Customer":"Washing Specialist"],["Name",user.displayName],["Phone",user.phone],["Email",user.email],...(user.role==="customer"?[["Text updates",user.smsConsent?"On":"Off"],["Pickup & return address",user.address],["Delivery note",user.deliveryInstructions||"Hand directly to me if available."]]:[])])details.append(node("dt",label),node("dd",value));c.append(details);
  if(user.profileVerifiedAt)c.append(node("p",`Verified ${new Date(user.profileVerifiedAt).toLocaleString()}`,{class:"note"}));
  else button(c,"Verify my information",async()=>{const result=await api("/api/profile",{action:"verify"});user=result.user;await route("profile");message("Your information is verified.")});
  button(c,"Edit information",showEditor,true);
  c.append(node("p","Payment cards are handled securely by Stripe and are never displayed or stored in this profile.",{class:"muted"}));
  if(user.role==="customer")await customerRewards();
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
    `Washing Specialist rate: $${Number(pricingPreview?.contractor??1).toFixed(2)} per pound for newly booked jobs. Pickup-and-return jobs add $0.25 per pound. Rush jobs add $0.75 per pound. Owner mileage or other adjustments appear below.`,
  );
  const totals = node("div", undefined, { class: "stat-grid" });
  main.append(totals);
  for (const [status,label] of [["waiting_for_customer_payment","Waiting payment"],["clearing","24-hour clearing"],["ready","Ready for payout"],["paid","Paid"]])
    stat(
      totals,
      `$${earnings
        .filter((e) => e.status === status)
        .reduce((n, e) => n + Number(e.amount || 0), 0)
        .toFixed(2)}`,
      label,
    );
  if (!earnings.length)
    card(
      "🧾",
      "No earnings yet",
      "Completed work is pending until payment is verified. Payouts follow a full week in arrears.",
    );
  for (const e of earnings) {
    const c = card("🧾", e.order_id || "Earnings",e.service==="full_service"?"Pickup & return":"Drop off");
    c.append(node("p",`${Number(e.pounds).toFixed(1)} lb × $${Number(e.rate).toFixed(2)} = $${Number(e.base_pay).toFixed(2)}`,{class:"muted"}));
    if(e.delivery_bonus)c.append(node("p",`Delivery bonus: $${Number(e.delivery_bonus).toFixed(2)} ($0.25 per lb)`,{class:"note"}));
    if(e.rush_bonus)c.append(node("p",`Rush bonus: $${Number(e.rush_bonus).toFixed(2)} ($0.75 per lb)`,{class:"note"}));
    for(const item of e.adjustment_details||[])c.append(node("p",`${item.reason}: ${Number(item.amount)<0?"−":"+"}$${Math.abs(Number(item.amount)).toFixed(2)}`,{class:"muted"}));
    c.append(node("p",`Total Washing Specialist pay: $${Number(e.amount).toFixed(2)}`,{class:"price"}),node("span",{waiting_for_customer_payment:"Waiting for customer payment",clearing:"24-hour clearing",ready:"Ready for payout",paid:"Paid"}[e.status]||e.status,{class:"pill"}));
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
      ["contractor", "Washing Specialist"],
    ]);
    const username = field(create, "Username", "text");
    username.placeholder = "example: jordan-test";
    username.autocapitalize = "none";
    const password = field(create, "Temporary password", "password");
    password.placeholder = "At least 8 characters";
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
        `Give this to ${result.user.username} privately. They sign in through the ${result.user.role === "customer" ? "Customer" : "Washing Specialist"} area.`,
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
          "This password is shown once. Washing Specialists still need Management approval before accepting jobs.",
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
  if (managementView === "notifications") return managementNotifications(data);
  if (managementView === "pricing") return managementPricing(data);
  const c = card(
    "⚙️",
    "Management",
    "Choose one area. Customers, Washing Specialists, bags, and money each have their own workspace.",
  );
  const stats = node("div", undefined, { class: "stat-grid" });
  c.append(stats);
  stat(stats, (data.users || []).filter((u) => u.role === "customer").length, "Customers");
  stat(stats, (data.users || []).filter((u) => u.role === "contractor").length, "Washing Specialists");
  stat(stats, (data.bags || []).filter((b) => b.exchange_requested_at).length, "Bag exchanges");
  stat(stats, (data.orders || []).filter((o) => o.status === "paid_ready" && o.payment_verified && o.ready_for_pickup).length, "Ready for pickup");
  stat(stats, (data.orders || []).filter((o) => o.deadline_alert).length, "Late alerts");
  stat(stats, (data.complaints || []).filter((item) => item.status === "open").length, "Open complaints");
  if(window.PublicKeyCredential){const security=card("🔐","Fast Management sign-in","Each phone or computer needs its own passkey. Add one to use Face ID, fingerprint, Windows Hello, or your device PIN.");button(security,"Add a passkey to this device",registerManagementPasskey);button(security,"Generate a code to set up my phone",async()=>{const result=await api("/api/management/phone-setup/code",{});security.querySelector(".phone-setup-output")?.remove();const output=node("div",undefined,{class:"phone-setup-output"}),shown=field(output,"One-time phone setup code","text",result.code);shown.readOnly=true;shown.className="setup-code";shown.addEventListener("focus",()=>shown.select());output.append(node("p","Enter this code on your phone within 10 minutes. It works once. Generating another code replaces this one.",{class:"note"}));security.append(output);},true)}
  const choices = node("div", undefined, { class: "choice-grid" });
  c.append(choices);
  for (const [key, icon, title, description] of [
    ["customers", "👤", "Customers", "Accounts, contact details, and assigned bags"],
    ["contractors", "🧺", "Washing Specialist applications", "Review applicants, approvals, access, availability, and jobs"],
    ["bags", "🛍", "Bag inventory", "Available, assigned, exchange, and retired bags"],
    ["money", "💵", "Money", "Payment status and Washing Specialist amounts due"],
    ["orders", "📦", "Orders", "Ready for pickup and completed orders"],
    ["alerts", "⏰", "Late alerts", "Due within 6 hours and overdue work"],
    ["complaints", "💬", "Customer complaints", "Review and resolve customer reports"],
    ["notifications", "📱", "Text notifications", "Queued, sent, skipped, and failed order texts"],
    ["pricing", "🏷", "Pricing", "Customer rates, bag price, and Washing Specialist pay"],
    ["tools", "🧪", "Pilot tools", "Synthetic QR and station test codes"],
  ])
    choice(choices, icon, title, description, () => {
      managementView = key;
      route("management");
    });
}
function managementNotifications(data){
 const c=card("📱","Text notifications","Order texts appear here. Queued messages will begin sending after Twilio is configured.");managementBack(c);
 const items=data.notifications||[];if(!items.length)c.append(node("p","No order texts have been created yet.",{class:"muted"}));
 for(const item of items.slice(0,100)){const customer=(data.users||[]).find(user=>user.id===item.customer_id),row=node("div",undefined,{class:"bag-card"});row.append(node("strong",`${item.status.toUpperCase()} · ${customer?.displayName||customer?.username||"Customer"}`),node("p",item.body),node("p",`${item.to||"No valid number"} · ${new Date(item.created_at).toLocaleString()}${item.error?` · ${item.error}`:""}`,{class:"muted"}));if(["queued","failed"].includes(item.status))button(row,"Retry text",async()=>{await api("/api/management/notifications",{id:item.id});await route("management");message("Text retry completed.")},true);c.append(row)}
}
function managementPricing(data){
  const prices=data.pricing||{dropoff:2.5,full_service:3,rushPerLb:1,extraBag:10,contractor:1},c=card("🏷","Pricing","Changes apply only to orders booked after you save. Existing jobs keep their original rates.");managementBack(c);
  c.append(node("p","Pickup & return distance pricing: first 5 round-trip miles from 307 Locust Street to the customer and back are free, then $1.00 per additional mile.",{class:"note"}));
  if(!data.pricingPinSet){c.append(node("p","Create a separate six-digit PIN. You will enter it every time pricing changes.",{class:"note"}));const pin=field(c,"New six-digit pricing PIN","password"),confirmPin=field(c,"Enter the PIN again","password");for(const input of [pin,confirmPin]){input.inputMode="numeric";input.maxLength=6;input.pattern="[0-9]{6}"}button(c,"Set pricing PIN",async()=>{await api("/api/management/pricing",{action:"set_pin",pin:pin.value,confirmPin:confirmPin.value});await route("management");message("Pricing PIN created. Open Pricing again to make changes.")});return}
  const inputs={};for(const [key,label] of [["dropoff","Customer drop-off price per lb"],["full_service","Customer pickup & return price per lb"],["rushPerLb","Rush addition per lb"],["extraBag","Extra or replacement bag price"],["contractor","Washing Specialist pay per approved lb"]]){inputs[key]=field(c,label,"number",Number(prices[key]).toFixed(2));inputs[key].min="0";inputs[key].max="100";inputs[key].step="0.01"}
  const pin=field(c,"Confirm with six-digit pricing PIN","password");pin.inputMode="numeric";pin.maxLength=6;pin.pattern="[0-9]{6}";
  button(c,"Confirm and publish pricing",async()=>{const body={pin:pin.value};for(const [key,input] of Object.entries(inputs))body[key]=Number(input.value);const result=await api("/api/management/pricing",body);pricingPreview=result.pricing;managementView="home";await route("management");message(`Pricing published effective ${new Date(result.effectiveAt).toLocaleString()}.`) });
  if((data.pricingHistory||[]).length){c.append(node("h3","Pricing history"));for(const item of data.pricingHistory)c.append(node("p",`${new Date(item.effective_at).toLocaleString()} · Drop-off $${Number(item.pricing.dropoff).toFixed(2)}/lb · Washing Specialist $${Number(item.pricing.contractor).toFixed(2)}/lb`,{class:"note"}))}
}
function managementOrders(data) {
  const selected=managementOrderId&&(data.orders||[]).find(order=>order.id===managementOrderId);
  if(selected)return managementOrderDetail(data,selected);
  const c=card("📦","Orders","Scan the list, then open an order to see its complete history and actions.");managementBack(c);
  const wrap=node("div",undefined,{class:"table-wrap"}),table=node("table"),head=node("thead"),headRow=node("tr");for(const label of ["Order","Status","Customer","Washing Specialist","Service","Due","Amount","Details"])headRow.append(node("th",label));head.append(headRow);table.append(head);const body=node("tbody");
  const orders=[...(data.orders||[])].sort((a,b)=>{const aDone=["picked_up","cancelled"].includes(a.status),bDone=["picked_up","cancelled"].includes(b.status);return Number(aDone)-Number(bDone)||Date.parse(b.created_at||0)-Date.parse(a.created_at||0)});
  for(const order of orders){const customer=(data.users||[]).find(person=>person.id===order.customer_id),contractor=(data.users||[]).find(person=>person.id===order.assigned_contractor_id),row=node("tr");for(const value of [order.id,statusLabels[order.status]||order.status,customer?.displayName||customer?.username||"Unknown",contractor?.displayName||contractor?.username||"Not assigned",order.service==="full_service"?"Delivery":"Drop off",order.due_at?new Date(order.due_at).toLocaleString():"Not set",order.total===undefined?"—":`$${Number(order.total).toFixed(2)}`])row.append(node("td",value));const action=node("td");button(action,"Open",()=>{managementOrderId=order.id;route("management")},true);row.append(action);body.append(row)}
  if(!orders.length){const row=node("tr"),empty=node("td","No orders yet.");empty.colSpan=8;row.append(empty);body.append(row)}table.append(body);wrap.append(table);c.append(wrap);
}
function managementOrderDetail(data,order){
  const customer=(data.users||[]).find(person=>person.id===order.customer_id),contractor=(data.users||[]).find(person=>person.id===order.assigned_contractor_id),c=card("📦",`Order ${order.id}`,statusLabels[order.status]||order.status);
  button(c,"← All orders",()=>{managementOrderId=null;route("management")},true);summary(c,order);timeline(c,order);
  const details=node("dl");for(const [label,value] of [["Customer",customer?.displayName||customer?.username||"Unknown"],["Washing Specialist",contractor?.displayName||contractor?.username||"Not assigned"],["Created",new Date(order.created_at).toLocaleString()],["Service",order.service==="full_service"?"Pickup & return":"Drop off"],["Address",order.pickup_address||"Shop drop-off"],["Delivery note",order.delivery_instructions||"—"],["Round-trip miles",order.service==="full_service"?Number(order.delivery_miles||0).toFixed(1):"—"],["Bag",order.bag_id||"Not assigned"]])details.append(node("dt",label),node("dd",value));c.append(details);
  if(order.weight_photo_at){const proof=node("a","View scale photo",{href:`/api/orders/${encodeURIComponent(order.id)}/weight-proof`,target:"_blank",rel:"noopener",class:"role-continue"});c.append(node("p",`Recorded weight: ${Number(order.measured_pounds||order.billed_pounds).toFixed(1)} lb · photo taken ${new Date(order.weight_photo_at).toLocaleString()}`,{class:"note"}),proof)}
  if(order.status==="paid_hold")button(c,"Move paid bag to pickup area",()=>actionWizard(order,"staff_release"));
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
    managementOrderId=null;moneyEditOrderId=null;
    route("management");
  }, true);
}
function moneyManagement(data) {
  const c = card("💵", "Money", "Customer payment status, Washing Specialist earnings, business costs, and estimated profit. Automated specialist payouts are not enabled yet.");
  managementBack(c);
  c.append(node("h3","Date range"));
  const period=select(c,"View",[["this_week","This week"],["last_week","Last week"],["last_30","Last 30 days"],["all","All time"],["custom","Custom dates"]],moneyPeriod);
  const custom=node("div");c.append(custom);
  const localDay=date=>{const copy=new Date(date);copy.setHours(0,0,0,0);return copy},today=localDay(new Date());
  const monday=date=>{const copy=localDay(date),day=copy.getDay();copy.setDate(copy.getDate()-(day===0?6:day-1));return copy};
  const rangeFor=value=>{if(value==="all")return [null,null];if(value==="custom")return [moneyStart?localDay(`${moneyStart}T12:00:00`):null,moneyEnd?new Date(`${moneyEnd}T23:59:59.999`):null];if(value==="last_30"){const start=localDay(today);start.setDate(start.getDate()-29);return [start,new Date(today.getTime()+86400000-1)]}const start=monday(today);if(value==="last_week")start.setDate(start.getDate()-7);const end=new Date(start);end.setDate(end.getDate()+6);end.setHours(23,59,59,999);return [start,end]};
  const drawCustom=()=>{custom.replaceChildren();if(period.value!=="custom")return;const start=field(custom,"Start date","date",moneyStart),end=field(custom,"End date","date",moneyEnd);button(custom,"Apply date range",async()=>{if(!start.value||!end.value||start.value>end.value)throw Error("Choose a valid start and end date.");moneyStart=start.value;moneyEnd=end.value;moneyPeriod="custom";await route("management")})};drawCustom();
  period.addEventListener("change",async()=>{moneyPeriod=period.value;drawCustom();if(moneyPeriod!=="custom")await route("management")});
  const [rangeStart,rangeEnd]=rangeFor(moneyPeriod),within=value=>{if(!rangeStart&&!rangeEnd)return true;if(!value)return false;const when=new Date(value);return (!rangeStart||when>=rangeStart)&&(!rangeEnd||when<=rangeEnd)};
  c.append(node("p",rangeStart&&rangeEnd?`Showing ${rangeStart.toLocaleDateString()} through ${rangeEnd.toLocaleDateString()}`:"Showing all recorded dates",{class:"note"}));
  const jobs = (data.orders || []).filter((o) => o.assigned_contractor_id);
  const completed=jobs.filter(order=>order.returned_at&&within(order.returned_at)),contractorPay=completed.reduce((sum,order)=>sum+Number(order.contractor_pay?.total||0),0),revenue=(data.orders||[]).filter(order=>order.payment_verified&&within(order.paid_at||order.returned_at)).reduce((sum,order)=>sum+Number(order.total||0),0),visibleCosts=(data.businessCosts||[]).filter(cost=>within(`${cost.date}T12:00:00`)),costs=visibleCosts.reduce((sum,cost)=>sum+Number(cost.amount||0),0),profit=revenue-contractorPay-costs;
  const stats=node("div",undefined,{class:"stat-grid"});c.append(stats);stat(stats,`$${revenue.toFixed(2)}`,"Collected revenue");stat(stats,`$${contractorPay.toFixed(2)}`,"Specialist earnings");stat(stats,`$${costs.toFixed(2)}`,"Business costs");stat(stats,`$${profit.toFixed(2)}`,"Estimated profit");
  c.append(node("p","Estimated profit = verified customer payments − Washing Specialist earnings on returned work − costs entered below.",{class:"note"}),node("h3","Jobs and Washing Specialist pay"),node("p","Payments become ready for payout 24 hours after the customer payment is verified. Bank timing may take longer. Paid jobs are locked.",{class:"note"}));
  const contractors=(data.users||[]).filter(person=>person.role==="contractor"),wrap=node("div",undefined,{class:"table-wrap"}),table=node("table"),head=node("thead"),headRow=node("tr");for(const label of ["Job","Washing Specialist","Completed","Base","Delivery","Rush","Mileage / other","Total","Payout","Edit"])headRow.append(node("th",label));head.append(headRow);table.append(head);const body=node("tbody");
  for(const order of completed){const contractor=contractors.find(person=>person.id===order.assigned_contractor_id),pay=order.contractor_pay||{},row=node("tr"),status={waiting_for_customer_payment:"Waiting for customer payment",clearing:order.contractor_payout_eligible_at?`Clears ${new Date(order.contractor_payout_eligible_at).toLocaleString()}`:"Clearing",ready:"Ready for payout",paid:"Paid"}[order.contractor_payout_status]||"Waiting";for(const value of [order.id,contractor?.displayName||contractor?.username||"Contractor",new Date(order.returned_at).toLocaleDateString(),`$${Number(pay.base||0).toFixed(2)}`,`$${Number(pay.deliveryBonus||0).toFixed(2)}`,`$${Number(pay.rushBonus||0).toFixed(2)}`,`$${Number(pay.adjustments||0).toFixed(2)}`,`$${Number(pay.total||0).toFixed(2)}`,status])row.append(node("td",value));const action=node("td");if(order.contractor_payout_status!=="paid")button(action,"Edit",()=>{moneyEditOrderId=order.id;route("management")},true);else action.append(node("span","Locked",{class:"muted"}));row.append(action);body.append(row)}
  if(!completed.length){const row=node("tr"),empty=node("td","No completed Washing Specialist jobs in this date range.");empty.colSpan=10;row.append(empty);body.append(row)}table.append(body);wrap.append(table);c.append(wrap);
  const editing=completed.find(order=>order.id===moneyEditOrderId);if(editing&&editing.contractor_payout_status!=="paid"){const contractor=contractors.find(person=>person.id===editing.assigned_contractor_id),current=editing.contractor_pay_adjustments?.[0],box=node("div",undefined,{class:"bag-card"});box.append(node("h3",`Edit ${editing.id}`),node("p",contractor?.displayName||contractor?.username||"Contractor",{class:"muted"}));const extra=field(box,"Mileage or other adjustment","number",Number(editing.contractor_pay?.adjustments||0).toFixed(2)),reason=field(box,"Reason","text",current?.reason||"");extra.min="-500";extra.max="500";extra.step="0.01";button(box,"Save job pay",async()=>{await api("/api/management/pay-adjustments",{action:"set",orderId:editing.id,amount:Number(extra.value),reason:reason.value});moneyEditOrderId=null;await route("management");message("Job pay updated.")});button(box,"Cancel",()=>{moneyEditOrderId=null;route("management")},true);c.append(box)}
  c.append(node("h3","Enter a business cost"));const description=field(c,"Description","text"),category=select(c,"Category",[["supplies","Supplies"],["rent","Rent"],["utilities","Utilities"],["software","Software"],["marketing","Marketing"],["other","Other"]]),date=field(c,"Date","date",shopDateKey()),amount=field(c,"Amount","number");amount.min="0.01";amount.max="100000";amount.step="0.01";
  button(c,"Add cost",async()=>{await api("/api/management/costs",{action:"add",description:description.value,category:category.value,date:date.value,amount:Number(amount.value)});await route("management");message("Business cost added.")});
  c.append(node("h3","Recorded costs"));if(!visibleCosts.length)c.append(node("p","No business costs in this date range.",{class:"muted"}));for(const cost of visibleCosts){const row=node("div",undefined,{class:"bag-card"});row.append(node("strong",`${cost.description} · $${Number(cost.amount).toFixed(2)}`),node("p",`${cost.category} · ${cost.date}`,{class:"muted"}));button(row,"Delete cost",async()=>{if(!confirm(`Delete ${cost.description}?`))return;await api("/api/management/costs",{action:"delete",id:cost.id});await route("management");message("Business cost deleted.")},true);c.append(row)}
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
  const ownerPin=account.role==="customer"?field(c,"Six-digit owner PIN","password"):null;if(ownerPin){ownerPin.inputMode="numeric";ownerPin.maxLength=6;ownerPin.pattern="[0-9]{6}";c.append(node("p","Customer information changes require your owner PIN and clear the customer’s verification until they review it again.",{class:"note"}))}
  button(c, "Save account details", async () => {
    await api("/api/management/accounts/" + encodeURIComponent(account.id), {
      action: "update_profile",
      displayName: name.value,
      phone: phone.value,
      email: email.value,
      ...(ownerPin?{pin:ownerPin.value}:{}),
    });
    route("management");
  });
  if (account.role === "contractor" && !account.approved) {
    const review = node("div", undefined, { class: "bag-card" });
    review.append(
      node("h3", "Washing Specialist approval"),
      node(
        "p",
        account.payoutOnboardingComplete
          ? "Stripe tax, identity, and bank setup is verified. Complete the phone and in-person review."
          : "Stripe tax, identity, and bank setup is not complete. Approval is blocked until it is verified.",
        { class: "muted" },
      ),
    );
    const phoneConfirmed = check(review, "I spoke with this Washing Specialist by phone."),
      inPersonConfirmed = check(review, "I met this Washing Specialist in person at the shop.");
    button(review, "Approve Washing Specialist", async () => {
      if (!account.payoutOnboardingComplete)
        throw Error("Stripe must verify tax, identity, and bank setup before approval.");
      if (!phoneConfirmed.checked || !inPersonConfirmed.checked)
        throw Error("Complete both Washing Specialist review steps first.");
      await api("/api/management/approve", {
        userId: account.id,
        phoneConfirmed: true,
        inPersonConfirmed: true,
      });
      await route("management");
      message("Washing Specialist approved.");
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
  password.placeholder = "At least 8 characters";
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
      role === "customer" ? "Customers" : "Washing Specialist applications & accounts",
      role === "customer"
        ? "Find a customer, update their contact details, pause access, or manage their bag."
        : "Approve workers, update contact details, pause access, or reset a password.",
    );
  managementBack(c);
  button(c, role === "customer" ? "Add customer login" : "Add Washing Specialist login", () => createPilotLogin(role));
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
  const c=card("🧺","Washing Specialist approval","Review the information they entered. You do not need to edit it before deciding.");
  const details=node("dl");
  for(const [label,value] of [["Name",account.displayName||"Not provided"],["Phone",account.phone||"Not provided"],["Email",account.email||"Not provided"],["Username",account.username]])details.append(node("dt",label),node("dd",value));
  c.append(details,node("p",account.payoutOnboardingComplete?"Stripe tax, identity, and bank setup: VERIFIED":"Stripe tax, identity, and bank setup: NOT COMPLETE — approval is blocked",{class:account.payoutOnboardingComplete?"note":"confirm-warning"}),node("p","Approve only after Stripe verification, speaking with this Washing Specialist by phone, and meeting them in person at the shop.",{class:"note"}));
  const phoneConfirmed=check(c,"I spoke with this Washing Specialist by phone."),inPersonConfirmed=check(c,"I met this Washing Specialist in person at the shop.");
  button(c,"Approve Washing Specialist",async()=>{if(!account.payoutOnboardingComplete)throw Error("Stripe must verify tax, identity, and bank setup before approval.");if(!phoneConfirmed.checked||!inPersonConfirmed.checked)throw Error("Complete both Washing Specialist review steps first.");await api("/api/management/approve",{userId:account.id,phoneConfirmed:true,inPersonConfirmed:true});managementView="contractors";await route("management");message("Washing Specialist approved.");});
  button(c,"Not yet — go back",()=>{managementView="contractors";route("management")},true);
}
function bagInventory(data) {
  const c = card(
    "🛍",
    "Bag inventory",
    "Add tagged bags, see who has each bag, and complete exchange requests.",
  );
  managementBack(c);
  c.append(node("p","Bag numbers are generated automatically in order. This prevents duplicate bag IDs and QR tags.",{class:"note"}));
  button(c, "Generate new bag", async () => {
    const result=await api("/api/management/bags", { action: "add" });
    await route("management");
    message(`${result.bag.id.toUpperCase()} created. Open Print tag when you are ready.`);
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
  const c = card(role === "customer" ? "👤" : "🧺", role === "customer" ? "Add customer login" : "Add Washing Specialist login", "On first sign-in, they scroll through one complete agreement and use one acceptance checkbox.");
  const username = field(c, "Username", "text"), password = field(c, "Temporary password", "password");
  username.placeholder = "example: jordan-test"; password.placeholder = "At least 8 characters";
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
  const contractor=o.assigned_contractor_name||"Washing specialist",dated=(label,at,who)=>at?`${label} · ${new Date(at).toLocaleString()}${who?` · ${who}`:""}`:label;
  const steps = o.service==="full_service"?[
    [dated("Order booked",o.created_at,"Customer"),true],
    [dated("Accepted",o.accepted_at,contractor),!!o.assigned_contractor_id],
    [dated("Picked up from customer",o.checked_out_at,contractor),!!o.checked_out_at],
    [dated("Washing completed",o.wash_completed_at,contractor),!!o.wash_completed_at],
    [dated("Delivered to customer",o.delivered_at,contractor),!!o.delivered_at],
    [dated("Payment confirmed",o.paid_at),!!o.payment_verified],
    [dated("Customer confirmed receipt",o.picked_up_at,"Customer"),!!o.picked_up_at],
  ]:[
    [dated("Order booked",o.created_at,"Customer"),true],
    [dated("Dropped at shop",o.dropped_at,"Customer"),!!o.dropped_at],
    [dated("Accepted",o.accepted_at,contractor),!!o.assigned_contractor_id],
    [dated("Picked up from shop",o.checked_out_at,contractor),!!o.checked_out_at],
    [dated("Washing completed",o.wash_completed_at,contractor),!!o.wash_completed_at],
    [dated("Returned to shop",o.returned_at,contractor),!!o.returned_at],
    [dated("Payment confirmed",o.paid_at),!!o.payment_verified],
    [dated("Collected",o.picked_up_at,"Customer"),!!o.picked_up_at],
  ];
  const details = node("details", undefined, { class: "journey" });
  details.open=!["picked_up","cancelled"].includes(o.status);
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
    update.append(node("p",customer?`Drop-off $${Number(prices.dropoff).toFixed(2)}/lb · Rush +$${Number(prices.rushPerLb).toFixed(2)}/lb`:`Washing Specialist pay $${Number(prices.contractor).toFixed(2)}/approved lb`,{class:"note"}));
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
  rewardsPreview = d.rewards;
  agreementVersion = d.agreement?.version || null;
  if(d.staging?.synthetic===false)document.querySelector(".staging").textContent="Secure live service · real customer payments enabled";
  else if (d.staging?.disposable)
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
        ? "Checkout returned. Waiting for Stripe to confirm the payment."
        : "Checkout canceled. No payment was recorded.",
      checkout !== "success",
    );
  }
} catch {
  login();
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/web/service-worker.js').catch(()=>{});
