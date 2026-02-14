// Smartphone Tycoon – Prototype V1 (mobile web, no build)
// Works with the provided index.html ids.
// Save key:
const KEY = "st_proto_v1";

// ---------- Helpers ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const fmtMoney = (n) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

const $ = (id) => document.getElementById(id);

// ---------- Default state ----------
function defaultState() {
  return {
    // Time
    year: 2000,
    q: 1, // 1..4

    // Core business
    cash: 250_000,
    debt: 0,
    brand: 35,       // Indice de Marque (0..100)
    share: 0.08,     // Player market share (0..1)
    mcap: 2_000_000, // Market cap
    macro: 1.0,      // Macro multiplier (0.9..~1.25)

    // OS
    osMode: "license", // license | closed | open
    osMaturity: 10,    // 0..100
    devAttract: 10,    // 0..100
    osRoyaltyRate: 0.06, // revenue royalty if license

    // Product knobs (single model V1)
    tier: "mainstream", // budget | mainstream | premium
    price: 399,
    perf: 55,
    rnd: 30_000,

    // Market knobs
    marketing: 20_000,
    channel: "retail", // b2b | retail | carrier

    // Ops
    capacity: 1000,
    qprocess: 45, // 0..100
    stock: 1200,
    buy: 1000,

    // World
    rivalsPower: 1.0, // simple pressure factor
    touch: { started: false, intensity: 0 }, // 0..1

    // Last report snapshot
    last: null,
  };
}

// ---------- Persistence ----------
function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return { ...defaultState(), ...s };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---------- UI bindings ----------
const UI = {
  // KPIs
  kpiDate: $("kpi-date"),
  kpiBrand: $("kpi-brand"),
  kpiCash: $("kpi-cash"),
  kpiMcap: $("kpi-mcap"),
  kpiShare: $("kpi-share"),
  kpiMacro: $("kpi-macro"),

  // Product
  tier: $("product-tier"),
  price: $("price"),
  perf: $("perf"),
  perfVal: $("perf-val"),
  rnd: $("rnd"),
  osMode: $("os-mode"),
  osOpen: $("os-openness"),
  osMaturity: $("os-maturity"),
  devAttract: $("dev-attract"),
  demandPreview: $("demand-preview"),

  // Production
  capacity: $("capacity"),
  qprocess: $("qprocess"),
  stock: $("stock"),
  buy: $("buy"),
  defectPreview: $("defect-preview"),

  // Market
  mkt: $("mkt"),
  channel: $("channel"),
  marketReadout: $("market-readout"),

  // Report
  report: $("report"),
  btnNext: $("btn-next"),

  // Misc
  btnSave: $("btn-save"),
  btnReset: $("btn-reset"),
};

// ---------- Economy model (simple, coherent) ----------
const SEG = {
  budget:     { baseShare: 0.38, priceRef: 199, elasticity: 1.35, perfWeight: 0.25 },
  mainstream: { baseShare: 0.44, priceRef: 399, elasticity: 1.00, perfWeight: 0.45 },
  premium:    { baseShare: 0.18, priceRef: 799, elasticity: 0.70, perfWeight: 0.55 },
};

const CH = {
  b2b:    { demand: 0.80, margin: 1.05 },
  retail: { demand: 1.00, margin: 1.00 },
  carrier:{ demand: 1.18, margin: 0.93 },
};

function brandDemandFactor(IM) {
  // IM 0..100 => 1..1.5
  return 1 + IM / 200;
}

function priceElasticityAdjusted(elasticity, IM) {
  // Higher IM => less price sensitive
  return elasticity * (1.05 - (IM / 100) * 0.35); // IM 0 => 1.05x ; IM 100 => 0.70x
}

function defectPenaltyAdjusted(IM) {
  // Higher IM => less reputation damage
  return clamp(1.0 - (IM / 100) * 0.55, 0.4, 1.0);
}

function loyalty(IM) {
  // IM 0..100 => 0..0.5
  return IM / 200;
}

