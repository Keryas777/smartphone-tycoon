// Smartphone Tycoon - app.js (patchs + chips)
// - Patch 3: theme-color dynamique iOS
// - Chips: tier + stratégie OS

const LS_KEYS = {
  companyName: "st_companyName",
  theme: "st_theme",
  state: "st_state_v1"
};

const THEMES = [
  { name:"Indigo/Lime", accent:"#6c7cff", accent2:"#b6ff5a", bg:"#0b0f18", panel:"#121827", interactive:"#1b2242", border:"#2a3356", text:"#e6e9f2", muted:"#9aa3bd" },
  { name:"Navy/Coral",   accent:"#2a5bd7", accent2:"#ff6b6b", bg:"#07101f", panel:"#101a2d", interactive:"#182749", border:"#243a63", text:"#eaf0ff", muted:"#a2acc8" },
  { name:"Black/Gold",   accent:"#c9a227", accent2:"#ffe08a", bg:"#07080b", panel:"#0f1116", interactive:"#171a22", border:"#2a2f3d", text:"#f2f2f2", muted:"#b6b6b6" },
  { name:"Purple/Cyan",  accent:"#a855f7", accent2:"#22d3ee", bg:"#090818", panel:"#14122a", interactive:"#1d1a3b", border:"#2e2a55", text:"#f3f1ff", muted:"#b9b3df" },
  { name:"Emerald/Amber",accent:"#10b981", accent2:"#f59e0b", bg:"#07110f", panel:"#0e1a17", interactive:"#122824", border:"#1f3a35", text:"#eafff7", muted:"#a7d2c7" },
  { name:"Steel/Electric",accent:"#60a5fa",accent2:"#93c5fd", bg:"#0a0f16", panel:"#141a22", interactive:"#1c2430", border:"#2b3746", text:"#eef5ff", muted:"#a7b4c7" },
  { name:"Magenta/Orange",accent:"#ff3bbf",accent2:"#ff9f1c", bg:"#0f0710", panel:"#1a0f1a", interactive:"#241224", border:"#3a1f3a", text:"#fff1fb", muted:"#d7a8c9" },
  { name:"Teal/Violet",  accent:"#14b8a6", accent2:"#8b5cf6", bg:"#071112", panel:"#0f1a1a", interactive:"#132525", border:"#1f3c3c", text:"#eaffff", muted:"#a6d1d1" },
];

const DEFAULT_STATE = {
  year: 2000,
  q: 1,

  reputation: 35,
  cash: 250000,
  mcap: 2000000,
  share: 8.0,

  market: "normal",
  macroMul: 1.0,

  tier: "mainstream",
  quality: 55,
  price: 399,
  rnd: 30000,

  osMode: "license",
  osMaturity: 10,
  devEcosystem: 10,

  capacity: 1000,
  qprocess: 45,
  stock: 1200,
  buy: 1000,

  marketing: 20000,
  channel: "retail"
};

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }
const $ = (id) => document.getElementById(id);

const UI = {
  intro: $("intro-screen"),
  paletteGrid: $("palette-grid"),
  companyName: $("company-name"),
  startBtn: $("start-btn"),

  header: $("header"),
  main: $("main"),
  nav: $("nav"),

  companyTitle: $("company-title"),

  kpiDate: $("kpi-date"),
  kpiBrand: $("kpi-brand"),
  kpiCash: $("kpi-cash"),
  kpiMcap: $("kpi-mcap"),
  kpiShare: $("kpi-share"),
  kpiMacroText: $("kpi-macro-value"),

  tierChips: $("tier-chips"),
  osChips: $("os-chips"),

  perf: $("perf"),
  perfVal: $("perf-val"),
  price: $("price"),
  rnd: $("rnd"),

  osMaturity: $("os-maturity"),
  devAttract: $("dev-attract"),
  prodAttract: $("prod-attract"),
  marketInterest: $("market-interest"),
  btnSave: $("btn-save"),
  btnReset: $("btn-reset"),

  capacity: $("capacity"),
  qprocess: $("qprocess"),
  stock: $("stock"),
  buy: $("buy"),
  defectPreview: $("defect-preview"),

  mkt: $("mkt"),
  channel: $("channel"),
  marketReadout: $("market-readout"),

  report: $("report"),
  btnNext: $("btn-next"),
};

