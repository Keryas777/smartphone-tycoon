// Smartphone Tycoon - app.js (prototype)
// Objectif : stable, lisible, autonome (sans dépendances)

const LS_KEYS = {
  companyName: "st_companyName",
  brandPrimary: "st_brandPrimary",
  brandSecondary: "st_brandSecondary",
  state: "st_state_v1"
};

const PALETTES = [
  ["#6c7cff","#8f9bff"], // indigo/violet
  ["#0f2027","#2c5364"], // bleu nuit/cyan
  ["#000000","#c9a227"], // noir/or
  ["#8e2de2","#ff416c"], // violet/rose
  ["#11998e","#38ef7d"], // vert/turquoise
  ["#485563","#29323c"], // acier
  ["#7f00ff","#e100ff"], // pourpre/néon
  ["#1e3c72","#2a5298"]  // bleu royal
];

const DEFAULT_STATE = {
  year: 2000,
  q: 1,

  reputation: 35,      // 0..100
  cash: 250000,        // $
  mcap: 2000000,       // $
  share: 8.0,          // %

  market: "normal",    // normal|boom|downturn|crash
  macroMul: 1.0,       // interne, non montré

  // Produit
  tier: "mainstream",  // budget|mainstream|premium
  quality: 55,         // 10..100
  price: 399,
  rnd: 30000,

  osMode: "license",   // license|closed|open
  osMaturity: 10,      // 0..100
  devEcosystem: 10,    // 0..100

  // Production
  capacity: 1000,
  qprocess: 45,        // 0..100
  stock: 1200,
  buy: 1000,

  // Marché
  marketing: 20000,
  channel: "retail"    // b2b|retail|carrier
};

let state = loadState();

// ------------------ DOM refs ------------------
const $ = (id) => document.getElementById(id);

const UI = {
  // intro
  intro: $("intro-screen"),
  paletteGrid: $("palette-grid"),
  companyName: $("company-name"),
  startBtn: $("start-btn"),

  // game containers
  header: $("header"),
  main: $("main"),
  nav: $("nav"),

  // kpis
  kpiDate: $("kpi-date"),
  kpiBrand: $("kpi-brand"),
  kpiCash: $("kpi-cash"),
  kpiMcap: $("kpi-mcap"),
  kpiShare: $("kpi-share"),
  kpiMacroText: $("kpi-macro-value"),

  // product
  tier: $("product-tier"),
  perf: $("perf"),
  perfVal: $("perf-val"),
  price: $("price"),
  rnd: $("rnd"),
  osMode: $("os-mode"),
  osMaturity: $("os-maturity"),
  devAttract: $("dev-attract"),
  devBar: $("dev-bar"),
  prodAttract: $("prod-attract"),
  marketInterest: $("market-interest"),
  btnSave: $("btn-save"),
  btnReset: $("btn-reset"),

  // production
  capacity: $("capacity"),
  qprocess: $("qprocess"),
  stock: $("stock"),
  buy: $("buy"),
  defectPreview: $("defect-preview"),

  // market
  mkt: $("mkt"),
  channel: $("channel"),
  marketReadout: $("market-readout"),

  // report
  report: $("report"),
  btnNext: $("btn-next"),
};

// ------------------ Intro (company + palette) ------------------
function initIntro() {
  // build palette tiles
  UI.paletteGrid.innerHTML = "";
  let selected = null;

  PALETTES.forEach((colors, idx) => {
    const div = document.createElement("div");
    div.className = "palette";
    div.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;

    const dot = document.createElement("span");
    dot.className = "dot";
    div.appendChild(dot);

    div.addEventListener("click", () => {
      UI.paletteGrid.querySelectorAll(".palette").forEach(p => p.classList.remove("selected"));
      div.classList.add("selected");
      selected = colors;

      // preview: apply instantly to CSS vars in intro (nice feedback)
      document.documentElement.style.setProperty("--brand-primary", colors[0]);
      document.documentElement.style.setProperty("--brand-secondary", colors[1]);
    });

    // preselect first for convenience
    if (idx === 0) {
      div.classList.add("selected");
      selected = colors;
      document.documentElement.style.setProperty("--brand-primary", colors[0]);
      document.documentElement.style.setProperty("--brand-secondary", colors[1]);
    }

    UI.paletteGrid.appendChild(div);
  });

  UI.startBtn.addEventListener("click", () => {
    const name = (UI.companyName.value || "").trim();

    if (!name) {
      alert("Choisis un nom d'entreprise.");
      return;
    }

    // définitif = stocké et on ne repropose plus l'écran (sauf reset)
    localStorage.setItem(LS_KEYS.companyName, name);
    localStorage.setItem(LS_KEYS.brandPrimary, selected[0]);
    localStorage.setItem(LS_KEYS.brandSecondary, selected[1]);

    startGame();
  });

  // Enter to start
  UI.companyName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") UI.startBtn.click();
  });
}