// Base market size by era (units per quarter). Touch boosts it.
function marketBaseUnits(year, touch) {
  let base;
  if (year <= 2006) base = 20000 + (year - 2000) * 1200;
  else if (year <= 2012) base = 28000 + (year - 2007) * 6500; // boom era
  else if (year <= 2020) base = 65000 + (year - 2013) * 2500;
  else base = 85000 + (year - 2021) * 700;

  const touchBoost = 1 + (touch.intensity * (year <= 2012 ? 0.55 : 0.15));
  return Math.max(5000, Math.round(base * touchBoost));
}

function unitCost(year, tier, perf) {
  const tierBase = tier === "budget" ? 120 : tier === "mainstream" ? 190 : 330;
  const perfAdj = 0.9 + (perf / 100) * 0.8;
  const eraAdj = year < 2007 ? 1.10 : year < 2013 ? 1.05 : year < 2021 ? 1.00 : 1.03;
  return Math.round(tierBase * perfAdj * eraAdj);
}

function defectRate(state) {
  const base = 0.06;
  const proc = base - (state.qprocess / 100) * 0.035;

  // OS maturity affects stability: license is stable baseline
  const os = state.osMode === "license"
    ? -0.008
    : (0.012 - (state.osMaturity / 100) * 0.020);

  const tier = state.tier === "budget" ? 0.012 : state.tier === "premium" ? -0.006 : 0.0;
  return clamp(proc + os + tier, 0.008, 0.12);
}

function demandEstimate(state) {
  const baseUnits = marketBaseUnits(state.year, state.touch);
  const seg = SEG[state.tier];
  const ch = CH[state.channel];

  const segmentUnits = baseUnits * seg.baseShare;

  const elas = priceElasticityAdjusted(seg.elasticity, state.brand);
  const priceFactor = Math.pow(seg.priceRef / Math.max(50, state.price), elas);

  const perfFactor = 0.85 + (state.perf / 100) * seg.perfWeight;
  const mktFactor = 1 + Math.log10(1 + state.marketing / 20000) * 0.22;
  const brandFactor = brandDemandFactor(state.brand);

  // OS factor
  let osFactor = 1.0;
  if (state.osMode === "closed") {
    osFactor = 0.92 + (state.osMaturity / 100) * 0.25 + (state.brand / 100) * 0.12;
  } else if (state.osMode === "open") {
    osFactor = 0.95 + (state.osMaturity / 100) * 0.22 + (state.devAttract / 100) * 0.10;
  } else {
    osFactor = 1.00 + (state.osMaturity / 100) * 0.05;
  }

  const rival = 1 / state.rivalsPower;
  const units = segmentUnits * priceFactor * perfFactor * mktFactor * brandFactor * osFactor * ch.demand * rival;

  return Math.max(0, Math.round(units));
}

function updateMacro(state) {
  let m = state.macro;
  m += (Math.random() - 0.5) * 0.03;
  m = clamp(m, 0.90, 1.15);

  const r = Math.random();
  if (r < 0.015) m = clamp(m + 0.08, 0.90, 1.25); // mini bubble
  if (r > 0.985) m = clamp(m - 0.08, 0.80, 1.15); // mini crash

  state.macro = m;
}

function maybeAdvanceTouch(state) {
  if (state.touch.started) {
    const step = state.year <= 2012 ? 0.08 : 0.02;
    state.touch.intensity = clamp(state.touch.intensity + step, 0, 1);
    return;
  }

  if (state.year < 2005) return;

  if (state.year > 2009) {
    state.touch.started = true;
    state.touch.intensity = 0.25;
    return;
  }

  // Hybrid trigger: innovation from player + rivals + time
  const baseP = 0.08 + (state.year - 2005) * 0.05;
  const playerP =
    (state.rnd / 150000) * 0.08 +
    (state.perf / 100) * 0.03 +
    (state.osMaturity / 100) * 0.03;

  const aiP = 0.10 + (state.rivalsPower - 1.0) * 0.06;
  const p = clamp(baseP + playerP + aiP, 0.08, 0.55);

  if (Math.random() < p) {
    state.touch.started = true;
    // Smoother if brand is higher (premium-like starter)
    state.touch.intensity = state.brand >= 60 ? 0.18 : state.brand >= 40 ? 0.22 : 0.28;
  }
}