let state = loadState();
let eventsBound = false;

// ------------------ Theme ------------------
function getStoredTheme(){
  try{
    const raw = localStorage.getItem(LS_KEYS.theme);
    if (!raw) return THEMES[0];
    const t = JSON.parse(raw);
    if (!t || !t.accent || !t.bg) return THEMES[0];
    return t;
  } catch { return THEMES[0]; }
}

function applyTheme(t){
  const root = document.documentElement.style;

  root.setProperty("--accent", t.accent);
  root.setProperty("--accent2", t.accent2);

  root.setProperty("--bg", t.bg);
  root.setProperty("--panel", t.panel);
  root.setProperty("--interactive", t.interactive);
  root.setProperty("--border", t.border);

  root.setProperty("--text", t.text);
  root.setProperty("--muted", t.muted);

  root.setProperty("--action-border", hexToRgba(t.accent, 0.55));
  root.setProperty("--action-border-strong", hexToRgba(t.accent, 0.85));
  root.setProperty("--focus-ring", hexToRgba(t.accent, 0.30));

  // PATCH 3: theme-color (barre Safari / PWA)
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name","theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", t.bg);
}

function hexToRgba(hex, a){
  const h = hex.replace("#","").trim();
  const full = h.length === 3 ? h.split("").map(c=>c+c).join("") : h;
  const r = parseInt(full.slice(0,2),16);
  const g = parseInt(full.slice(2,4),16);
  const b = parseInt(full.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------ Intro ------------------
function hasCompany(){ return !!localStorage.getItem(LS_KEYS.companyName); }

function initIntro(){
  UI.paletteGrid.innerHTML = "";
  let selected = THEMES[0];

  applyTheme(selected);

  THEMES.forEach((theme, idx) => {
    const div = document.createElement("div");
    div.className = "palette";
    div.style.background = `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`;

    const dot = document.createElement("span");
    dot.className = "dot";
    div.appendChild(dot);

    div.addEventListener("click", () => {
      UI.paletteGrid.querySelectorAll(".palette").forEach(p => p.classList.remove("selected"));
      div.classList.add("selected");
      selected = theme;
      applyTheme(selected);
    });

    if (idx === 0) div.classList.add("selected");
    UI.paletteGrid.appendChild(div);
  });

  UI.startBtn.onclick = () => {
    const name = (UI.companyName.value || "").trim();
    if (!name) return alert("Choisis un nom d'entreprise.");

    localStorage.setItem(LS_KEYS.companyName, name);
    localStorage.setItem(LS_KEYS.theme, JSON.stringify(selected));
    startGame();
  };

  UI.companyName.onkeydown = (e) => {
    if (e.key === "Enter") UI.startBtn.click();
  };
}

function startGame(){
  applyTheme(getStoredTheme());

  UI.intro.style.display = "none";
  UI.header.style.display = "block";
  UI.main.style.display = "block";
  UI.nav.style.display = "flex";

  UI.companyTitle.textContent = localStorage.getItem(LS_KEYS.companyName) || "Entreprise";

  bindEvents();
  renderAll();
  showScreen("product");
}

// ------------------ Screens ------------------
function showScreen(name){
  const screens = {
    product: $("screen-product"),
    production: $("screen-production"),
    market: $("screen-market"),
    report: $("screen-report")
  };

  Object.values(screens).forEach(s => { if (s) s.style.display = "none"; });
  if (screens[name]) screens[name].style.display = "block";

  UI.nav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  UI.nav.querySelector(`button[data-screen="${name}"]`)?.classList.add("active");
}

// ------------------ Chips ------------------
function bindChipGroup(container, onPick){
  if (!container) return;
  container.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => onPick(btn.getAttribute("data-value")));
  });
}

