// Smartphone Tycoon – prototype V1 (no build)
// Save key
const KEY = "st_proto_v1";

// --- Helpers
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (n) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};
const pct = (x) => `${(x*100).toFixed(1)}%`;

// --- Game state
function defaultState() {
  return {
    year: 2000,
    q: 1,
    cash: 250000,         // start cash
    debt: 0,
    brand: 35,            // IM
    share: 0.08,          // market share (player)
    mcap: 2_000_000,      // market cap (valuation)
    macro: 1.0,           // macro multiplier

    osMode: "license",    // license | closed | open
    osMaturity: 10,       // 0..100
    devAttract: 10,       // 0..100 (mostly matters for open/closed OS)
    osRoyaltyRate: 0.06,  // on revenue if license (simplified)

    // Product knobs
    tier: "mainstream",
    price: 399,
    perf: 55,
    rnd: 30000,
    marketing: 20000,
    channel: "retail",

    // Ops
    capacity: 1000,
    qprocess: 45,
    stock: 1200,
    buy: 1000,

    // Last quarter results for report
    last: null,

    // Rivals abstraction (simple): total "market power" of rivals
    rivalsPower: 1.0,
    // Touch revolution state (simplified flags for later evolution)
    touch: { started: false, intensity: 0 }, // intensity 0..1
  };
}

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

// --- DOM
const el = (id) => document.getElementById(id);

const UI = {
  kpiDate: el("kpi-date"),
  kpiBrand: el("kpi-brand"),
  kpiCash: el("kpi-cash"),
  kpiMcap: el("kpi-mcap"),
  kpiShare: el("kpi-share"),
  kpiMacro: el("kpi-macro"),

  tier: el("product-tier"),
  price: el("price"),
  perf: el("perf"),
  perfVal: el("perf-val"),
  rnd: el("rnd"),
  osMode: el("os-mode"),
  osOpen: el("os-openness"),
  osMaturity: el("os-maturity"),
  devAttract: el("dev-attract"),
  demandPreview: el("demand-preview"),

  capacity: el("capacity"),
  qprocess: el("qprocess"),
  stock: el("stock"),
  buy: el("buy"),
  defectPreview: el("defect-preview"),

  mkt: el("mkt"),
  channel: el("channel"),
  marketReadout: el("market-readout"),

  report: el("report"),
  btnNext: el("btn-next"),
  btnSave: el("btn-save"),
  btnReset: el("btn-reset"),
};

let state = loadState();

// --- Model (simple but consistent with our design)

// Base market size evolves by era (very rough; units per quarter)
function marketBaseUnits(year, q, touch) {
  // Pre-touch smaller market; after touch ramp up then mature
  // 2000-2006: small, steady
  // 2007-2012: big ramp (if touch intensity grows)
  // 2013-2020: moderate growth
  // 2021-2030: mature
  let base = 20000;

  if (year <= 2006) base = 20000 + (year - 2000) * 1200;
  else if (year <= 2012) base = 28000 + (year - 2007) * 6500; // boom
  else if (year <= 2020) base = 65000 + (year - 2013) * 2500;
  else base = 85000 + (year - 2021) * 700;

  // Touch effect: boosts market size (temporary boom), intensity 0..1
  const touchBoost = 1 + (touch.intensity * (year <= 2012 ? 0.55 : 0.15));
  return Math.round(base * touchBoost);
}

// Segment parameters
const SEG = {
  budget:     { baseShare: 0.38, priceRef: 199, elasticity: 1.35, perfWeight: 0.25 },
  mainstream: { baseShare: 0.44, priceRef: 399, elasticity: 1.00, perfWeight: 0.45 },
  premium:    { baseShare: 0.18, priceRef: 799, elasticity: 0.70, perfWeight: 0.55 },
};

// Channel modifiers
const CH = {
  b2b:    { demand: 0.80, margin: 1.05 },
  retail: { demand: 1.00, margin: 1.00 },
  carrier:{ demand: 1.18, margin: 0.93 },
};

