// Builds the 2-page Khana Bridge concept brief (docs/Khana-Bridge-Concept-Brief.pdf).
// Run from the project root:  node docs/brief/build.mjs
// Needs Chrome or Edge installed (headless print) and `npm install` done (fonts, icons and the hero photo come from the project).
// Edit the TEAM, PLAN, SCENARIO and SOURCES blocks below, then re-run. `--fit` prints a layout report instead of writing the PDF.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Lucide from "lucide-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, "brief.html");
const pdfPath = path.join(here, "..", "Khana-Bridge-Concept-Brief.pdf");

/* ---------------------------------------------------------------- content */

const TEAM_NAME = "AI Team 51";
// Add a `name` to any seat and it shows above the role.
const TEAM = [
  { id: "A", role: "Product and design lead", owns: "Flows, interface, copy and the 3-minute demo", name: "" },
  { id: "B", role: "Full-stack engineer", owns: "Data model, sign-in, marketplace and admin", name: "" },
  { id: "C", role: "Matching and logistics engineer", owns: "Matching, reservations, dispatch and tests", name: "" },
  { id: "D", role: "Trust and field lead", owns: "Verification rules, food-safety review, pilot onboarding", name: "" },
];
// Chart colours were run through the dataviz validator (light mode): all checks pass; labels on every mark.
const OWNER = { A: { bg: "#dba000", fg: "#3d2c00" }, B: { bg: "#1f7a4d", fg: "#ffffff" }, C: { bg: "#3a86b8", fg: "#ffffff" }, D: { bg: "#c8452a", fg: "#ffffff" } };

// [owner, workstream, start hour, end hour, already running in the prototype]
const PLAN = [
  ["B", "Data model, sign-in, tenant scope", 0, 3.5, true],
  ["D", "Verification rules, safety review", 0.5, 6, true],
  ["A", "Need tickets and surplus forms", 1.5, 5.5, true],
  ["C", "Matching and atomic reservations", 2.5, 6.5, true],
  ["B", "Marketplace and markdown pricing", 3.5, 7.5, true],
  ["A", "Photos, notifications, reports", 5.5, 9, true],
  ["C", "Logistics, driver steps, receipts", 6.5, 9.5, true],
  ["B", "Admin console, audit trail, worker", 7.5, 10.5, true],
  ["C", "Tests and hardening", 9.5, 11.5, true],
  ["D", "Pilot kit, demo script, rehearsals", 9, 12, false],
];
const MILESTONES = [
  [3.5, "Organisations sign in and get verified"],
  [6.5, "Ticket to reservation works"],
  [9.5, "Pickup to receipt to report"],
  [11.5, "Feature freeze, tests green"],
  [12, "Demo ready"],
];

// Planning scenario for the impact section. Every input is an assumption, shown as one; replace with pilot counts.
const SCENARIO = { restaurants: 20, batchesPerWeek: 3, weeks: 13, plates: 30, rates: [["Low", 0.4], ["Base", 0.7], ["High", 0.85]] };
const listed = SCENARIO.restaurants * SCENARIO.batchesPerWeek * SCENARIO.weeks * SCENARIO.plates;
const fmt = (n) => n.toLocaleString("en-IN");

const SOURCES = [
  ["1", "UNEP, Food Waste Index Report 2024; sector split from UNEP's briefing to the UN Statistics Division.", "unep.org"],
  ["2", "FAO and partners, The State of Food Security and Nutrition in the World 2026, launched 21 Jul 2026.", "fao.org/newsroom"],
  ["3", "Global Hunger Index 2026, India profile (Welthungerhilfe, Helvetas, IFHV).", "globalhungerindex.org"],
  ["4", "FSSAI, press release on the Surplus Foods Regulations, 2019 (6 Aug 2019).", "fssai.gov.in"],
  ["5", "Harvard Food Law and Policy Clinic and Global FoodBanking Network, Food Donation Policy Atlas, India (May 2020).", "foodbanking.org"],
  ["6", "Down To Earth, on UNEP's finding that India has only subnational estimates.", "downtoearth.org.in"],
];

/* ---------------------------------------------------------------- helpers */

const ic = (name, size = 4, sw = 1.9) => {
  if (!Lucide[name]) throw new Error(`Unknown lucide icon: ${name}`);
  return renderToStaticMarkup(createElement(Lucide[name], { width: `${size}mm`, height: `${size}mm`, strokeWidth: sw, "aria-hidden": true }));
};
const sup = (...n) => `<sup>${n.map((x) => `[${x}]`).join("")}</sup>`;

const mark = (ink, size) => `<svg width="${size}mm" height="${size}mm" viewBox="0 0 48 48" aria-hidden="true">
<path d="M20 9.5c-1.5-1.7 1.5-3.2 0-5.3M28 9.5c-1.5-1.7 1.5-3.2 0-5.3" stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".7"/>
<path d="M12 12Q24 44 36 12Z" fill="#f2b705"/>
<path d="M18 24V34M30 24V34M12 11L4.5 33M36 11L43.5 33" stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none"/>
<path d="M12 10v30M36 10v30M4 34h40" stroke="${ink}" stroke-width="3.4" stroke-linecap="round" fill="none"/></svg>`;
const lockup = (ink, tag, size, scale = 1) => `<div class="lockup" style="color:${ink}">${mark(ink, size)}<div><b style="font-size:${17 * scale}pt">Khana Bridge</b>${tag ? `<i style="font-size:${8.4 * scale}pt">Everyone deserves to eat</i>` : ""}</div></div>`;

