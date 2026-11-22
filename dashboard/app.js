(function () {
  "use strict";

  // The radar data from the node render pass
  const l = window.RADAR;
  if (!l) return;

  const p = document.getElementById("board");
  // State: query, category filter, tab (pre-token/live), sort, direction, selected row
  const s = {
    q: "",
    category: "all",
    tab: "pre-token",
    sort: "implied",
    dir: -1,
    selected: null,
  };

  // Number formatter: USD currency with 0 decimals
  const C = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // Format a number for display
  function n(e) {
    if (e == null || !isFinite(e)) return "n/a";
    if (Math.abs(e) >= 1e9) return "$" + (e / 1e9).toFixed(2) + "B";
    if (Math.abs(e) >= 1e6) return "$" + (e / 1e6).toFixed(1) + "M";
    if (Math.abs(e) >= 1e3) return "$" + Math.round(e / 1e3) + "K";
    return C.format(e);
  }

  // Format a percentage
  function m(e) {
    if (e == null || !isFinite(e)) return "n/a";
    return (e > 0 ? "+" : "") + e.toFixed(2) + "%";
  }

  // Format age in days or years
  function y(e) {
    if (e == null || !isFinite(e)) return "unknown";
    if (e >= 365) return (e / 365).toFixed(1) + "y";
    return Math.max(0, Math.round(e)) + "d";
  }

  // Category multiplier: matches the model's categoryMult
  function b(e) {
    if (e == null) return 1;
    var t = e.toLowerCase();
    return (
      t.includes("lend") ||
      t.includes("cdp") ||
      t.includes("collateral")
        ? 1.04
        : t.includes("dex") ||
          t.includes("yield") ||
          t.includes("leveraged farm")
        ? 1.02
        : t.includes("bridge")
        ? 1.015
        : t.includes("staking") || t.includes("restak")
        ? 1.03
        : t.includes("perpetual") || t.includes("derivative")
        ? 1.01
        : t.includes("prediction")
        ? 1.015
        : t.includes("curator") || t.includes("allocator")
        ? 1.025
        : t.includes("stable")
        ? 1.01
        : t.includes("rwa")
        ? 1.025
        : t.includes("insurance")
        ? 1.01
        : t.includes("synthetics") ||
          t.includes("risk curator") ||
          t.includes("allocator")
        ? 1.02
        : t.includes("liquidity manager")
        ? 1.025
        : t.includes("anchor btc") || t.includes("basis trading")
        ? 1.015
        : 1
    );
  }

  // Chain-breadth multiplier: matches the model's breadthMult
  function w(e) {
    if (!e) return 1;
    return 0.9 + Math.min((e && e.length) || 0, 10) / 10 * 0.1;
  }

  // Implied value formula: exactly matches the model's impliedValue
  function b(e, t) {
    if (e == null) return 1;
    var i = Math.min(t.growth_cap, Math.max(t.growth_floor, n.change_7d));
    var a = 1 + i / 100 * t.growth_weight;
    var o = e.age_days === null || e.age_days === void 0 ? t.unknown_age_days : e.age_days;
    var r = t.maturity_floor + Math.min(Math.max(o, 0), t.maturity_days) / t.maturity_days * t.maturity_range;
    return Math.max(1, Math.round(e.tvl_usd * t.base_multiple * a * r * b(e.category) * w(e.chains)));
  }

  // Initialise row elements after the page renders
  function v() {
    const e = document.querySelectorAll(".radar-row");
    e.forEach(function (e) {
      e.style.display = "none";
    });
    g();
  }

  // Filter rows by category and tab
  function g() {
    const e = l.rows || [];
    let t = s.category;
    let i = s.tab;
    e.forEach(function (e) {
      var n = e.implied_value_usd,
        r = e.category,
        r = e.token_status;
      // Tab filter: pre-token or live-token
      var o = i === "pre-token" ? r === "pre-token" : r !== "pre-token";
      // Category filter
      var a = t === "all" || t === r;
      // Query text match against name or category
      var r = s.q === "" || e.name.toLowerCase().includes(s.q.toLowerCase()) || r.toLowerCase().includes(s.q.toLowerCase());
      e.style.display = (o && a && r ? "table-row" : "none");
    });
    h();
    d();
  }

  // Sort rows
  function h() {
    const e = (l.rows || []).sort(function (e, n) {
      var t = n[s.sort];
      var r = e[s.sort];
      if (isNaN(t) || isNaN(r)) return 0;
      return s.dir * (t > r ? 1 : t < r ? -1 : 0);
    });
    e.forEach(function (e, t) {
      e.style.order = t + 1;
    });
    // Highlight sorted column header
    document.querySelectorAll(".sortable").forEach(function (e) {
      e.classList.remove("sorted-asc", "sorted-desc");
    });
    var n = document.querySelector('.sortable[data-sort="' + s.sort + '"]');
    if (n) n.classList.add(s.dir === 1 ? "sorted-asc" : "sorted-desc");
  }

  // Show detail panel for a selected row
  function d() {
    const e = l.rows || [];
    if (s.selected !== null) {
      var t = e.find(function (e) {
        return e.rank === s.selected;
      });
      if (t) {
        var i = document.getElementById("detail-panel");
        var steps = (t.farm_steps || []).map(function (e) {
          var step = e.text || "No step description";
          if (e.cost_usd !== undefined) step += " (cost: $" + e.cost_usd + ")";
          if (e.time !== undefined) step += " (time: " + e.time + ")";
          if (e.airdrop_caveat !== undefined) step += " • " + e.airdrop_caveat;
          return step;
        }).join("; ");
        i.innerHTML = `
          <h3>${t.name} <span class="muted">(#${t.rank})</span></h3>
          <p><strong>Implied value:</strong> ${n(t.implied_value_usd)}</p>
          <p><strong>TVL:</strong> ${n(t.tvl_usd)}</p>
          <p><strong>7d change:</strong> ${m(t.change_7d)}</p>
          <p><strong>Category:</strong> ${t.category}</p>
          <p><strong>Chains:</strong> ${(t.chains || []).join(", ")}</p>
          <p><strong>Age:</strong> ${y(t.age_days)}</p>
          <p><strong>Farm steps:</strong> ${steps}</p>
        `;
        i.style.display = "block";
      }
    } else {
      document.getElementById("detail-panel").style.display = "none";
    }
  }

  // Attach event listeners for controls
  function initListeners() {
    // Search input
    var e = document.getElementById("search-input");
    if (e) {
      e.addEventListener("input", function () {
        (s.q = this.value), g();
      });
    }
    // Category filter
    var t = document.getElementById("category-filter");
    if (t) {
      t.addEventListener("change", function () {
        (s.category = this.value), g();
      });
    }
    // Tab filter
    var i = document.getElementById("tab-filter");
    if (i) {
      i.addEventListener("change", function () {
        (s.tab = this.value), g();
      });
    }
    // Sort controls
    document.querySelectorAll(".sortable").forEach(function (e) {
      e.addEventListener("click", function () {
        var t = e.dataset.sort;
        if (s.sort === t) s.dir *= -1; else s.dir = 1;
        (s.sort = t), h(), g();
      });
    });
    // Row selection
    document.querySelectorAll(".radar-row").forEach(function (e) {
      e.addEventListener("click", function () {
        s.selected = e.rank;
        d();
      });
    });
    // Close detail on escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        s.selected = null;
        d();
      }
    });
  }

  // Run initialisation after DOM is ready
  if (document.readyState === "complete") v();
  else document.addEventListener("DOMContentLoaded", v);

  // Expose for debugging
  window.radarState = s;
})();