function hasCompany() {
  return !!localStorage.getItem(LS_KEYS.companyName);
}

function applyBrandFromStorage() {
  const p = localStorage.getItem(LS_KEYS.brandPrimary) || DEFAULT_STATE.brandPrimary;
  const s = localStorage.getItem(LS_KEYS.brandSecondary) || DEFAULT_STATE.brandSecondary;
  document.documentElement.style.setProperty("--brand-primary", p);
  document.documentElement.style.setProperty("--brand-secondary", s);
}

function startGame() {
  applyBrandFromStorage();

  UI.intro.style.display = "none";
  UI.header.style.display = "block";
  UI.main.style.display = "block";
  UI.nav.style.display = "flex";

  // bind UI events only once (safe)
  bindEvents();
  renderAll();
}

// ------------------ Events ------------------
let eventsBound = false;

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // nav tabs
  UI.nav.querySelectorAll("button[data-screen]").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });

  // product inputs
  UI.tier.addEventListener("change", () => { state.tier = UI.tier.value; renderAll(); });
  UI.perf.addEventListener("input", () => { state.quality = toInt(UI.perf.value); renderAll(); });
  UI.price.addEventListener("input", () => { state.price = toInt(UI.price.value); renderAll(); });
  UI.rnd.addEventListener("input", () => { state.rnd = toInt(UI.rnd.value); renderAll(); });
  UI.osMode.addEventListener("change", () => { state.osMode = UI.osMode.value; renderAll(); });

  // production
  UI.capacity.addEventListener("input", () => { state.capacity = toInt(UI.capacity.value); renderAll(); });
  UI.qprocess.addEventListener("input", () => { state.qprocess = toInt(UI.qprocess.value); renderAll(); });
  UI.stock.addEventListener("input", () => { state.stock = toInt(UI.stock.value); renderAll(); });
  UI.buy.addEventListener("input", () => { state.buy = toInt(UI.buy.value); renderAll(); });

  // market
  UI.mkt.addEventListener("input", () => { state.marketing = toInt(UI.mkt.value); renderAll(); });
  UI.channel.addEventListener("change", () => { state.channel = UI.channel.value; renderAll(); });

  // save/reset/next
  UI.btnSave.addEventListener("click", () => {
    saveState();
    toast("Sauvegardé.");
  });

  UI.btnReset.addEventListener("click", () => {
    if (!confirm("Reset complet ? (Entreprise + partie)")) return;
    localStorage.removeItem(LS_KEYS.companyName);
    localStorage.removeItem(LS_KEYS.brandPrimary);
    localStorage.removeItem(LS_KEYS.brandSecondary);
    localStorage.removeItem(LS_KEYS.state);
    location.reload();
  });

  UI.btnNext.addEventListener("click", () => nextQuarter());

  // tooltips: click on any .has-tip
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".has-tip");
    if (!el) return;
    const tip = el.getAttribute("data-tip");
    if (!tip) return;
    showTip(el.textContent.trim(), tip);
  });
}

// ------------------ Screens ------------------
function showScreen(name) {
  const screens = {
    product: $("screen-product"),
    production: $("screen-production"),
    market: $("screen-market"),
    report: $("screen-report")
  };

  Object.values(screens).forEach(s => s.style.display = "none");
  screens[name].style.display = "block";

  UI.nav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  UI.nav.querySelector(`button[data-screen="${name}"]`)?.classList.add("active");
}