// Component cost per unit changes by era (simplified)
function unitCost(year, tier, perf) {
  // Base BOM rises with perf & tier
  const tierBase = tier === "budget" ? 120 : tier === "mainstream" ? 190 : 330;
  const perfAdj = 0.9 + (perf / 100) * 0.8; // 0.98..1.7 roughly
  // Era cost trend: early expensive, later cheaper to produce similar performance
  const eraAdj = year < 2007 ? 1.10 : year < 2013 ? 1.05 : year < 2021 ? 1.00 : 1.03;
  return Math.round(tierBase * perfAdj * eraAdj);
}

// Defect rate estimate
function defectRate(state) {
  // Base process defect reduced by qprocess
  const base = 0.06; // 6%
  const proc = base - (state.qprocess / 100) * 0.035; // up to -3.5%
  // OS maturity affects stability -> returns (software-related)
  const os = state.osMode === "license" ? -0.008 : (0.012 - (state.osMaturity/100)*0.020); // license stable
  const tier = state.tier === "budget" ? 0.012 : state.tier === "premium" ? -0.006 : 0.0;
  return clamp(proc + os + tier, 0.008, 0.12);
}

// Brand affects demand, price tolerance, defect tolerance, loyalty
function brandDemandFactor(IM) {
  return 1 + IM / 200; // 0..100 => 1..1.5
}
function priceElasticityAdjusted(elasticity, IM) {
  // Higher IM -> less price sensitivity
  return elasticity * (1.05 - (IM/100)*0.35); // IM 0 => 1.05x, IM 100 => 0.70x
}
function defectPenaltyAdjusted(IM) {
  // Higher IM -> less reputation damage
  const k = 1.0 - (IM/100)*0.55; // 0 =>1.0, 100=>0.45
  return clamp(k, 0.4, 1.0);
}
function loyalty(IM) {
  return IM / 200; // 0..100 => 0..0.5
}

// Demand for chosen tier only (V1). Later: multi-model portfolio.
function demandEstimate(state) {
  const baseUnits = marketBaseUnits(state.year, state.q, state.touch);
  const seg = SEG[state.tier];
  const ch = CH[state.channel];

  const segmentUnits = baseUnits * seg.baseShare;

  const elas = priceElasticityAdjusted(seg.elasticity, state.brand);
  const priceFactor = Math.pow(seg.priceRef / Math.max(50, state.price), elas);

  const perfFactor = 0.85 + (state.perf/100) * seg.perfWeight; // ~0.9..1.4
  const mktFactor = 1 + Math.log10(1 + state.marketing/20000) * 0.22; // diminishing returns
  const brandFactor = brandDemandFactor(state.brand);

  // OS factor: closed OS boosts premium loyalty/appeal, open boosts mainstream reach, license neutral
  let osFactor = 1.0;
  if (state.osMode === "closed") osFactor = 0.92 + (state.osMaturity/100)*0.25 + (state.brand/100)*0.12;
  if (state.osMode === "open")   osFactor = 0.95 + (state.osMaturity/100)*0.22 + (state.devAttract/100)*0.10;
  if (state.osMode === "license")osFactor = 1.00 + (state.osMaturity/100)*0.05;

  // Rival pressure (simple)
  const rival = 1 / state.rivalsPower;

  const units = segmentUnits * priceFactor * perfFactor * mktFactor * brandFactor * osFactor * ch.demand * rival;

  return Math.max(0, Math.round(units));
}

// Market cap fundamentals
function fundamentalValue(state, profit) {
  // Simple: multiple on profit + bonuses for growth/brand/os
  const profitAnnualized = profit * 4;
  const baseMultiple = 8 + (state.brand/100)*6 + (state.osMaturity/100)*4; // 8..18
  const scale = 1 + state.share * 1.5; // bigger share = higher base
  const osBonus = state.osMode === "open" ? 1 + (state.devAttract/100)*0.15 : 1.0;
  const v = Math.max(0, profitAnnualized) * baseMultiple * scale * osBonus;
  // If profit negative, still have some value: brand + share floor
  const floor = 500_000 + state.brand*20_000 + state.share*20_000_000;
  return Math.round(Math.max(floor, v));
}

function updateMacro(state) {
  // Light random walk macro around 1.0, with occasional "events"
  let m = state.macro;
  m += (Math.random() - 0.5) * 0.03;
  m = clamp(m, 0.90, 1.15);

  // Rare shocks
  const r = Math.random();
  if (r < 0.015) m = clamp(m + 0.08, 0.90, 1.25); // mini-bubble
  if (r > 0.985) m = clamp(m - 0.08, 0.80, 1.15); // mini-crash

  state.macro = m;
}

