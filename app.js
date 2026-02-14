// Smartphone Tycoon – Prototype V1 (mobile web, no build)
// UX patch: Réputation / Marché (label) / Attractivité produit / Intérêt marché (mots) / Help tips / OS ouverture verrouillée

const KEY = "st_proto_v1";

// ---------- Helpers ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const $ = (id) => document.getElementById(id);

const fmtMoney = (n) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---------- Default state ----------
function defaultState() {
  return {
    // Time
    year: 2000,
    q: 1, // 1..4

    // Core business
    cash: 250_000,
    debt: 0,
    brand: 35,       // Réputation (0..100)
    share: 0.08,     // player market share (0..1)
    mcap: 2_000_000, // market cap
    macro: 1.0,      // internal multiplier

    // OS
    osMode: "license", // license | closed | open
    osMaturity: 10,    // 0..100
    devAttract: 10,    // 0..100
    osRoyaltyRate: 0.06, // on revenue if license

    // Product knobs (single model V1)
    tier: "mainstream", // budget | mainstream | premium
    price: 399,
    perf: 55,           // "Qualité produit" slider (still named perf internally)
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
    rivalsPower: 1.0,
    touch: { started: false, intensity: 0 },

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

// ---------- UI handles ----------
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

  prodAttract: $("prod-attract"),
  marketInterest: $("market-interest"),

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

// ---------- Model parameters ----------
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

// ---------- “Behind the scenes” but displayed as friendly labels ----------
function marketLabel(m) {
  if (m <= 0.85) return "Récession";
  if (m <= 0.95) return "Marché tendu";
  if (m <= 1.05) return "Marché normal";
  if (m <= 1.15) return "Marché dynamique";
  return "Euphorie technologique";
}

function brandDemandFactor(rep) {
  return 1 + rep / 200; // 1..1.5
}

function priceElasticityAdjusted(elasticity, rep) {
  return elasticity * (1.05 - (rep / 100) * 0.35);
}

function defectPenaltyAdjusted(rep) {
  return clamp(1.0 - (rep / 100) * 0.55, 0.4, 1.0);
}

function loyalty(rep) {
  return rep / 200;
}

// Base market size (units per quarter), touch boosts it
function marketBaseUnits(year, touch) {
  let base;
  if (year <= 2006) base = 20000 + (year - 2000) * 1200;
  else if (year <= 2012) base = 28000 + (year - 2007) * 6500;
  else if (year <= 2020) base = 65000 + (year - 2013) * 2500;
  else base = 85000 + (year - 2021) * 700;

  const touchBoost = 1 + (touch.intensity * (year <= 2012 ? 0.55 : 0.15));
  return Math.max(5000, Math.round(base * touchBoost));
}

function unitCost(year, tier, quality) {
  const tierBase = tier === "budget" ? 120 : tier === "mainstream" ? 190 : 330;
  const perfAdj = 0.9 + (quality / 100) * 0.8;
  const eraAdj = year < 2007 ? 1.10 : year < 2013 ? 1.05 : year < 2021 ? 1.00 : 1.03;
  return Math.round(tierBase * perfAdj * eraAdj);
}

function defectRate(state) {
  const base = 0.06;
  const proc = base - (state.qprocess / 100) * 0.035;

  // OS maturity influences software stability
  const os = state.osMode === "license"
    ? -0.008
    : (0.012 - (state.osMaturity / 100) * 0.020);

  // Quality product slightly helps (a tiny bit) - feels intuitive to player
  const qualityHelp = - (state.perf / 100) * 0.006; // up to -0.6%

  const tier = state.tier === "budget" ? 0.012 : state.tier === "premium" ? -0.006 : 0.0;
  return clamp(proc + os + tier + qualityHelp, 0.008, 0.12);
}

// Player-facing: Attractivité produit (0..100), not a perfect oracle
function productAttract(state) {
  const segRef = (state.tier === "budget") ? 199 : (state.tier === "premium") ? 799 : 399;

  // Price effect is gentle, to avoid feeling deterministic
  const priceFactor = Math.pow(segRef / Math.max(50, state.price), 0.25);

  // Mix quality and reputation
  const raw = (state.perf * 0.7) + (state.brand * 0.3);
  return Math.round(clamp(raw * priceFactor, 0, 100));
}

// Internal demand estimate (used by engine)
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

// Player-facing: “Intérêt du marché (estim.)” as words
function interestWord(state) {
  const base = marketBaseUnits(state.year, state.touch);
  const segUnits = base * SEG[state.tier].baseShare;

  const d = demandEstimate(state);
  const ratio = d / Math.max(1, segUnits);

  if (ratio < 0.70) return "Faible";
  if (ratio < 1.05) return "Moyen";
  if (ratio < 1.40) return "Fort";
  return "Très fort";
}

function updateMacro(state) {
  let m = state.macro;
  m += (Math.random() - 0.5) * 0.03;
  m = clamp(m, 0.90, 1.15);

  const r = Math.random();
  if (r < 0.015) m = clamp(m + 0.08, 0.90, 1.25);
  if (r > 0.985) m = clamp(m - 0.08, 0.80, 1.15);

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

  const baseP = 0.08 + (state.year - 2005) * 0.05;
  const playerP =
    (state.rnd / 150000) * 0.08 +
    (state.perf / 100) * 0.03 +
    (state.osMaturity / 100) * 0.03;

  const aiP = 0.10 + (state.rivalsPower - 1.0) * 0.06;
  const p = clamp(baseP + playerP + aiP, 0.08, 0.55);

  if (Math.random() < p) {
    state.touch.started = true;
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

  if (state.tier === "premium" && state.brand < 50) delta -= 1;
  if (state.tier === "budget" && state.brand > 70) delta -= 1;

  if (profit > 0) delta += 1;
  if (profit < 0) delta -= 1;

  delta = Math.round(delta * defectPenaltyAdjusted(state.brand));
  state.brand = clamp(state.brand + delta, 0, 100);
}

function applyDebtInterest(state) {
  if (state.debt <= 0) return 0;
  const rate = state.year < 2007 ? 0.015 : state.year < 2013 ? 0.02 : 0.025;
  const interest = Math.round(state.debt * rate);
  state.cash -= interest;
  return interest;
}

function fundamentalValue(state, profit) {
  const profitAnnual = profit * 4;
  const baseMultiple = 8 + (state.brand / 100) * 6 + (state.osMaturity / 100) * 4;
  const scale = 1 + state.share * 1.5;
  const osBonus = state.osMode === "open" ? 1 + (state.devAttract / 100) * 0.15 : 1.0;

  const computed = Math.max(0, profitAnnual) * baseMultiple * scale * osBonus;

  const floor = 500_000 + state.brand * 20_000 + state.share * 20_000_000;
  return Math.round(Math.max(floor, computed));
}

// ---------- Simulation ----------
function runQuarter(state) {
  const shareBefore = state.share;

  updateMacro(state);
  maybeAdvanceTouch(state);
  advanceOS(state);

  const bom = unitCost(state.year, state.tier, state.perf);

  // buy components
  const buyCost = state.buy * bom;
  state.stock += state.buy;
  state.cash -= buyCost;

  // fixed costs
  const fixed = Math.round(25_000 + state.capacity * 6 + (state.osMode !== "license" ? 12_000 : 6_000));
  state.cash -= fixed;

  // spend R&D + marketing
  state.cash -= state.rnd;
  state.cash -= state.marketing;

  // production
  const producible = Math.min(state.capacity, state.stock);
  state.stock -= producible;

  const defect = defectRate(state);
  const goodUnits = Math.max(0, Math.round(producible * (1 - defect)));
  const badUnits = producible - goodUnits;

  // sales
  const demand = demandEstimate(state);
  const sold = Math.min(goodUnits, demand);

  // revenue
  const ch = CH[state.channel];
  const revenue = Math.round(sold * state.price * ch.margin);

  // royalties for licensed OS
  const royalties = state.osMode === "license" ? Math.round(revenue * state.osRoyaltyRate) : 0;

  // warranty (simplified)
  const warranty = Math.round(badUnits * bom * 0.6);

  state.cash += revenue;
  state.cash -= royalties;
  state.cash -= warranty;

  // interest
  const interest = applyDebtInterest(state);

  // auto debt safety net
  let newDebt = 0;
  if (state.cash < 0) {
    const limit = state.year < 2007 ? 400_000 : 250_000;
    const needed = Math.min(limit, Math.abs(state.cash) + 50_000);
    newDebt = needed;
    state.debt += needed;
    state.cash += needed;
  }

  const profit = revenue - buyCost - fixed - state.rnd - state.marketing - royalties - warranty - interest;

  // share
  const totalMarket = marketBaseUnits(state.year, state.touch);
  const immediateShare = clamp(0.03 + (sold / Math.max(1, totalMarket)) * 0.9, 0.01, 0.65);

  const loy = loyalty(state.brand);
  state.share = clamp(
    state.share * (0.85 + loy) + immediateShare * (0.15 + (1 - loy) * 0.35),
    0.01,
    0.65
  );

  updateBrand(state, sold, demand, defect, profit);
  updateRivals(state, shareBefore);

  const fundamentals = fundamentalValue(state, profit);
  state.mcap = Math.round(fundamentals * state.macro);

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

  // advance time
  state.q += 1;
  if (state.q === 5) {
    state.q = 1;
    state.year += 1;
  }

  saveState(state);
}

// ---------- UI coherence ----------
function applyOSOpenLock(state) {
  // Lock openness to be coherent with OS mode
  if (!UI.osOpen) return;

  if (state.osMode === "license") {
    UI.osOpen.value = "n/a";
    UI.osOpen.disabled = true;
  } else if (state.osMode === "closed") {
    UI.osOpen.value = "closed";
    UI.osOpen.disabled = true;
  } else {
    UI.osOpen.value = "open";
    UI.osOpen.disabled = true;
  }
}

function syncUI(state) {
  // Time
  if (UI.kpiDate) UI.kpiDate.textContent = `Année : ${state.year} / Trimestre : Q${state.q}`;

  // KPIs
  if (UI.kpiBrand) UI.kpiBrand.textContent = `${Math.round(state.brand)}`;
  if (UI.kpiCash) UI.kpiCash.textContent = fmtMoney(state.cash);
  if (UI.kpiMcap) UI.kpiMcap.textContent = fmtMoney(state.mcap);
  if (UI.kpiShare) UI.kpiShare.textContent = pct(state.share);

  if (UI.kpiMacro) UI.kpiMacro.textContent = `Marché : ${marketLabel(state.macro)}`;

  // Inputs
  if (UI.tier) UI.tier.value = state.tier;
  if (UI.price) UI.price.value = state.price;
  if (UI.perf) UI.perf.value = state.perf;
  if (UI.perfVal) UI.perfVal.textContent = `${state.perf}`;
  if (UI.rnd) UI.rnd.value = state.rnd;

  if (UI.osMode) UI.osMode.value = state.osMode;
  applyOSOpenLock(state);

  if (UI.osMaturity) UI.osMaturity.textContent = `${Math.round(state.osMaturity)}`;
  if (UI.devAttract) UI.devAttract.textContent = `${Math.round(state.devAttract)}`;

  if (UI.capacity) UI.capacity.value = state.capacity;
  if (UI.qprocess) UI.qprocess.value = state.qprocess;
  if (UI.stock) UI.stock.value = state.stock;
  if (UI.buy) UI.buy.value = state.buy;

  if (UI.mkt) UI.mkt.value = state.marketing;
  if (UI.channel) UI.channel.value = state.channel;

  // Player-facing info
  if (UI.prodAttract) UI.prodAttract.textContent = `${productAttract(state)}`;
  if (UI.marketInterest) UI.marketInterest.textContent = interestWord(state);

  // Production preview
  if (UI.defectPreview) UI.defectPreview.textContent = `${(defectRate(state) * 100).toFixed(1)}%`;

  // Market readout (still useful, but not “oracle”: mostly context)
  if (UI.marketReadout) {
    const base = marketBaseUnits(state.year, state.touch);
    const segPct = Math.round(SEG[state.tier].baseShare * 100);
    const bom = unitCost(state.year, state.tier, state.perf);

    UI.marketReadout.textContent =
`Contexte (résumé)
- Marché : ${marketLabel(state.macro)}
- Taille du marché : ~${base} unités / trimestre
- Segment ${state.tier} : ~${segPct}% du marché

Coûts (estimation)
- Coût composants (BOM) : ~$${bom} / unité

Info
- Révolution tactile : ${state.touch.started ? "en cours" : "pas encore"} (intensité ${(state.touch.intensity * 100).toFixed(0)}%)
`;
  }

  // Report
  if (!UI.report) return;

  if (!state.last) {
    UI.report.textContent = "Lance un trimestre pour voir le bilan.";
    return;
  }

  UI.report.textContent =
`Bilan ${state.last.year} Q${state.last.q}

Entreprise
- Réputation : ${Math.round(state.last.brandAfter)}/100
- Parts de marché : ${(state.last.shareBefore * 100).toFixed(1)}% → ${(state.last.shareAfter * 100).toFixed(1)}%
- Marché : ${marketLabel(state.last.macro)} | Valo : ${fmtMoney(state.mcap)}

Produit & ventes
- Segment : ${state.last.tier} | Prix : $${state.last.price} | Qualité : ${state.last.perf}/100
- Attractivité produit : ${productAttract(state)}/100 | Intérêt marché (estim.) : ${interestWord(state)}
- Demande (interne) : ${state.last.demand} | Ventes : ${state.last.sold}

Production
- Assemblé : ${state.last.producible} (bons : ${state.last.goodUnits}, défauts/SAV : ${state.last.badUnits})
- SAV coût : ${fmtMoney(state.last.warranty)}

Finances
- CA : ${fmtMoney(state.last.revenue)}
- Achats composants : ${fmtMoney(state.last.buyCost)}
- Coûts fixes : ${fmtMoney(state.last.fixed)}
- Royalties OS : ${fmtMoney(state.last.royalties)}
- Intérêts : ${fmtMoney(state.last.interest)}
- Profit (approx) : ${fmtMoney(state.last.profit)}
- Cash : ${fmtMoney(state.last.cash)} | Dette : ${fmtMoney(state.last.debt)}${state.last.newDebt ? ` (nouvelle dette : ${fmtMoney(state.last.newDebt)})` : ""}

Tech
- OS : ${state.last.osMode} | Maturité : ${Math.round(state.last.osMaturity)}/100 | Écosystème dev : ${Math.round(state.last.devAttract)}/100
`;
}

// ---------- Help tips ----------
function setupTips() {
  let bubble = null;

  function closeTip() {
    if (bubble) bubble.remove();
    bubble = null;
  }

  document.addEventListener("click", (e) => {
    const tipTarget = e.target.closest(".has-tip");

    // close if clicking outside
    if (!tipTarget) {
      if (bubble && !e.target.closest(".tip-bubble")) closeTip();
      return;
    }

    e.preventDefault();

    const txt = tipTarget.getAttribute("data-tip") || "";
    const title = tipTarget.textContent.trim() || "Info";

    closeTip();

    bubble = document.createElement("div");
    bubble.className = "tip-bubble";
    bubble.innerHTML = `
      <button class="tip-close" aria-label="Fermer">✕</button>
      <div class="tip-title">${title}</div>
      <div>${txt}</div>
    `;

    bubble.querySelector(".tip-close").addEventListener("click", closeTip);
    document.body.appendChild(bubble);
  });
}

// ---------- Events ----------
function bindEvents(state) {
  // Product
  UI.tier?.addEventListener("change", () => {
    state.tier = UI.tier.value;
    saveState(state);
    syncUI(state);
  });

  UI.price?.addEventListener("input", () => {
    state.price = Number(UI.price.value);
    saveState(state);
    syncUI(state);
  });

  UI.perf?.addEventListener("input", () => {
    state.perf = Number(UI.perf.value);
    saveState(state);
    syncUI(state);
  });

  UI.rnd?.addEventListener("input", () => {
    state.rnd = Number(UI.rnd.value);
    saveState(state);
    syncUI(state);
  });

  UI.osMode?.addEventListener("change", () => {
    state.osMode = UI.osMode.value;
    applyOSOpenLock(state);
    saveState(state);
    syncUI(state);
  });

  // Production
  UI.capacity?.addEventListener("input", () => {
    state.capacity = Number(UI.capacity.value);
    saveState(state);
    syncUI(state);
  });

  UI.qprocess?.addEventListener("input", () => {
    state.qprocess = Number(UI.qprocess.value);
    saveState(state);
    syncUI(state);
  });

  UI.stock?.addEventListener("input", () => {
    state.stock = Number(UI.stock.value);
    saveState(state);
    syncUI(state);
  });

  UI.buy?.addEventListener("input", () => {
    state.buy = Number(UI.buy.value);
    saveState(state);
    syncUI(state);
  });

  // Market
  UI.mkt?.addEventListener("input", () => {
    state.marketing = Number(UI.mkt.value);
    saveState(state);
    syncUI(state);
  });

  UI.channel?.addEventListener("change", () => {
    state.channel = UI.channel.value;
    saveState(state);
    syncUI(state);
  });

  // Actions
  UI.btnNext?.addEventListener("click", () => {
    runQuarter(state);
    syncUI(state);
  });

  UI.btnSave?.addEventListener("click", () => {
    saveState(state);
    alert("Sauvé ✅");
  });

  UI.btnReset?.addEventListener("click", () => {
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
setupTips();
bindEvents(state);
applyOSOpenLock(state);
syncUI(state);
saveState(state);