// ------------------ Game logic (simple & fun enough for proto) ------------------
function computeProductAttractiveness() {
  // base: quality helps, reputation helps, price hurts depending on tier
  const tierIdealPrice = (state.tier === "budget") ? 199 : (state.tier === "premium" ? 799 : 399);
  const pricePenalty = clamp(Math.abs(state.price - tierIdealPrice) / tierIdealPrice, 0, 1) * 35;

  let score = 0;
  score += (state.quality * 0.55);
  score += (state.reputation * 0.35);
  score -= pricePenalty;

  // OS maturity bonus
  score += clamp(state.osMaturity / 100, 0, 1) * 8;

  return clamp(Math.round(score), 0, 100);
}

function marketInterestText(attract) {
  // qualitative bucket
  if (attract >= 85) return "Très fort";
  if (attract >= 70) return "Fort";
  if (attract >= 55) return "Correct";
  if (attract >= 40) return "Faible";
  return "Très faible";
}

function defectRate() {
  // Higher process & maturity reduce defects
  const base = 0.12; // 12%
  const process = clamp(state.qprocess / 100, 0, 1);
  const maturity = clamp(state.osMaturity / 100, 0, 1);
  const quality = clamp(state.quality / 100, 0, 1);

  let rate = base;
  rate -= process * 0.07;
  rate -= maturity * 0.03;
  rate -= quality * 0.02;

  return clamp(rate, 0.01, 0.15);
}

function updateOSProgress() {
  // OS under license = slow maturity growth
  const rnd = state.rnd;
  if (state.osMode === "license") {
    state.osMaturity = clamp(state.osMaturity + Math.round(rnd / 150000), 0, 40);
    state.devEcosystem = clamp(state.devEcosystem + 0, 0, 30);
    return;
  }

  // Proprietary: maturity grows with R&D; open helps ecosystem
  const mBoost = Math.round(rnd / 60000); // 30k -> 0
  state.osMaturity = clamp(state.osMaturity + mBoost, 0, 100);

  const ecoBoost = (state.osMode === "open") ? Math.round(rnd / 90000) : Math.round(rnd / 140000);
  state.devEcosystem = clamp(state.devEcosystem + ecoBoost, 0, 100);
}

function computeDemand(attract) {
  // Demand baseline per tier
  let base = (state.tier === "budget") ? 16000 : (state.tier === "premium" ? 9000 : 12000);

  // marketing effect (diminishing returns)
  const mktEff = Math.sqrt(Math.max(0, state.marketing)) * 4;

  // channel multiplier
  const chMul = (state.channel === "carrier") ? 1.15 : (state.channel === "b2b" ? 0.75 : 1.0);

  // macro
  const macroMul = state.macroMul;

  // attractiveness multiplier
  const aMul = 0.60 + (attract / 100) * 0.70; // 0.60..1.30

  // price sensitivity (extra)
  const tierIdealPrice = (state.tier === "budget") ? 199 : (state.tier === "premium" ? 799 : 399);
  const priceMul = clamp(1.10 - (Math.abs(state.price - tierIdealPrice) / tierIdealPrice) * 0.55, 0.55, 1.10);

  const demand = (base + mktEff) * chMul * macroMul * aMul * priceMul;
  return Math.max(0, Math.round(demand));
}