// Touch revolution (very simplified): increases intensity between 2005-2009
function maybeAdvanceTouch(state) {
  if (state.touch.started) {
    // intensity grows quickly until 2012 then slows
    const step = state.year <= 2012 ? 0.08 : 0.02;
    state.touch.intensity = clamp(state.touch.intensity + step, 0, 1);
    return;
  }
  // signals start 2003+, window 2005-2009 to start
  if (state.year < 2005) return;
  if (state.year > 2009) {
    state.touch.started = true;
    state.touch.intensity = 0.25;
    return;
  }
  // Start probability increases, boosted by R&D perf focus and OS maturity (proxy for innovation)
  const baseP = 0.08 + (state.year - 2005) * 0.05;
  const playerP = (state.rnd / 150000) * 0.08 + (state.perf/100) * 0.03 + (state.osMaturity/100)*0.03;
  const aiP = 0.10 + (state.rivalsPower - 1.0) * 0.06;
  const p = clamp(baseP + playerP + aiP, 0.08, 0.55);

  if (Math.random() < p) {
    state.touch.started = true;
    // Who starts affects early defect pressure (stylized): premium starter => smoother
    // We'll approximate with current brand: higher brand => smoother start
    const smooth = state.brand >= 60 ? 0.18 : state.brand >= 40 ? 0.22 : 0.28;
    state.touch.intensity = smooth;
  }
}

// Rival power changes (very rough): grows when player is weak
function updateRivals(state, soldUnits) {
  // If player share grows, rival power slightly decreases, else increases
  const delta = state.last ? (state.share - state.last.shareBefore) : 0;
  state.rivalsPower = clamp(state.rivalsPower + (delta < 0 ? 0.04 : -0.03) + (Math.random()-0.5)*0.02, 0.85, 1.25);
}

// OS development progression
function advanceOS(state) {
  if (state.osMode === "license") {
    // license gives stable maturity baseline
    state.osMaturity = clamp(state.osMaturity + 1, 10, 40);
    state.devAttract = clamp(state.devAttract + 1, 5, 30);
    return;
  }
  const spend = state.rnd;
  const gain = Math.log10(1 + spend/20000) * (state.osMode === "open" ? 2.2 : 1.8);
  state.osMaturity = clamp(state.osMaturity + gain, 0, 100);

  // Dev attract grows with OS maturity + brand, more if open
  const openBoost = state.osMode === "open" ? 1.3 : 0.8;
  state.devAttract = clamp(state.devAttract + (state.osMaturity/100)*1.2*openBoost + (state.brand/100)*0.6, 0, 100);
}

// Brand update from outcomes
function updateBrand(state, sold, demand, defect, profit) {
  let delta = 0;

  const sellThrough = demand > 0 ? (sold / demand) : 0;
  if (sellThrough > 0.85) delta += 1;
  if (sellThrough < 0.45) delta -= 1;

  // Defect hurts more if low brand
  const defectPct = defect;
  if (defectPct < 0.03) delta += 1;
  if (defectPct > 0.06) delta -= 2;

  // Pricing coherence: if premium tier but low brand, small penalty
  if (state.tier === "premium" && state.brand < 50) delta -= 1;
  if (state.tier === "budget" && state.brand > 70) delta -= 1; // brand dilution

  // Profit helps confidence a bit
  if (profit > 0) delta += 1;
  if (profit < 0) delta -= 1;

  // Apply defect tolerance effect
  const tol = defectPenaltyAdjusted(state.brand);
  delta = Math.round(delta * tol);

  state.brand = clamp(state.brand + delta, 0, 100);
}

// Debt dynamics (simple)
function applyDebt(state) {
  if (state.debt <= 0) return 0;
  const rate = state.year < 2007 ? 0.015 : state.year < 2013 ? 0.02 : 0.025; // per quarter
  const interest = Math.round(state.debt * rate);
  state.cash -= interest;
  return interest;
}