function setChipActive(container, value){
  if (!container) return;
  container.querySelectorAll(".chip").forEach(btn => {
    const isActive = btn.getAttribute("data-value") === value;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

// ------------------ Events ------------------
function bindEvents(){
  if (eventsBound) return;
  eventsBound = true;

  UI.nav.querySelectorAll("button[data-screen]").forEach(btn => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });

  // CHIPS
  bindChipGroup(UI.tierChips, (val) => { state.tier = val; renderAll(); });
  bindChipGroup(UI.osChips, (val) => { state.osMode = val; renderAll(); });

  // sliders / inputs
  UI.perf.addEventListener("input", () => { state.quality = toInt(UI.perf.value); renderAll(); });
  UI.price.addEventListener("input", () => { state.price = toInt(UI.price.value); renderAll(); });
  UI.rnd.addEventListener("input", () => { state.rnd = toInt(UI.rnd.value); renderAll(); });

  UI.capacity.addEventListener("input", () => { state.capacity = toInt(UI.capacity.value); renderAll(); });
  UI.qprocess.addEventListener("input", () => { state.qprocess = toInt(UI.qprocess.value); renderAll(); });
  UI.stock.addEventListener("input", () => { state.stock = toInt(UI.stock.value); renderAll(); });
  UI.buy.addEventListener("input", () => { state.buy = toInt(UI.buy.value); renderAll(); });

  UI.mkt.addEventListener("input", () => { state.marketing = toInt(UI.mkt.value); renderAll(); });
  UI.channel.addEventListener("change", () => { state.channel = UI.channel.value; renderAll(); });

  UI.btnSave.addEventListener("click", () => { saveState(); toast("Sauvegardé."); });

  UI.btnReset.addEventListener("click", () => {
    if (!confirm("Reset complet ? (Entreprise + partie)")) return;
    localStorage.removeItem(LS_KEYS.companyName);
    localStorage.removeItem(LS_KEYS.theme);
    localStorage.removeItem(LS_KEYS.state);
    location.reload();
  });

  UI.btnNext.addEventListener("click", () => nextQuarter());

  // tooltips
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".has-tip");
    if (!el) return;
    const tip = el.getAttribute("data-tip");
    if (!tip) return;
    showTip(el.textContent.trim(), tip);
  });
}

// ------------------ Logic (simple) ------------------
function computeProductAttractiveness(){
  const tierIdealPrice = (state.tier === "budget") ? 199 : (state.tier === "premium" ? 799 : 399);
  const pricePenalty = clamp(Math.abs(state.price - tierIdealPrice) / tierIdealPrice, 0, 1) * 35;

  let score = 0;
  score += (state.quality * 0.55);
  score += (state.reputation * 0.35);
  score -= pricePenalty;
  score += clamp(state.osMaturity / 100, 0, 1) * 8;

  return clamp(Math.round(score), 0, 100);
}

function marketInterestText(attract){
  if (attract >= 85) return "Très fort";
  if (attract >= 70) return "Fort";
  if (attract >= 55) return "Correct";
  if (attract >= 40) return "Faible";
  return "Très faible";
}

function defectRate(){
  const base = 0.12;
  const process = clamp(state.qprocess / 100, 0, 1);
  const maturity = clamp(state.osMaturity / 100, 0, 1);
  const quality = clamp(state.quality / 100, 0, 1);

  let rate = base;
  rate -= process * 0.07;
  rate -= maturity * 0.03;
  rate -= quality * 0.02;

  return clamp(rate, 0.01, 0.15);
}

function updateOSProgress(){
  const rnd = state.rnd;

  if (state.osMode === "license") {
    state.osMaturity = clamp(state.osMaturity + Math.round(rnd / 150000), 0, 40);
    return;
  }

  const mBoost = Math.round(rnd / 60000);
  state.osMaturity = clamp(state.osMaturity + mBoost, 0, 100);

  const ecoBoost = (state.osMode === "open") ? Math.round(rnd / 90000) : Math.round(rnd / 140000);
  state.devEcosystem = clamp(state.devEcosystem + ecoBoost, 0, 100);
}