function advanceOS(state) {
  if (state.osMode === "license") {
    state.osMaturity = clamp(state.osMaturity + 1, 10, 40);
    state.devAttract = clamp(state.devAttract + 1, 5, 30);
    return;
  }

  const spend = state.rnd;
  const gain = Math.log10(1 + spend / 20000) * (state.osMode === "open" ? 2.2 : 1.8);
  state.osMaturity = clamp(state.osMaturity + gain, 0, 100);

  const openBoost = state.osMode === "open" ? 1.3 : 0.8;
  state.devAttract = clamp(
    state.devAttract + (state.osMaturity / 100) * 1.2 * openBoost + (state.brand / 100) * 0.6,
    0,
    100
  );
}

function updateRivals(state, shareBefore) {
  const delta = state.share - shareBefore;
  state.rivalsPower = clamp(
    state.rivalsPower + (delta < 0 ? 0.04 : -0.03) + (Math.random() - 0.5) * 0.02,
    0.85,
    1.25
  );
}

function updateBrand(state, sold, demand, defect, profit) {
  let delta = 0;

  const sellThrough = demand > 0 ? sold / demand : 0;
  if (sellThrough > 0.85) delta += 1;
  if (sellThrough < 0.45) delta -= 1;

  if (defect < 0.03) delta += 1;
  if (defect > 0.06) delta -= 2;

  // Positioning coherence
  if (state.tier === "premium" && state.brand < 50) delta -= 1;
  if (state.tier === "budget" && state.brand > 70) delta -= 1;

  if (profit > 0) delta += 1;
  if (profit < 0) delta -= 1;

  // Apply tolerance
  delta = Math.round(delta * defectPenaltyAdjusted(state.brand));

  state.brand = clamp(state.brand + delta, 0, 100);
}

function applyDebtInterest(state) {
  if (state.debt <= 0) return 0;
  const rate = state.year < 2007 ? 0.015 : state.year < 2013 ? 0.02 : 0.025; // per quarter
  const interest = Math.round(state.debt * rate);
  state.cash -= interest;
  return interest;
}

function fundamentalValue(state, profit) {
  const profitAnnual = profit * 4;
  const baseMultiple = 8 + (state.brand / 100) * 6 + (state.osMaturity / 100) * 4; // 8..18
  const scale = 1 + state.share * 1.5;
  const osBonus = state.osMode === "open" ? 1 + (state.devAttract / 100) * 0.15 : 1.0;

  const computed = Math.max(0, profitAnnual) * baseMultiple * scale * osBonus;

  const floor = 500_000 + state.brand * 20_000 + state.share * 20_000_000;
  return Math.round(Math.max(floor, computed));
}