// --- Simulation step
function runQuarter(state) {
  const shareBefore = state.share;

  // macro and touch progression
  updateMacro(state);
  maybeAdvanceTouch(state);

  // read inputs already in state: tier/price/etc.
  advanceOS(state);

  // costs
  const bom = unitCost(state.year, state.tier, state.perf);
  const buyCost = state.buy * bom;
  state.stock += state.buy;
  state.cash -= buyCost;

  // fixed costs scale with capacity + R&D + marketing baseline
  const fixed = Math.round(25000 + state.capacity * 6 + (state.osMode !== "license" ? 12000 : 6000));
  state.cash -= fixed;

  // R&D and Marketing spend
  state.cash -= state.rnd;
  state.cash -= state.marketing;

  // production
  const producible = Math.min(state.capacity, state.stock);
  state.stock -= producible;

  const defect = defectRate(state);
  const goodUnits = Math.max(0, Math.round(producible * (1 - defect)));
  const badUnits = producible - goodUnits; // returned / warranty cost later this quarter (simplified)

  // demand & sales
  const demand = demandEstimate(state);
  const sold = Math.min(goodUnits, demand);

  // channel margin modifier
  const ch = CH[state.channel];

  // revenue
  const revenue = Math.round(sold * state.price * ch.margin);

  // royalties if license
  const royalties = state.osMode === "license" ? Math.round(revenue * state.osRoyaltyRate) : 0;

  // warranty cost for bad units (simplified: cost to replace at BOM * 0.6)
  const warranty = Math.round(badUnits * bom * 0.6);

  state.cash += revenue;
  state.cash -= royalties;
  state.cash -= warranty;

  // interest
  const interest = applyDebt(state);

  // If cash too low after 2007, allow debt (risk tool) – simple auto-loan in V1
  let newDebt = 0;
  if (state.cash < 0) {
    // Pre-2007, gentler: auto small line of credit
    const limit = state.year < 2007 ? 400000 : 250000;
    const needed = Math.min(limit, Math.abs(state.cash) + 50000);
    newDebt = needed;
    state.debt += needed;
    state.cash += needed;
  }

  // profit this quarter (approx)
  const profit = revenue - buyCost - fixed - state.rnd - state.marketing - royalties - warranty - interest;

  // Update market share (very simplified from sold vs total market)
  const totalMarket = marketBaseUnits(state.year, state.q, state.touch);
  const newShare = clamp(0.03 + (sold / Math.max(1, totalMarket)) * 0.9, 0.01, 0.65);

  // Loyalty stabilizes share changes
  const loy = loyalty(state.brand);
  state.share = clamp(state.share * (0.85 + loy) + newShare * (0.15 + (1 - loy)*0.35), 0.01, 0.65);

  // Update brand from outcomes
  updateBrand(state, sold, demand, defect, profit);

  // Rival dynamics
  updateRivals(state, sold);

  // Valuation
  const fundamentals = fundamentalValue(state, profit);
  state.mcap = Math.round(fundamentals * state.macro);

  // Record last
  state.last = {
    year: state.year, q: state.q,
    bom, buyCost, fixed, revenue, royalties, warranty, interest,
    producible, goodUnits, badUnits, demand, sold, profit,
    brandAfter: state.brand,
    shareBefore, shareAfter: state.share,
    osMaturity: state.osMaturity,
    devAttract: state.devAttract,
    macro: state.macro,
    debt: state.debt,
    cash: state.cash
  };

  // Advance time
  state.q += 1;
  if (state.q === 5) { state.q = 1; state.year += 1; }

  saveState(state);
}