function computeDemand(attract){
  let base = (state.tier === "budget") ? 16000 : (state.tier === "premium" ? 9000 : 12000);
  const mktEff = Math.sqrt(Math.max(0, state.marketing)) * 4;
  const chMul = (state.channel === "carrier") ? 1.15 : (state.channel === "b2b" ? 0.75 : 1.0);

  const aMul = 0.60 + (attract / 100) * 0.70;
  const tierIdealPrice = (state.tier === "budget") ? 199 : (state.tier === "premium" ? 799 : 399);
  const priceMul = clamp(1.10 - (Math.abs(state.price - tierIdealPrice) / tierIdealPrice) * 0.55, 0.55, 1.10);

  const demand = (base + mktEff) * chMul * state.macroMul * aMul * priceMul;
  return Math.max(0, Math.round(demand));
}

function maybeChangeMarket(){
  if (Math.random() > 0.10) return;

  const r = Math.random();
  if (r < 0.55) { state.market = "normal"; state.macroMul = 1.00; }
  else if (r < 0.72) { state.market = "boom"; state.macroMul = 1.08; }
  else if (r < 0.92) { state.market = "downturn"; state.macroMul = 0.94; }
  else { state.market = "crash"; state.macroMul = 0.86; }
}

function nextQuarter(){
  updateOSProgress();

  // achat composants
  const componentCost = 65;
  const buyUnits = Math.max(0, toInt(state.buy));
  const buyCost = buyUnits * componentCost;
  state.stock += buyUnits;
  state.cash -= buyCost;

  // demande & ventes
  const attract = computeProductAttractiveness();
  const demand = computeDemand(attract);
  const canMake = Math.max(0, Math.min(state.capacity, state.stock));
  const sold = Math.max(0, Math.min(demand, canMake));
  state.stock -= sold;

  // coûts & revenus
  const royaltyPerUnit = (state.osMode === "license") ? 18 : 0;
  const unitCost = 140 + (state.quality * 0.6) + royaltyPerUnit;
  const revenue = sold * state.price;
  const cogs = sold * unitCost;

  // sav
  const dRate = defectRate();
  const defects = Math.round(sold * dRate);
  const warrantyCost = defects * 55;

  state.cash += revenue - cogs - warrantyCost - state.rnd - state.marketing;

  // réputation
  const repDelta =
    (attract >= 70 ? 1 : (attract < 45 ? -1 : 0)) +
    (defects > sold * 0.08 ? -2 : 0) +
    (state.cash < 0 ? -1 : 0);

  state.reputation = clamp(state.reputation + repDelta, 0, 100);

  // parts de marché / valo
  const soldScore = sold / 12000;
  state.share = clamp(state.share + (soldScore * 1.2) - 0.3, 0.5, 65);

  const profit = revenue - cogs - warrantyCost - state.rnd - state.marketing;
  const profitFactor = clamp(profit / 400000, -1, 2);
  state.mcap = Math.max(200000, Math.round(state.mcap * (1.0 + profitFactor * 0.03 + (repDelta * 0.002))));

  // temps
  state.q += 1;
  if (state.q === 5) { state.q = 1; state.year += 1; }

  maybeChangeMarket();

  // report
  UI.report.textContent =
`Entreprise : ${localStorage.getItem(LS_KEYS.companyName) || "—"}
Période : ${state.year} Q${state.q === 1 ? 4 : state.q - 1}

Ventes : ${fmtInt(sold)} unités (demande: ${fmtInt(demand)}, capacité+stock: ${fmtInt(canMake)})
Défauts/SAV : ${fmtInt(defects)} (${(dRate*100).toFixed(1)}%)

CA : ${fmtMoney(revenue)}
Coût prod + royalties : ${fmtMoney(cogs)}
SAV : ${fmtMoney(warrantyCost)}
R&D : ${fmtMoney(state.rnd)}
Marketing : ${fmtMoney(state.marketing)}

Profit estimé : ${fmtMoney(profit)}
Réputation : ${state.reputation}/100 (${repDelta>=0?"+":""}${repDelta})
Parts de marché : ${state.share.toFixed(1)}%
Valorisation : ${fmtMoney(state.mcap)}`;

  saveState();
  renderAll();
  showScreen("report");
}