function nextQuarter() {
  // 1) OS progression
  updateOSProgress();

  // 2) buy components -> stock increases, cash decreases
  const componentCost = 65; // placeholder cost per unit
  const buyUnits = Math.max(0, toInt(state.buy));
  const buyCost = buyUnits * componentCost;
  state.stock += buyUnits;
  state.cash -= buyCost;

  // 3) compute demand & produce/sell limited by capacity and stock
  const attract = computeProductAttractiveness();
  const demand = computeDemand(attract);
  const canMake = Math.max(0, Math.min(state.capacity, state.stock));
  const sold = Math.max(0, Math.min(demand, canMake));
  state.stock -= sold;

  // 4) revenue & costs
  const royaltyPerUnit = (state.osMode === "license") ? 18 : 0;
  const unitCost = 140 + (state.quality * 0.6) + royaltyPerUnit; // placeholder
  const revenue = sold * state.price;
  const cogs = sold * unitCost;

  // 5) defects & warranty cost
  const dRate = defectRate();
  const defects = Math.round(sold * dRate);
  const warrantyCost = defects * 55; // placeholder
  state.cash += revenue - cogs - warrantyCost - state.rnd - state.marketing;

  // 6) reputation change
  const repDelta =
    (attract >= 70 ? 1 : (attract < 45 ? -1 : 0)) +
    (defects > sold * 0.08 ? -2 : 0) +
    (state.cash < 0 ? -1 : 0);
  state.reputation = clamp(state.reputation + repDelta, 0, 100);

  // 7) market share & valuation (rough)
  const soldScore = sold / 12000; // normalize
  state.share = clamp(state.share + (soldScore * 1.2) - 0.3, 0.5, 65);

  const profit = revenue - cogs - warrantyCost - state.rnd - state.marketing;
  const profitFactor = clamp(profit / 400000, -1, 2);
  state.mcap = Math.max(200000, Math.round(state.mcap * (1.0 + profitFactor * 0.03 + (repDelta * 0.002))));

  // 8) advance time
  state.q += 1;
  if (state.q === 5) { state.q = 1; state.year += 1; }

  // 9) occasionally change market condition (rare)
  maybeChangeMarket();

  // 10) render report
  const reportLines = [];
  reportLines.push(`Entreprise : ${localStorage.getItem(LS_KEYS.companyName) || "—"}`);
  reportLines.push(`Période : ${state.year} Q${state.q === 1 ? 4 : state.q - 1}`);
  reportLines.push("");
  reportLines.push(`Ventes : ${fmtInt(sold)} unités (demande: ${fmtInt(demand)}, capacité+stock: ${fmtInt(canMake)})`);
  reportLines.push(`Défauts/SAV : ${fmtInt(defects)} (${(dRate*100).toFixed(1)}%)`);
  reportLines.push("");
  reportLines.push(`Chiffre d'affaires : ${fmtMoney(revenue)}`);
  reportLines.push(`Coût prod + royalties : ${fmtMoney(cogs)}`);
  reportLines.push(`SAV : ${fmtMoney(warrantyCost)}`);
  reportLines.push(`R&D : ${fmtMoney(state.rnd)}`);
  reportLines.push(`Marketing : ${fmtMoney(state.marketing)}`);
  reportLines.push("");
  reportLines.push(`Profit estimé : ${fmtMoney(profit)}`);
  reportLines.push(`Réputation : ${state.reputation}/100 (${repDelta>=0?"+":""}${repDelta})`);
  reportLines.push(`Parts de marché : ${state.share.toFixed(1)}%`);
  reportLines.push(`Valorisation : ${fmtMoney(state.mcap)}`);

  UI.report.textContent = reportLines.join("\n");

  saveState();
  renderAll();
  showScreen("report");
}

function maybeChangeMarket() {
  // rare events: at most around 1 every 8-12 quarters (rough)
  const roll = Math.random();
  if (roll > 0.10) return;

  // choose condition
  const conditions = [
    { key:"normal", label:"Marché normal", mul:1.00 },
    { key:"boom", label:"Boom", mul:1.08 },
    { key:"downturn", label:"Ralentissement", mul:0.94 },
    { key:"crash", label:"Crise", mul:0.86 }
  ];

  // weighted: normal most likely
  const r = Math.random();
  let pick;
  if (r < 0.55) pick = conditions[0];
  else if (r < 0.72) pick = conditions[1];
  else if (r < 0.92) pick = conditions[2];
  else pick = conditions[3];

  state.market = pick.key;
  state.macroMul = pick.mul;
}