// --- UI sync
function syncUI() {
  UI.kpiDate.textContent = `${state.year} Q${state.q}`;
  UI.kpiBrand.textContent = `${Math.round(state.brand)}`;
  UI.kpiCash.textContent = fmt(state.cash);
  UI.kpiMcap.textContent = fmt(state.mcap);
  UI.kpiShare.textContent = pct(state.share);
  UI.kpiMacro.textContent = `Macro × ${state.macro.toFixed(2)}`;

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

  // previews
  const d = demandEstimate(state);
  UI.demandPreview.textContent = `${d}`;
  UI.defectPreview.textContent = `${(defectRate(state)*100).toFixed(1)}%`;

  const base = marketBaseUnits(state.year, state.q, state.touch);
  UI.marketReadout.textContent =
`Marché total estimé : ${base} unités/trimestre
Segment ${state.tier} : ${(SEG[state.tier].baseShare*100).toFixed(0)}% du marché
Demande estimée (toi) : ${d} unités
Coût BOM estimé : $${unitCost(state.year, state.tier, state.perf)} / unité
Touch: ${state.touch.started ? "oui" : "non"} (intensité ${(state.touch.intensity*100).toFixed(0)}%)
Rivaux (pression) : × ${(1/state.rivalsPower).toFixed(2)}
`;

  if (state.last) {
    UI.report.textContent =
`Bilan ${state.last.year} Q${state.last.q}

Produit: ${state.tier} | Prix: $${state.price} | Perf: ${state.perf}
OS: ${state.osMode} | Maturité OS: ${Math.round(state.last.osMaturity)} | Dev: ${Math.round(state.last.devAttract)}

Production: ${state.last.producible} (bons: ${state.last.goodUnits}, défauts/SAV: ${state.last.badUnits})
Demande: ${state.last.demand} | Ventes: ${state.last.sold}

Chiffre d’affaires: ${fmt(state.last.revenue)}
Royalties OS: ${fmt(state.last.royalties)}
Achats composants: ${fmt(state.last.buyCost)}
Coûts fixes: ${fmt(state.last.fixed)}
SAV (garantie): ${fmt(state.last.warranty)}
Intérêts: ${fmt(state.last.interest)}

Profit (approx): ${fmt(state.last.profit)}
Cash: ${fmt(state.last.cash)} | Dette: ${fmt(state.last.debt)}

IM: ${Math.round(state.last.brandAfter)}
Parts: ${(state.last.shareBefore*100).toFixed(1)}% → ${(state.last.shareAfter*100).toFixed(1)}%
Macro: ×${state.last.macro.toFixed(2)} | Valo: ${fmt(state.mcap)}
`;
  }
}

function bindInputs() {
  UI.tier.addEventListener("change", () => { state.tier = UI.tier.value; syncUI(); saveState(state); });
  UI.price.addEventListener("input", () => { state.price = Number(UI.price.value); syncUI(); saveState(state); });
  UI.perf.addEventListener("input", () => { state.perf = Number(UI.perf.value); syncUI(); saveState(state); });
  UI.rnd.addEventListener("input", () => { state.rnd = Number(UI.rnd.value); syncUI(); saveState(state); });

  UI.osMode.addEventListener("change", () => {
    state.osMode = UI.osMode.value;
    // keep openness selector coherent
    UI.osOpen.value = state.osMode === "license" ? "n/a" : (state.osMode === "open" ? "open" : "closed");
    syncUI(); saveState(state);
  });

  UI.capacity.addEventListener("input", () => { state.capacity = Number(UI.capacity.value); syncUI(); saveState(state); });
  UI.qprocess.addEventListener("input", () => { state.qprocess = Number(UI.qprocess.value); syncUI(); saveState(state); });
  UI.stock.addEventListener("input", () => { state.stock = Number(UI.stock.value); syncUI(); saveState(state); });
  UI.buy.addEventListener("input", () => { state.buy = Number(UI.buy.value); syncUI(); saveState(state); });

  UI.mkt.addEventListener("input", () => { state.marketing = Number(UI.mkt.value); syncUI(); saveState(state); });
  UI.channel.addEventListener("change", () => { state.channel = UI.channel.value; syncUI(); saveState(state); });

  UI.btnNext.addEventListener("click", () => { runQuarter(state); syncUI(); });
  UI.btnSave.addEventListener("click", () => { saveState(state); alert("Sauvé ✅"); });
  UI.btnReset.addEventListener("click", () => {
    if (!confirm("Reset la run ?")) return;
    state = defaultState();
    saveState(state);
    syncUI();
  });

  // Nav
  document.querySelectorAll("nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const scr = btn.getAttribute("data-screen");
      ["product","production","market","report"].forEach(s => {
        document.getElementById(`screen-${s}`).style.display = (s === scr) ? "" : "none";
      });
    });
  });
}

// Init
bindInputs();
syncUI();
saveState(state);