/* ---------------------------------------------------------------- bridge diagram (solution) */

function bridge() {
  const W = 186, tL = 9, tR = 177, y0 = 3.2, sag = 9.5, deck = 25, H = 29.5;
  const colW = W / 5, cx = (i) => colW * (i + 0.5);
  const cy = (x) => { const u = (x - tL) / (tR - tL); return y0 + 4 * sag * u * (1 - u); };
  const cable = `M${tL} ${y0}Q${(tL + tR) / 2} ${y0 + 2 * sag} ${tR} ${y0}`;
  let s = `<svg class="bsvg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  s += `<path d="${cable}Z" fill="#f2b705"/>`;
  s += `<text x="${W / 2}" y="${y0 + 5.6}" text-anchor="middle" font-family="Bricolage" font-weight="650" font-size="3.5" fill="#3d2c00" letter-spacing="-.05">Everyone deserves to eat</text>`;
  s += `<path d="${cable}" fill="none" stroke="#17553a" stroke-width=".7" stroke-linecap="round"/>`;
  for (let i = 0; i < 5; i++) s += `<path d="M${cx(i)} ${cy(cx(i))}V${deck}" stroke="#17553a" stroke-width=".4"/>`;
  s += `<path d="M${tL} ${y0}L2.2 ${deck - 1}M${tR} ${y0}L${W - 2.2} ${deck - 1}" stroke="#17553a" stroke-width=".5" stroke-linecap="round"/>`;
  s += `<path d="M${tL} ${y0 - 1}V${deck + 3.5}M${tR} ${y0 - 1}V${deck + 3.5}" stroke="#17553a" stroke-width="1.5" stroke-linecap="round"/>`;
  s += `<path d="M1 ${deck}H${W - 1}" stroke="#17553a" stroke-width="1.3" stroke-linecap="round"/>`;
  for (let i = 0; i < 5; i++) s += `<circle cx="${cx(i)}" cy="${deck}" r="3" fill="#f2b705" stroke="#ffffff" stroke-width=".7"/><text x="${cx(i)}" y="${deck + 1.15}" text-anchor="middle" font-family="Bricolage" font-weight="700" font-size="3.4" fill="#3d2c00">${i + 1}</text>`;
  return s + "</svg>";
}

const STEPS = [
  ["ShieldCheck", "Verify", "A person reviews every organisation before it can request or reserve food."],
  ["ClipboardList", "Ask and offer", "Recipients post needs with diet and allergen limits. Restaurants confirm what is ready."],
  ["Scale", "Match", "Safety filters first, then a visible score. One batch is never promised twice."],
  ["Truck", "Move", "Collection is arranged by hand and labelled so: own vehicle, shared run or a booked rider."],
  ["ClipboardCheck", "Prove", "Each stop records what was accepted and rejected. Reports count received food only."],
];

/* ---------------------------------------------------------------- page 1 */

const page1 = `
<section class="page p1">
  <header class="hero">
    <img src="../../public/hero/market.jpg" alt="">
    <div class="in">
      <div class="toprow">${lockup("#ffffff", true, 11)}<span class="chip">Concept brief</span></div>
      <h1>Good food has a deadline.<br>We work to it.</h1>
      <p class="lead">Khana Bridge connects restaurants and supermarkets that have food to spare with verified kitchens, shelters and shoppers, while that food is still good to eat.</p>
      <div class="proto"><b>Working prototype today</b><div><span><i>53</i>screens</span><span><i>37</i>data models</span><span><i>24</i>tests passing</span></div></div>
      <p class="teamlabel"><b>Team: ${TEAM_NAME}.</b> Four seats, one build loop. The letters return in the 12-hour plan.</p>
    </div>
  </header>
  <div class="team">${TEAM.map((t) => `<div class="seat" data-fit="seat-${t.id}"><span class="badge" style="background:${OWNER[t.id].bg};color:${OWNER[t.id].fg}">${t.id}</span><div>${t.name ? `<em>${t.name}</em>` : ""}<b>${t.role}</b><span>${t.owns}</span></div></div>`).join("")}</div>

  <section class="sec problem" data-fit="problem">
    <h2>The problem</h2>
    <p class="lead">The challenge: bridge the gap between those with excess food and those without access to it. Today good food is thrown away within hours of becoming surplus, while 645 million people go hungry.${sup(2)} What is missing is a trusted, fast way to move it.</p>
    <div class="pgrid">
      <ol class="why">
        <li><span class="ic">${ic("Clock", 3.4)}</span><div><b>Surplus is perishable.</b> Restaurants, caterers and shops make 40% of food waste, in bulk, with hours to move it.${sup(1)}</div></li>
        <li><span class="ic">${ic("Scale", 3.4)}</span><div><b>Rules exist, confidence does not.</b> FSSAI backed surplus donation in 2019; a 2020 legal review found the rules too general, so donors hold back.${sup(4, 5)}</div></li>
        <li><span class="ic">${ic("Search", 3.4)}</span><div><b>Nobody is counting.</b> India has only subnational estimates, and worldwide just 49 food-service and 45 retail measurements exist.${sup(1, 6)}</div></li>
      </ol>
      <div class="ev">
        <div class="stats">
          <div class="stat"><div class="n" style="color:#17553a">1.05 bn</div><p>tonnes of food wasted worldwide in 2022, 19% of all food available to consumers${sup(1)}</p></div>
          <div class="stat"><div class="n" style="color:#17553a">40%</div><p>of it from food service and retail: 421 million tonnes at addresses a platform can reach${sup(1)}</p></div>
          <div class="stat"><div class="n" style="color:#c23a1e">645 m</div><p>people faced hunger in 2025, 7.8% of the world${sup(2)}</p></div>
          <div class="stat"><div class="n" style="color:#c23a1e">100th</div><p>of 122: India on the 2026 Global Hunger Index, in the serious band${sup(3)}</p></div>
        </div>
        <div class="split">
          <div class="splitcap"><b>Who wastes it.</b> Share of 1,052 million tonnes, 2022${sup(1)}</div>
          <div class="brk"><span>40%: where Khana Bridge starts</span><u></u></div>
          <div class="bar"><i style="width:60%;background:#b4c1c8"></i><i style="width:28%;background:#1f7a4d"></i><i style="width:12%;background:#dba000"></i></div>
          <div class="barlbl"><span style="width:60%">Households 60%, 631 Mt</span><span style="width:28%">Food service 28%, 290 Mt</span><span style="width:12%;text-align:right">Retail 12%<br>131 Mt</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="sec users" data-fit="users">
    <h2>Target users</h2>
    <p class="lead">Four groups across both sides of the loop. The gold rule marks where the Bengaluru pilot starts.</p>
    <div class="ugrid">
      <div class="user start"><div class="hd"><span class="ic">${ic("ChefHat", 3.8)}</span><h3>Restaurant or caterer manager</h3></div>
        <p class="job">Service is over and food is left. I want a safe, quick way to offer it.</p>
        <p class="get"><b>Gets</b> a 60-second listing, a matched kitchen and a record of what left.</p></div>
      <div class="user start"><div class="hd"><span class="ic">${ic("HandHeart", 3.8)}</span><h3>Verified kitchen or shelter</h3></div>
        <p class="job">I plan tonight's meal. I need to know what is coming and that it suits us.</p>
        <p class="get"><b>Gets</b> needs with diet and allergen limits, held reservations, receipts.</p></div>
      <div class="user"><div class="hd"><span class="ic">${ic("Store", 3.8)}</span><h3>Supermarket manager or shopper</h3></div>
        <p class="job">A batch is days from its date. I want it sold, not written off, at a fair price.</p>
        <p class="get"><b>Gets</b> true use-by dates, deeper discounts near the date, pay on collection.</p></div>
      <div class="user"><div class="hd"><span class="ic">${ic("Truck", 3.8)}</span><h3>Dispatcher and driver</h3></div>
        <p class="job">Food is ready. I need a clear job: where to collect, how much, where to drop.</p>
        <p class="get"><b>Gets</b> step-by-step jobs for own vehicle, shared run or booked rider.</p></div>
    </div>
  </section>

  <section class="sec solution" data-fit="solution">
    <h2>The solution</h2>
    <p class="lead">One deadline-aware loop from surplus to plate, shared by a grocery marketplace and a donation network.</p>
    <div class="ends"><span>${ic("Store", 3.6)}<b>Food to spare</b> restaurants, caterers, supermarkets</span><span><b>People who need it</b> verified kitchens, shelters, shoppers${ic("HandHeart", 3.6)}</span></div>
    <div class="bridge">${bridge()}</div>
    <div class="steps">${STEPS.map(([i, t, d]) => `<div class="step" data-fit="step-${t}"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>
    <div class="shorter"><b>Same bridge, shorter span.</b> Supermarkets list batches with the real use-by date. The price falls as the date nears and volume rises, within a floor and a cap. Shoppers pay on collection; recalled or expired batches are blocked.</div>
  </section>

  <footer class="foot"><span>Khana Bridge concept brief, ${TEAM_NAME}</span><span>1 / 2</span></footer>
</section>`;

/* ---------------------------------------------------------------- page 2 */

const services = ["Organisations and verification", "Need tickets", "Surplus batches", "Matching", "Offers and reservations", "Logistics and receipts", "Marketplace and pricing", "Reports and audit"];

const kpis = [
  ["Plates and kilos received", "Accepted at handover, per stop", "Reported as counted"],
  ["Collection rate", "Confirmed batches collected", "70% or more"],
  ["Ready to collected", "Median minutes per batch", "60 or fewer"],
  ["Marked-down units sold", "Sold before the date, of listed", "60% or more"],
  ["Stops with a receipt", "Receipts, of completed stops", "100%"],
];

const H = 12; // hours
const pct = (h) => `${(h / H) * 100}%`;
const gantt = `
<div class="gantt">
  <div class="axis"><div class="albl"></div><div class="atrack">
    ${Array.from({ length: H + 1 }, (_, h) => `<span class="hr" style="left:${pct(h)}">${h}</span>`).join("")}
    <i class="deck"></i><i class="tower" style="left:0"></i><i class="tower" style="left:100%"></i>
    ${MILESTONES.map(([h], i) => `<b class="ms" style="left:${pct(h)}">M${i + 1}</b>`).join("")}
  </div></div>
  ${PLAN.map(([o, name, a, b, done]) => `<div class="grow"><div class="lbl">${name}</div><div class="track">${MILESTONES.map(([h]) => `<i class="mline" style="left:${pct(h)}"></i>`).join("")}<div class="gbar ${done ? "" : "todo"}" style="left:${pct(a)};width:${pct(b - a)};${done ? `background:${OWNER[o].bg};color:${OWNER[o].fg}` : `border-color:${OWNER[o].bg};color:${OWNER[o].bg}`}"><span class="own" style="${done ? `background:${OWNER[o].fg};color:${OWNER[o].bg}` : `background:${OWNER[o].bg};color:${OWNER[o].fg}`}">${o}</span>${done ? ic("Check", 2.6, 3) : ""}</div></div></div>`).join("")}
</div>`;

const page2 = `
<section class="page p2">
  <div class="p2head">${lockup("#17553a", false, 7.5, 0.82)}<span>Concept brief, page 2: how it is built, what it changes, how we get there</span></div>

  <section class="sec tech" data-fit="tech">
    <h2>Tech approach</h2>
    <p class="lead">One small web app with no paid services: a single deployable that four people can build, test and demo in a day.</p>
    <div class="tgrid">
      <div class="arch">
        <div class="roles">${["Restaurant", "Supermarket", "Recipient", "Shopper", "Driver", "Admin"].map((r) => `<span>${r}</span>`).join("")}</div>
        <div class="sep">responsive web app, six roles, no install</div>
        <div class="app"><b>Next.js 16 App Router, React 19, TypeScript</b><span>Server actions are the only way to change data. Phone and password sign-in, HttpOnly session, Zod 4 on every input.</span></div>
        <div class="sep">server actions call services</div>
        <div class="svc">${services.map((s) => `<span>${s}</span>`).join("")}</div>
        <div class="sep">Prisma 6, transactions, conditional updates</div>
        <div class="data"><span><b>SQLite, 37 models</b>PostgreSQL-ready</span><span><b>Private file store</b>served only after an access check</span></div>
        <div class="worker">${ic("Timer", 3.4)}<span><b>Worker, every 60 seconds:</b> expires offers, holds, tickets and lots, escalates, and creates recurring tickets. Each task runs once per minute.</span></div>
      </div>
      <div class="decisions">
        <ul>
          <li><b>No double-booking.</b> Stock changes only through conditional SQL updates in transactions, with idempotency keys. A test races two reservations.</li>
          <li><b>Trust is server-side.</b> Role and organisation come from the database, never the browser. Other organisations' records return 404.</li>
          <li><b>Explainable matching.</b> Hard safety filters first, then a visible score with the reasons. Unknown allergens never match.</li>
          <li><b>Honest data.</b> UTC stored, IST shown, money in integer paise, units never converted, reports count received food only.</li>
          <li><b>Evidence trail.</b> Every state change is audited and every stop has a receipt.</li>
        </ul>
        <p class="next"><b>Next:</b> PostgreSQL, object storage and a shared rate limiter. SMS, WhatsApp and road routing as optional adapters, off by default.</p>
      </div>
    </div>
  </section>

  <section class="sec impact" data-fit="impact">
    <h2>Expected impact</h2>
    <p class="lead">We count only what people actually received. The targets are goals for a 90-day Bengaluru pilot, not forecasts.</p>
    <div class="igrid">
      <div>
        <table class="kpi"><thead><tr><th>Measure</th><th>How we count it</th><th>90-day target</th></tr></thead><tbody>
          ${kpis.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join("")}
        </tbody></table>
        <div class="outcomes">
          <div><span class="ic">${ic("HandHeart", 3.4)}</span><p><b>People who need food</b> get a plan they can rely on.</p></div>
          <div><span class="ic">${ic("Store", 3.4)}</span><p><b>Restaurants and shops</b> turn waste into a record or a sale.</p></div>
          <div><span class="ic">${ic("Building2", 3.4)}</span><p><b>The city</b> gets its first measured surplus data.${sup(1, 6)}</p></div>
        </div>
      </div>
      <div class="scn" data-fit="scenario">
        <h3>Planning scenario: plates received in 90 days</h3>
        <div class="sbars">${SCENARIO.rates.map(([k, r]) => `<div class="sb ${k === "Base" ? "base" : ""}"><span class="k">${k}, ${Math.round(r * 100)}% collected</span><span class="v"><i style="width:${((listed * r) / listed) * 100}%"></i><b>${fmt(Math.round(listed * r))}</b></span></div>`).join("")}</div>
        <p class="formula">${SCENARIO.restaurants} restaurants × ${SCENARIO.batchesPerWeek} batches a week × ${SCENARIO.weeks} weeks × ${SCENARIO.plates} plates = ${fmt(listed)} listed; bars show the share collected.</p>
        <p class="honest"><b>Our assumptions, not results;</b> pilot counts replace them. Food service and retail waste 421 million tonnes a year worldwide,${sup(1)} so the pilot proves the loop and claims no scale.</p>
      </div>
    </div>
  </section>

  <section class="sec plan" data-fit="plan">
    <h2>12-hour build plan</h2>
    <p class="lead">Four people in parallel, one demo-ready loop. Ticked bars already run in the prototype today; the dashed bar is still ahead.</p>
    ${gantt}
    <div class="legend">${TEAM.map((t) => `<span><b class="badge sm" style="background:${OWNER[t.id].bg};color:${OWNER[t.id].fg}">${t.id}</b>${t.role}</span>`).join("")}</div>
    <div class="mslist">${MILESTONES.map(([h, t], i) => `<span><b>M${i + 1}</b> hour ${h}: ${t}</span>`).join("")}</div>
    <p class="cut"><b>If we slip,</b> we keep the donation loop, receipts and verification, then the marketplace, then reports; photos and notifications go last. No real organisation is contacted until a food-safety professional reviews the default deadlines.</p>
  </section>

  <section class="sources" data-fit="sources">
    <ol>${SOURCES.map(([n, t, u]) => `<li><b>[${n}]</b> ${t} <u>${u}</u></li>`).join("")}</ol>
    <p>Figures checked 17 Nov 2026. Sector shares are tonnes divided by the 1,052 Mt total. The 40% is food service (290 Mt) plus retail (131 Mt).</p>
  </section>

  <footer class="foot"><span>Khana Bridge concept brief, ${TEAM_NAME}</span><span>2 / 2</span></footer>
</section>`;

/* ---------------------------------------------------------------- styles */

// Fonts are inlined as data URIs: Chrome blocks font loads between file:// URLs.
const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(path.join(here, "..", "..", "node_modules", "@fontsource-variable", pkg, "files", file)).toString("base64")}`;
const css = `
@font-face{font-family:"Bricolage";src:url("${font("bricolage-grotesque", "bricolage-grotesque-latin-opsz-normal.woff2")}") format("woff2");font-weight:200 800;font-display:block}
@font-face{font-family:"Public";src:url("${font("public-sans", "public-sans-latin-wght-normal.woff2")}") format("woff2");font-weight:100 900;font-display:block}
:root{--ink:#13241c;--leaf:#17553a;--deep:#0b2e1f;--turmeric:#f2b705;--tink:#3d2c00;--chilli:#c23a1e;--steel:#4d6b78;--f50:#e3efe7;--cream:#f6f4ee;--line:#ddd8cb;--muted:#4f625b}
@page{size:210mm 297mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:400 8.2pt/1.36 Public,sans-serif;color:var(--ink);font-kerning:normal;background:#fff}
h1,h2,h3,.lockup b,.stat .n{font-family:Bricolage,sans-serif;letter-spacing:-.02em}
sup{font-size:.68em;line-height:0;color:var(--steel);font-weight:600;margin-left:.25mm;white-space:nowrap}
.page{width:210mm;height:296.5mm;position:relative;overflow:hidden;break-after:page;background:#fff;display:flex;flex-direction:column}
.page:last-child{break-after:auto}
.lockup{display:flex;align-items:center;gap:2.2mm}
.lockup b{display:block;font-weight:650;line-height:1}
.lockup i{display:block;font-style:normal;font-weight:500;opacity:.78;margin-top:.9mm;line-height:1}
.sec{padding:0 12mm;margin-top:3.8mm}
.sec h2{font:700 14.5pt/1.05 Bricolage,sans-serif;letter-spacing:-.025em;color:var(--leaf)}
.sec>.lead{margin-top:.9mm;font-size:8.6pt;line-height:1.37;font-weight:500;max-width:178mm}
.ic{width:5.6mm;height:5.6mm;border-radius:50%;background:var(--f50);color:var(--leaf);display:grid;place-items:center;flex:none}
.foot{position:absolute;left:12mm;right:12mm;bottom:5mm;display:flex;justify-content:space-between;font-size:6.6pt;color:var(--steel)}

/* hero + team */
.hero{position:relative;height:63mm;background:var(--deep);color:#fff;overflow:hidden;flex:none}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 40%}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,46,31,.97) 0,rgba(11,46,31,.9) 48%,rgba(11,46,31,.45) 100%)}
.hero .in{position:relative;z-index:2;padding:7mm 12mm 0;height:100%}
.toprow{display:flex;justify-content:space-between;align-items:center}
.chip{font-size:7.4pt;font-weight:600;border:.25mm solid rgba(255,255,255,.5);border-radius:5mm;padding:.8mm 2.8mm}
.hero h1{margin-top:3mm;font-weight:700;font-size:25.5pt;line-height:1.02;max-width:124mm;letter-spacing:-.03em}
.hero .lead{margin-top:1.8mm;font-size:8.8pt;line-height:1.38;max-width:122mm;color:rgba(255,255,255,.88)}
.proto{position:absolute;right:12mm;top:23mm;width:56mm;border:.25mm solid rgba(255,255,255,.38);border-radius:3mm;background:rgba(11,46,31,.55);padding:2.4mm 3mm}
.proto b{font-size:7.4pt;font-weight:650;display:block;margin-bottom:1.2mm}
.proto div{display:flex;justify-content:space-between}
.proto span{font-size:6.6pt;line-height:1.15;color:rgba(255,255,255,.8);text-align:left}
.proto i{display:block;font:700 15pt/1 Bricolage,sans-serif;font-style:normal;color:var(--turmeric);letter-spacing:-.02em}
.teamlabel{position:absolute;left:12mm;top:51.4mm;font-size:7.4pt;color:rgba(255,255,255,.85)}
.teamlabel b{color:#fff;font-weight:650}
.team{position:relative;z-index:3;margin:-8mm 12mm 0;display:grid;grid-template-columns:repeat(4,1fr);gap:2.6mm}
.seat{background:#fff;border:.25mm solid var(--line);border-radius:2.6mm;padding:2.3mm 2.6mm;display:grid;grid-template-columns:6mm 1fr;gap:2mm;align-items:start;min-height:17.5mm}
.badge{width:6mm;height:6mm;border-radius:1.5mm;display:grid;place-items:center;font:700 9pt/1 Bricolage,sans-serif}
.badge.sm{width:4.2mm;height:4.2mm;border-radius:1.1mm;font-size:7pt;display:inline-grid;margin-right:1.4mm;vertical-align:-.9mm}
.seat b{display:block;font-weight:650;font-size:8pt;line-height:1.18}
.seat em{display:block;font-style:normal;font-weight:600;font-size:7.4pt;color:var(--chilli)}
.seat span:not(.badge){display:block;margin-top:.7mm;font-size:7pt;line-height:1.28;color:var(--muted)}

/* problem */
.pgrid{display:grid;grid-template-columns:66mm 1fr;gap:8mm;margin-top:2.4mm}
.why{list-style:none;display:grid;gap:3.4mm;align-content:start}
.why li{display:grid;grid-template-columns:5.6mm 1fr;gap:2mm;font-size:8.2pt;line-height:1.36}
.why b{font-weight:650;color:var(--ink)}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:2mm 6mm}
.stat .n{font-weight:700;font-size:20pt;line-height:1;letter-spacing:-.035em}
.stat p{margin-top:.6mm;font-size:7.2pt;line-height:1.26;color:var(--muted)}
.split{margin-top:2.2mm}
.splitcap{font-size:7.4pt;color:var(--muted)}
.splitcap b{color:var(--ink);font-weight:650}
.brk{margin:.6mm 0 .6mm 60%}
.brk span{display:block;text-align:right;font-size:7pt;font-weight:650;color:var(--leaf);white-space:nowrap}
.brk u{display:block;height:1.3mm;margin-top:.5mm;border:.4mm solid var(--leaf);border-bottom:0}
.bar{display:flex;gap:.7mm;height:5.2mm}
.bar i{display:block;height:100%}
.bar i:first-child{border-radius:1.4mm 0 0 1.4mm}.bar i:last-child{border-radius:0 1.4mm 1.4mm 0}
.barlbl{display:flex;margin-top:1mm}
.barlbl span{font-size:7pt;line-height:1.2;color:var(--ink)}
.barlbl span:nth-child(2){padding-left:.5mm}

/* users */
.ugrid{display:grid;grid-template-columns:repeat(4,1fr);margin-top:2.6mm}
.user{padding:2mm 3.6mm 0;border-left:.25mm solid var(--line);border-top:1mm solid var(--line)}
.user.start{border-top-color:var(--turmeric)}
.user:first-child{padding-left:0;border-left:0}.user:last-child{padding-right:0}
.user .hd{display:flex;align-items:center;gap:1.8mm;min-height:6.8mm}
.user .ic{width:6.2mm;height:6.2mm}
.user h3{font-weight:650;font-size:8.6pt;line-height:1.12}
.user p{margin-top:1.4mm;font-size:7.7pt;line-height:1.32}
.user p.get{color:var(--muted)}
.user p b{color:var(--leaf);font-weight:650}

/* solution */
.ends{display:flex;justify-content:space-between;margin-top:2.4mm;font-size:7.4pt;color:var(--muted)}
.ends span{display:flex;align-items:center;gap:1.4mm}
.ends b{color:var(--ink);font-weight:650}
.ends svg{color:var(--leaf)}
.bridge{margin-top:.4mm;height:29.5mm}
.bsvg{display:block}
.steps{display:grid;grid-template-columns:repeat(5,1fr);margin-top:.6mm}
.step{padding:0 2.1mm}
.step h3{font-weight:650;font-size:8.6pt;color:var(--leaf)}
.step p{margin-top:.7mm;font-size:7.6pt;line-height:1.32}
.shorter{margin-top:2.6mm;border-left:.9mm solid var(--turmeric);background:var(--cream);padding:1.8mm 3mm;font-size:7.5pt;line-height:1.34}
.shorter b{font-weight:650;color:var(--leaf)}

/* page 2 */
.p2head{display:flex;justify-content:space-between;align-items:center;padding:6mm 12mm 0;font-size:7.4pt;color:var(--steel)}
.p2head .lockup b{font-size:12.5pt!important}
.tgrid{display:grid;grid-template-columns:100mm 1fr;gap:7mm;margin-top:2.6mm}
.arch{display:grid;gap:0}
.roles{display:grid;grid-template-columns:repeat(6,1fr);gap:1.2mm}
.roles span{background:var(--f50);color:var(--leaf);font-weight:600;font-size:6.9pt;text-align:center;border-radius:5mm;padding:.8mm 0}
.sep{display:flex;align-items:center;gap:1.6mm;font-size:6.5pt;color:var(--steel);height:3.7mm;padding-left:3mm}
.sep::before{content:"";width:.35mm;height:100%;background:var(--steel);margin-right:.4mm;flex:none}
.app{border:.3mm solid var(--leaf);border-radius:2.4mm;padding:2.2mm 3mm;background:#fff}
.app b{display:block;font:650 8.4pt/1.15 Bricolage,sans-serif;color:var(--leaf)}
.app>span{display:block;margin-top:.5mm;font-size:7.4pt;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:1mm;margin-top:1.4mm}
.chips i{font-style:normal;font-size:6.6pt;background:var(--cream);border:.2mm solid var(--line);border-radius:5mm;padding:.5mm 2mm}
.svc{display:grid;grid-template-columns:repeat(4,1fr);gap:1.2mm}
.svc span{background:var(--leaf);color:#fff;border-radius:1.8mm;font-size:6.9pt;font-weight:600;line-height:1.15;padding:1.2mm 1.8mm;min-height:7mm;display:flex;align-items:center}
.data{display:grid;grid-template-columns:1fr 1fr;gap:1.2mm}
.data span{border:.3mm solid var(--steel);border-radius:1.8mm;padding:1.1mm 2.4mm;font-size:7pt;color:var(--muted);line-height:1.25}
.data b{display:block;color:var(--ink);font-weight:650;font-size:7.6pt}
.worker{margin-top:1.6mm;display:flex;gap:2mm;align-items:flex-start;border:.3mm dashed var(--steel);border-radius:1.8mm;padding:1.5mm 2.4mm;font-size:7pt;line-height:1.28;color:var(--muted)}
.worker svg{flex:none;margin-top:.3mm;color:var(--leaf)}
.worker b{color:var(--ink);font-weight:650}
.decisions ul{list-style:none;display:grid;gap:2.2mm}
.decisions li{font-size:7.7pt;line-height:1.34;padding-left:3.2mm;position:relative}
.decisions li::before{content:"";position:absolute;left:0;top:1.5mm;width:1.4mm;height:1.4mm;border-radius:50%;background:var(--turmeric)}
.decisions li b{font-weight:650;color:var(--leaf)}
.next{margin-top:2.2mm;border-top:.25mm solid var(--line);padding-top:1.6mm;font-size:7.3pt;line-height:1.34;color:var(--muted)}
.next b{color:var(--ink);font-weight:650}

.igrid{display:grid;grid-template-columns:1fr 68mm;gap:7mm;margin-top:2.4mm}
.kpi{width:100%;border-collapse:collapse;font-size:7.4pt;line-height:1.28}
.kpi th{text-align:left;font-weight:650;color:var(--leaf);font-size:7.4pt;padding:0 2mm 1mm 0;border-bottom:.45mm solid var(--leaf)}
.kpi td{padding:1mm 2mm 1mm 0;border-bottom:.2mm solid var(--line);vertical-align:top}
.kpi td:first-child{font-weight:650}
.kpi td:last-child{font-weight:650;color:var(--leaf);white-space:nowrap;padding-right:0}
.outcomes{display:grid;grid-template-columns:repeat(3,1fr);gap:3.2mm;margin-top:2.6mm}
.outcomes div{display:grid;grid-template-columns:5.6mm 1fr;gap:1.8mm}
.outcomes p{font-size:7.3pt;line-height:1.3}
.outcomes b{font-weight:650}
.scn{background:var(--cream);border-radius:2.6mm;padding:2.8mm 3.2mm}
.scn h3{font-weight:650;font-size:8.2pt;line-height:1.15;color:var(--leaf)}
.sbars{display:grid;gap:1.7mm;margin-top:2mm}
.sb .k{display:block;font-size:6.9pt;color:var(--muted)}
.sb .v{display:flex;align-items:center;gap:1.6mm;margin-top:.3mm}
.sb .v i{display:block;height:3.6mm;border-radius:.8mm 1.4mm 1.4mm .8mm;background:#8fc3a7}
.sb.base .v i{background:#1f7a4d}
.sb .v b{font:700 8.6pt/1 Bricolage,sans-serif;letter-spacing:-.01em}
.formula{margin-top:2mm;font-size:6.9pt;line-height:1.3;color:var(--muted)}
.honest{margin-top:1.4mm;font-size:6.9pt;line-height:1.3;color:var(--ink)}
.honest b{font-weight:650}

.gantt{margin-top:1.6mm}
.axis,.grow{display:grid;grid-template-columns:46mm 1fr}
.atrack{position:relative;height:6.4mm}
.hr{position:absolute;top:0;transform:translateX(-50%);font-size:6.2pt;color:var(--steel)}
.deck{position:absolute;left:0;right:0;top:3.6mm;height:1.1mm;border-radius:1mm;background:var(--leaf)}
.tower{position:absolute;top:2.4mm;width:1.1mm;height:3.6mm;border-radius:1mm;background:var(--leaf);transform:translateX(-50%)}
.ms{position:absolute;top:2.5mm;width:4.2mm;height:3.4mm;margin-left:-2.1mm;border-radius:2mm;background:var(--turmeric);color:var(--tink);font:700 6.2pt/3.4mm Bricolage,sans-serif;text-align:center;border:.3mm solid #fff}
.grow{height:4.1mm;align-items:center}
.lbl{font-size:7.2pt;white-space:nowrap;padding-right:1.5mm}
.track{position:relative;height:100%;border-left:.2mm solid var(--line);border-right:.2mm solid var(--line);background:repeating-linear-gradient(90deg,transparent 0,transparent calc(100%/12 - .2mm),#eceae2 calc(100%/12 - .2mm),#eceae2 calc(100%/12))}
.mline{position:absolute;top:0;bottom:0;border-left:.25mm dashed rgba(242,183,5,.9)}
.gbar{position:absolute;top:.6mm;bottom:.6mm;border-radius:1.1mm;display:flex;align-items:center;justify-content:space-between;padding:0 1mm 0 .7mm;border:.35mm solid transparent}
.gbar.todo{background:#fff;border-style:dashed}
.gbar .own{width:2.8mm;height:2.8mm;border-radius:.9mm;display:grid;place-items:center;font:700 6pt/1 Bricolage,sans-serif}
.legend{display:flex;gap:4.5mm;margin-top:2mm;font-size:7pt;color:var(--muted)}
.mslist{display:grid;grid-template-columns:repeat(5,1fr);gap:2.5mm;margin-top:1.6mm;font-size:6.9pt;line-height:1.27}
.mslist b{display:inline-block;background:var(--turmeric);color:var(--tink);border-radius:2mm;padding:0 1.3mm;font:700 6.4pt/1.35 Bricolage,sans-serif;margin-right:.6mm}
.cut{margin-top:1.6mm;font-size:7.3pt;line-height:1.34;color:var(--muted)}
.cut b{color:var(--ink);font-weight:650}
.sources{margin:2.4mm 12mm 0;border-top:.25mm solid var(--line);padding-top:1.8mm}
.sources ol{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:.6mm 6mm}
.sources li{font-size:6.1pt;line-height:1.28;color:var(--muted)}
.sources li b{color:var(--ink);font-weight:650}
.sources u{text-decoration:none;color:var(--steel);white-space:nowrap}
.sources p{margin-top:1mm;font-size:6.1pt;color:var(--muted)}
`;

/* ---------------------------------------------------------------- report script (only runs with #fit) */

const fitScript = `
if (location.hash === "#fit") document.fonts.ready.then(() => {
  const px = 96 / 25.4, out = [];
  document.querySelectorAll(".page").forEach((p, i) => {
    const top = p.getBoundingClientRect().top;
    const bottoms = [...p.children].filter((e) => !e.classList.contains("foot")).map((e) => (e.getBoundingClientRect().bottom - top) / px);
    out.push({ page: i + 1, overflowMm: +((p.scrollHeight - p.clientHeight) / px).toFixed(1), contentEndMm: +Math.max(...bottoms).toFixed(1), pageMm: +(p.clientHeight / px).toFixed(1) });
  });
  document.querySelectorAll("[data-fit]").forEach((el) => {
    const r = el.getBoundingClientRect(), kids = [...el.querySelectorAll("*")];
    const out2 = kids.filter((k) => { const b = k.getBoundingClientRect(); return b.right > r.right + 1 || b.bottom > r.bottom + 1; }).length;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 || out2) out.push({ overflow: el.dataset.fit, scroll: [el.scrollWidth, el.scrollHeight], box: [el.clientWidth, el.clientHeight], outside: out2 });
  });
  document.querySelectorAll("section.sec").forEach((s) => out.push({ section: s.dataset.fit, heightMm: +(s.getBoundingClientRect().height / px).toFixed(1), topMm: +((s.getBoundingClientRect().top - s.closest(".page").getBoundingClientRect().top) / px).toFixed(1) }));
  out.push({ fonts: [...document.fonts].map((f) => f.family + ":" + f.status) });
  const pre = document.createElement("pre"); pre.id = "fit"; pre.textContent = JSON.stringify(out); document.body.append(pre);
});`;

const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>Khana Bridge: concept brief</title><style>${css}</style></head><body>${page1}${page2}<script>${fitScript}</script></body></html>`;
writeFileSync(htmlPath, html);

/* ---------------------------------------------------------------- render */

const browser = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));
if (!browser) throw new Error("Install Chrome or Edge to render the PDF.");
const base = ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--hide-scrollbars", "--virtual-time-budget=8000"];
const url = pathToFileURL(htmlPath).href;

if (process.argv.includes("--fit")) {
  const r = spawnSync(browser, [...base, "--dump-dom", `${url}#fit`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = /<pre id="fit">([\s\S]*?)<\/pre>/.exec(r.stdout || "");
  if (!m) { console.log("no fit report", r.stderr?.slice(0, 500)); process.exit(1); }
  for (const row of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))) console.log(JSON.stringify(row));
} else {
  const r = spawnSync(browser, [...base, "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, url], { encoding: "utf8" });
  if (!existsSync(pdfPath)) { console.error(r.stderr); process.exit(1); }
  console.log("wrote", pdfPath);
}