// ---------- Simulation step ----------
function runQuarter(state) {
  const shareBefore = state.share;

  // World evolution
  updateMacro(state);
  maybeAdvanceTouch(state);
  advanceOS(state);

  // Costs
  const bom = unitCost(state.year, state.tier, state.perf);

  // Buy components
  const buyCost = state.buy * bom;
  state.stock += state.buy;
  state.cash -= buyCost;

  // Fixed costs
  const fixed = Math.round(25_000 + state.capacity * 6 + (state.osMode !== "license" ? 12_000 : 6_000));
  state.cash -= fixed;

  // Spend R&D and marketing
  state.cash -= state.rnd;
  state.cash -= state.marketing;

  // Production
  const producible = Math.min(state.capacity, state.stock);
  state.stock -= producible;

  const defect = defectRate(state);
  const goodUnits = Math.max(0, Math.round(producible * (1 - defect)));
  const badUnits = producible - goodUnits;

  // Demand and sales
  const demand = demandEstimate(state);
  const sold = Math.min(goodUnits, demand);

  // Revenue
  const ch = CH[state.channel];
  const revenue = Math.round(sold * state.price * ch.margin);

  // Royalties if license OS
  const royalties = state.osMode === "license" ? Math.round(revenue * state.osRoyaltyRate) : 0;

  // Warranty cost (simplified)
  const warranty = Math.round(badUnits * bom * 0.6);

  state.cash += revenue;
  state.cash -= royalties;
  state.cash -= warranty;

  // Interest
  const interest = applyDebtInterest(state);

  // Auto debt safety net (gentler pre-2007)
  let newDebt = 0;
  if (state.cash < 0) {
    const limit = state.year < 2007 ? 400_000 : 250_000;
    const needed = Math.min(limit, Math.abs(state.cash) + 50_000);
    newDebt = needed;
    state.debt += needed;
    state.cash += needed;
  }

  // Profit (approx)
  const profit = revenue - buyCost - fixed - state.rnd - state.marketing - royalties - warranty - interest;

  // Market share update (simplified)
  const totalMarket = marketBaseUnits(state.year, state.touch);
  const immediateShare = clamp(0.03 + (sold / Math.max(1, totalMarket)) * 0.9, 0.01, 0.65);

  // Loyalty stabilizes share changes
  const loy = loyalty(state.brand);
  state.share = clamp(
    state.share * (0.85 + loy) + immediateShare * (0.15 + (1 - loy) * 0.35),
    0.01,
    0.65
  );

  // Brand update
  updateBrand(state, sold, demand, defect, profit);

  // Rival pressure evolves
  updateRivals(state, shareBefore);

  // Valuation
  const fundamentals = fundamentalValue(state, profit);
  state.mcap = Math.round(fundamentals * state.macro);

  // Save last report
  state.last = {
    year: state.year,
    q: state.q,
    tier: state.tier,
    price: state.price,
    perf: state.perf,
    osMode: state.osMode,
    osMaturity: state.osMaturity,
    devAttract: state.devAttract,
    bom,
    buyCost,
    fixed,
    revenue,
    royalties,
    warranty,
    interest,
    producible,
    goodUnits,
    badUnits,
    demand,
    sold,
    profit,
    brandAfter: state.brand,
    shareBefore,
    shareAfter: state.share,
    macro: state.macro,
    debt: state.debt,
    cash: state.cash,
    touchStarted: state.touch.started,
    touchIntensity: state.touch.intensity,
    rivalsPower: state.rivalsPower,
    newDebt,
  };

  // Advance time
  state.q += 1;
  if (state.q === 5) {
    state.q = 1;
    state.year += 1;
  }

  saveState(state);
}

// ---------- UI sync ----------
function syncUI(state) {
  // ✅ EXACTEMENT ce que tu veux
  UI.kpiDate.textContent = `Année : ${state.year} / Trimestre : Q${state.q}`;

  UI.kpiBrand.textContent = `${Math.round(state.brand)}`;
  UI.kpiCash.textContent = fmtMoney(state.cash);
  UI.kpiMcap.textContent = fmtMoney(state.mcap);
  UI.kpiShare.textContent = pct(state.share);
  UI.kpiMacro.textContent = `Macro × ${state.macro.toFixed(2)}`;

  // Inputs (reflect state)
  UI.tier.value = state.tier;
  UI.price.value = state.price;
  UI.perf.value = state.perf;
  UI.perfVal.textContent = `${state.perf}`;
  UI.rnd.value = state.rnd;

  UI.osMode.value = state.osMode;
  UI.osOpen.value = state.osMode === "license" ? "n/a" : (state.osMode === "open" ? "open" : "closed");
  UI.osMaturity.textContent = `${Math.round(state.osMaturity)}`;
  UI.devAttract.textContent = `${Math.round(state.devAttract)}`;

  UI.capacity.value = state.capacity;
  UI.qprocess.value = state.qprocess;
  UI.stock.value = state.stock;
  UI.buy.value = state.buy;

  UI.mkt.value = state.marketing;
  UI.channel.value = state.channel;

  // Previews
  UI.demandPreview.textContent = `${demandEstimate(state)}`;
  UI.defectPreview.textContent = `${(defectRate(state) * 100).toFixed(1)}%`;

  // Market readout
  const base = marketBaseUnits(state.year, state.touch);
  const segPct = Math.round(SEG[state.tier].baseShare * 100);
  UI.marketReadout.textContent =
`Marché total estimé : ${base} unités / trimestre
Segment ${state.tier} : ${segPct}% du marché
Demande estimée (toi) : ${demandEstimate(state)} unités
Coût BOM estimé : $${unitCost(state.year, state.tier, state.perf)} / unité
Tactile : ${state.touch.started ? "oui" : "non"} (intensité ${(state.touch.intensity * 100).toFixed(0)}%)
Pression rivaux : × ${(1 / state.rivalsPower).toFixed(2)}
`;

  // Report
  if (!state.last) return;

  UI.report.textContent =
`Bilan ${state.last.year} Q${state.last.q}

Produit : ${state.last.tier} | Prix : $${state.last.price} | Perf : ${state.last.perf}
OS : ${state.last.osMode} | Maturité : ${Math.round(state.last.osMaturity)} | Dev : ${Math.round(state.last.devAttract)}

Production : ${state.last.producible} (bons : ${state.last.goodUnits}, défauts/SAV : ${state.last.badUnits})
Demande : ${state.last.demand} | Ventes : ${state.last.sold}

CA : ${fmtMoney(state.last.revenue)}
Royalties OS : ${fmtMoney(state.last.royalties)}
Achats composants : ${fmtMoney(state.last.buyCost)}
Coûts fixes : ${fmtMoney(state.last.fixed)}
SAV (garantie) : ${fmtMoney(state.last.warranty)}
Intérêts : ${fmtMoney(state.last.interest)}

Profit (approx) : ${fmtMoney(state.last.profit)}
Cash : ${fmtMoney(state.last.cash)} | Dette : ${fmtMoney(state.last.debt)}${state.last.newDebt ? ` (nouvelle dette : ${fmtMoney(state.last.newDebt)})` : ""}

IM : ${Math.round(state.last.brandAfter)}
Parts : ${(state.last.shareBefore * 100).toFixed(1)}% → ${(state.last.shareAfter * 100).toFixed(1)}%
Macro : ×${state.last.macro.toFixed(2)} | Valo : ${fmtMoney(state.mcap)}
`;
}