// ------------------ Render ------------------
function renderAll() {
  // header KPIs
  UI.kpiDate.textContent = `Année : ${state.year} / Trimestre : Q${state.q}`;
  UI.kpiBrand.textContent = `${state.reputation}`;
  UI.kpiCash.textContent = fmtMoney(state.cash);
  UI.kpiMcap.textContent = fmtMoney(state.mcap);
  UI.kpiShare.textContent = `${state.share.toFixed(1)}%`;
  UI.kpiMacroText.textContent = marketLabel(state.market);

  // form values
  UI.tier.value = state.tier;
  UI.perf.value = state.quality;
  UI.perfVal.textContent = `${state.quality}`;
  UI.price.value = state.price;
  UI.rnd.value = state.rnd;
  UI.osMode.value = state.osMode;

  // os
  UI.osMaturity.textContent = `${state.osMaturity}`;
  UI.devAttract.textContent = `${state.devEcosystem}`;
  UI.devBar.style.width = `${clamp(state.devEcosystem,0,100)}%`;

  // production
  UI.capacity.value = state.capacity;
  UI.qprocess.value = state.qprocess;
  UI.stock.value = state.stock;
  UI.buy.value = state.buy;
  UI.defectPreview.textContent = `${(defectRate()*100).toFixed(1)}%`;

  // market
  UI.mkt.value = state.marketing;
  UI.channel.value = state.channel;

  // derived
  const attract = computeProductAttractiveness();
  UI.prodAttract.textContent = `${attract}`;
  UI.marketInterest.textContent = marketInterestText(attract);

  // market readout (simple)
  UI.marketReadout.textContent =
`Conjoncture : ${marketLabel(state.market)} (impact global x${state.macroMul.toFixed(2)})
Attractivité : ${attract}/100
Objectif : optimiser l'équilibre marge (prix) / volume (demande) / qualité (SAV & réputation).`;

  // hide dev eco if license? (optional)
  const devRow = document.getElementById("dev-row");
  if (state.osMode === "license") devRow.style.opacity = "0.55";
  else devRow.style.opacity = "1.0";
}

// ------------------ Storage ------------------
function saveState() {
  localStorage.setItem(LS_KEYS.state, JSON.stringify(state));
}

function loadState() {
  try{
    const raw = localStorage.getItem(LS_KEYS.state);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

// ------------------ Helpers ------------------
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function toInt(v){ return parseInt(String(v || "0"), 10) || 0; }

function fmtMoney(n){
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(Math.round(n));
  if (x >= 1_000_000_000) return `${sign}$${(x/1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `${sign}$${(x/1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `${sign}$${(x/1_000).toFixed(1)}k`;
  return `${sign}$${x}`;
}

function fmtInt(n){
  return (Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function marketLabel(key){
  if (key === "boom") return "Boom";
  if (key === "downturn") return "Ralentissement";
  if (key === "crash") return "Crise";
  return "Marché normal";
}

// ------------------ Tip bubble (simple) ------------------
let tipEl = null;
function showTip(title, text){
  if (tipEl) tipEl.remove();

  tipEl = document.createElement("div");
  tipEl.className = "tip-bubble";
  tipEl.innerHTML = `
    <button class="tip-close" aria-label="Fermer">×</button>
    <div class="tip-title">${escapeHtml(title)}</div>
    <div>${escapeHtml(text)}</div>
  `;
  document.body.appendChild(tipEl);

  tipEl.querySelector(".tip-close").addEventListener("click", () => {
    tipEl?.remove();
    tipEl = null;
  });

  // auto close
  setTimeout(() => {
    tipEl?.remove();
    tipEl = null;
  }, 6000);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toast(msg){
  // ultra minimal: utilise tooltip style pour un feedback
  showTip("Info", msg);
}

// ------------------ Boot ------------------
(function boot(){
  if (hasCompany()){
    applyBrandFromStorage();
    // show game directly
    UI.intro.style.display = "none";
    UI.header.style.display = "block";
    UI.main.style.display = "block";
    UI.nav.style.display = "flex";
    bindEvents();
    renderAll();
  } else {
    // intro first
    UI.intro.style.display = "flex";
    UI.header.style.display = "none";
    UI.main.style.display = "none";
    UI.nav.style.display = "none";
    initIntro();
  }

  // default screen
  showScreen("product");
})();