// ------------------ Render ------------------
function renderAll(){
  setChipActive(UI.tierChips, state.tier);
  setChipActive(UI.osChips, state.osMode);

  UI.kpiDate.textContent = `Année : ${state.year} / Trimestre : Q${state.q}`;
  UI.kpiBrand.textContent = `${state.reputation}`;
  UI.kpiCash.textContent = fmtMoney(state.cash);
  UI.kpiMcap.textContent = fmtMoney(state.mcap);
  UI.kpiShare.textContent = `${state.share.toFixed(1)}%`;
  UI.kpiMacroText.textContent = marketLabel(state.market);

  UI.perf.value = state.quality;
  UI.perfVal.textContent = `${state.quality}`;
  UI.price.value = state.price;
  UI.rnd.value = state.rnd;

  UI.osMaturity.textContent = `${state.osMaturity}`;
  UI.devAttract.textContent = `${state.devEcosystem}`;

  UI.capacity.value = state.capacity;
  UI.qprocess.value = state.qprocess;
  UI.stock.value = state.stock;
  UI.buy.value = state.buy;
  UI.defectPreview.textContent = `${(defectRate()*100).toFixed(1)}%`;

  UI.mkt.value = state.marketing;
  UI.channel.value = state.channel;

  const attract = computeProductAttractiveness();
  UI.prodAttract.textContent = `${attract}`;
  UI.marketInterest.textContent = marketInterestText(attract);

  UI.marketReadout.textContent =
`Conjoncture : ${marketLabel(state.market)} (impact global x${state.macroMul.toFixed(2)})
Attractivité : ${attract}/100
Objectif : équilibrer marge (prix) / volume (demande) / qualité (SAV & réputation).`;
}

// ------------------ Storage ------------------
function saveState(){ localStorage.setItem(LS_KEYS.state, JSON.stringify(state)); }

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEYS.state);
    if (!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...deepClone(DEFAULT_STATE), ...parsed };
  } catch {
    return deepClone(DEFAULT_STATE);
  }
}

// ------------------ Helpers ------------------
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function toInt(v){ return parseInt(String(v||"0"),10) || 0; }

function fmtMoney(n){
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(Math.round(n));
  if (x >= 1_000_000_000) return `${sign}$${(x/1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `${sign}$${(x/1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `${sign}$${(x/1_000).toFixed(1)}k`;
  return `${sign}$${x}`;
}
function fmtInt(n){ return (Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

function marketLabel(key){
  if (key === "boom") return "Boom";
  if (key === "downturn") return "Ralentissement";
  if (key === "crash") return "Crise";
  return "Marché normal";
}

// ------------------ Tips ------------------
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
    tipEl?.remove(); tipEl = null;
  });

  setTimeout(() => { tipEl?.remove(); tipEl = null; }, 6000);
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function toast(msg){ showTip("Info", msg); }

// ------------------ Boot ------------------
window.addEventListener("DOMContentLoaded", () => {
  applyTheme(getStoredTheme());

  if (hasCompany()){
    UI.intro.style.display = "none";
    UI.header.style.display = "block";
    UI.main.style.display = "block";
    UI.nav.style.display = "flex";

    UI.companyTitle.textContent = localStorage.getItem(LS_KEYS.companyName) || "Entreprise";

    bindEvents();
    renderAll();
    showScreen("product");
  } else {
    UI.intro.style.display = "flex";
    UI.header.style.display = "none";
    UI.main.style.display = "none";
    UI.nav.style.display = "none";
    initIntro();
  }
});