// ---------- Events ----------
function bindEvents(state) {
  // Product
  UI.tier.addEventListener("change", () => { state.tier = UI.tier.value; saveState(state); syncUI(state); });
  UI.price.addEventListener("input", () => { state.price = Number(UI.price.value); saveState(state); syncUI(state); });
  UI.perf.addEventListener("input", () => { state.perf = Number(UI.perf.value); saveState(state); syncUI(state); });
  UI.rnd.addEventListener("input", () => { state.rnd = Number(UI.rnd.value); saveState(state); syncUI(state); });

  UI.osMode.addEventListener("change", () => {
    state.osMode = UI.osMode.value;
    UI.osOpen.value = state.osMode === "license" ? "n/a" : (state.osMode === "open" ? "open" : "closed");
    saveState(state);
    syncUI(state);
  });

  // Production
  UI.capacity.addEventListener("input", () => { state.capacity = Number(UI.capacity.value); saveState(state); syncUI(state); });
  UI.qprocess.addEventListener("input", () => { state.qprocess = Number(UI.qprocess.value); saveState(state); syncUI(state); });
  UI.stock.addEventListener("input", () => { state.stock = Number(UI.stock.value); saveState(state); syncUI(state); });
  UI.buy.addEventListener("input", () => { state.buy = Number(UI.buy.value); saveState(state); syncUI(state); });

  // Market
  UI.mkt.addEventListener("input", () => { state.marketing = Number(UI.mkt.value); saveState(state); syncUI(state); });
  UI.channel.addEventListener("change", () => { state.channel = UI.channel.value; saveState(state); syncUI(state); });

  // Actions
  UI.btnNext.addEventListener("click", () => {
    runQuarter(state);
    syncUI(state);
  });

  UI.btnSave.addEventListener("click", () => {
    saveState(state);
    alert("Sauvé ✅");
  });

  UI.btnReset.addEventListener("click", () => {
    if (!confirm("Reset la run ?")) return;
    const fresh = defaultState();
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, fresh);
    saveState(state);
    syncUI(state);
  });

  // Navigation
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const scr = btn.getAttribute("data-screen");
      ["product", "production", "market", "report"].forEach((s) => {
        const sec = document.getElementById(`screen-${s}`);
        if (sec) sec.style.display = (s === scr) ? "" : "none";
      });
    });
  });
}

// ---------- Boot ----------
const state = loadState();
bindEvents(state);
syncUI(state);
saveState(state);
