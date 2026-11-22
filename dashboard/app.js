(function () {
  "use strict";

  // The radar data from the node render pass
  const l = window.RADAR;
  if (!l) return;

  const container = document.getElementById("board");
  if (!container) return;

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
  function formatNum(e) {
    if (e == null || !isFinite(e)) return "n/a";
    if (Math.abs(e) >= 1e9) return "$" + (e / 1e9).toFixed(2) + "B";
    if (Math.abs(e) >= 1e6) return "$" + (e / 1e6).toFixed(1) + "M";
    if (Math.abs(e) >= 1e3) return "$" + Math.round(e / 1e3) + "K";
    return C.format(e);
  }

  // Format a percentage
  function formatPct(e) {
    if (e == null || !isFinite(e)) return "n/a";
    return (e > 0 ? "+" : "") + e.toFixed(2) + "%";
  }

  // Format age in days or years
  function formatAge(e) {
    if (e == null || !isFinite(e)) return "unknown";
    if (e >= 365) return (e / 365).toFixed(1) + "y";
    return Math.max(0, Math.round(e)) + "d";
  }

  // Category multiplier: matches the model's categoryMult
  function categoryMult(cat) {
    if (cat == null) return 1;
    const c = cat.toLowerCase();
    if (c.includes("lend") || c.includes("cdp") || c.includes("collateral"))
      return 1.04;
    if (c.includes("dex") || c.includes("yield") || c.includes("leveraged farm"))
      return 1.02;
    if (c.includes("bridge")) return 1.015;
    if (c.includes("staking") || c.includes("restak")) return 1.03;
    if (c.includes("perpetual") || c.includes("derivative")) return 1.01;
    if (c.includes("prediction")) return 1.015;
    if (c.includes("curator") || c.includes("allocator")) return 1.025;
    if (c.includes("stable")) return 1.01;
    if (c.includes("rwa")) return 1.025;
    if (c.includes("insurance")) return 1.01;
    if (c.includes("synthetics") || c.includes("risk curator") || c.includes("allocator"))
      return 1.02;
    if (c.includes("liquidity manager")) return 1.025;
    if (c.includes("anchor btc") || c.includes("basis trading")) return 1.015;
    return 1;
  }

  // Chain-breadth multiplier: matches the model's breadthMult
  function breadthMult(chains) {
    if (!chains) return 1;
    const n = Math.min(chains.length, 10); // cap at 10 chains
    return 0.9 + (n / 10) * 0.1; // 0.90 ... 1.00 as chains go from 1 to 10
  }

  // Implied value formula: exactly matches the model's impliedValue
  function computeImplied(protocol) {
    if (protocol == null) return 1;
    const growth = protocol.change_7d || 0;
    const growthMult = 1 + Math.min(Math.max(growth, -60), 120) / 100 * 0.5;
    const ageDays = protocol.age_days === null || protocol.age_days === void 0 ? 365 : protocol.age_days;
    const maturity =
      0.6 + Math.min(Math.max(ageDays, 0), 1095) / 1095 * 0.4;
    const base = protocol.tvl_usd * 0.25;
    const maturityFactor = Math.max(0.6, Math.min(1, maturity));
    const catMult = categoryMult(protocol.category);
    const chainMult = breadthMult(protocol.chains);
    return Math.max(1, Math.round(base * growthMult * maturityFactor * catMult * chainMult));
  }

  // Create a table element with thead
  function makeTable() {
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.width = "100%";

    const thead = document.createElement("thead");
    thead.style.background = "#f2f5f3";
    thead.innerHTML = `
      <tr>
        <th class="rank" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;color:#5f6f67;">#</th>
        <th class="name" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;" data-sort="name">Name</th>
        <th class="category" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;" data-sort="category">Category</th>
        <th class="tvl" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;" data-sort="tvl_usd">TVL</th>
        <th class="change" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;" data-sort="change_7d">7d</th>
        <th class="implied" style="padding:4px 8px;text-align:left;border-bottom:1px solid #d8e2dc;font-size:12px;" data-sort="implied_value_usd">Implied</th>
      </tr>
    `;

    const tbody = document.createElement("tbody");
    tbody.id = "board-tbody";
    tbody.style.transition = "background 0.2s";

    table.appendChild(thead);
    table.appendChild(tbody);
    return { table, thead, tbody };
  }

  // Render the table with filtered rows
  function renderTable() {
    const rows = s.tab === "live" ? (l.live || []) : (l.rows || []);
    // Sort
    const sorted = [...rows].sort((a, b) => {
      const av = a[s.sort] || 0;
      const bv = b[s.sort] || 0;
      if (isNaN(av) || isNaN(bv)) return 0;
      return s.dir * (av > bv ? 1 : av < bv ? -1 : 0);
    });
    // Highlight sorted column header
    document.querySelectorAll(".sortable").forEach((el) => {
      el.classList.remove("sorted-asc", "sorted-desc");
    });
    const hdr = document.querySelector(
      '.sortable[data-sort="' + s.sort + '"]'
    );
    if (hdr) hdr.classList.add(s.dir === 1 ? "sorted-asc" : "sorted-desc");

    const { tbody } = renderState();
    if (!tbody) return;

    const visible = sorted.filter((p) => {
      const catOk = s.category === "all" || s.category === p.category;
      const haystack = [p.name, p.category || "", ...(p.chains || [])].join(" ").toLowerCase();
      return catOk && (!s.q || haystack.includes(s.q.toLowerCase()));
    });

    tbody.innerHTML = "";
    let rendered = 0;
    const preTokenRows = s.tab === "live" ? [] : visible;
    for (let i = 0; i < Math.min(200, preTokenRows.length); i++) {
      const p = preTokenRows[i];
      const tr = document.createElement("tr");
      tr.className = "radar-row";
      tr.dataset.rank = p.rank;
      tr.innerHTML = `
        <td class="rank" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;color:#5f6f67;">${p.rank || "live"}</td>
        <td class="name" style="padding:4px 8px;"></td>
        <td class="category" style="padding:4px 8px;"></td>
        <td class="tvl" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;"></td>
        <td class="change" style="padding:4px 8px;"></td>
        <td class="implied" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;"></td>
      `;
      const nameCell = tr.querySelector(".name");
      nameCell.textContent = p.name;
      nameCell.title = p.name;
      const catCell = tr.querySelector(".category");
      catCell.textContent = p.category;
      const tvlCell = tr.querySelector(".tvl");
      tvlCell.textContent = formatNum(p.tvl_usd);
      const changeCell = tr.querySelector(".change");
      changeCell.textContent = formatPct(p.change_7d);
      const impliedCell = tr.querySelector(".implied");
      impliedCell.textContent = formatNum(s.tab === "live" ? p.mcap_usd : computeImplied(p));

      tr.addEventListener("click", () => {
        s.selected = p.rank;
        showDetail(p);
      });
      tbody.appendChild(tr);
      rendered++;
    }

    const liveRows = s.tab === "live" ? visible : [];
    for (const p of liveRows) {
      if (rendered >= 200) {
        const tr = document.createElement("tr");
        tr.style.fontStyle = "italic";
        tr.innerHTML = `<td colspan="6" style="padding:8px;color:#5f6f67;font-size:12px;text-align:center">+${liveRows.length} more live protocols (toggle to pre-token view)</td>`;
        tbody.appendChild(tr);
        break;
      }
      const tr = document.createElement("tr");
      tr.className = "radar-row";
      tr.dataset.rank = p.rank;
      tr.innerHTML = `
        <td class="rank" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;color:#5f6f67;">${p.rank || "live"}</td>
        <td class="name" style="padding:4px 8px;"></td>
        <td class="category" style="padding:4px 8px;"></td>
        <td class="tvl" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;"></td>
        <td class="change" style="padding:4px 8px;"></td>
        <td class="implied" style="padding:4px 8px;font-family:ui-monospace;font-size:12px;"></td>
      `;
      const nameCell = tr.querySelector(".name");
      nameCell.textContent = p.name;
      nameCell.title = p.name;
      const catCell = tr.querySelector(".category");
      catCell.textContent = p.category;
      const tvlCell = tr.querySelector(".tvl");
      tvlCell.textContent = formatNum(p.tvl_usd);
      const changeCell = tr.querySelector(".change");
      changeCell.textContent = formatPct(p.change_7d);
      const impliedCell = tr.querySelector(".implied");
      impliedCell.textContent = formatNum(s.tab === "live" ? p.mcap_usd : computeImplied(p));

      tr.addEventListener("click", () => {
        s.selected = p.rank;
        showDetail(p);
      });
      tbody.appendChild(tr);
      rendered++;
    }

    if (rendered === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#5f6f67;padding:16px">No protocols match your filters.</td></tr>';
    }
  }

  // Render state: creates table, filters, controls if needed
  function renderState() {
    let table = document.getElementById("radar-table");
    let tbody = document.getElementById("board-tbody");
    let thead = document.getElementById("board-thead");

    if (!table) {
      const t = makeTable();
      table = t.table;
      tbody = t.tbody;
      thead = t.thead;
      table.id = "radar-table";
      container.appendChild(table);
    }

    let controls = document.getElementById("radar-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "radar-controls";
      controls.style.marginBottom = "12px";
      controls.style.display = "flex";
      controls.style.flexWrap = "wrap";
      controls.style.gap = "8px";
      container.insertBefore(controls, table);
    }

    let searchInput = document.getElementById("radar-search");
    if (!searchInput) {
      searchInput = document.createElement("input");
      searchInput.id = "radar-search";
      searchInput.type = "text";
      searchInput.placeholder = "Search protocol name or category...";
      searchInput.style.padding = "6px 10px";
      searchInput.style.fontSize = "13px";
      searchInput.style.border = "1px solid #d8e2dc";
      searchInput.style.borderRadius = "6px";
      searchInput.style.width = "full";
      searchInput.maxLength = 128;
      controls.appendChild(searchInput);
    }

    let catSelect = document.getElementById("radar-category");
    if (!catSelect) {
      catSelect = document.createElement("select");
      catSelect.id = "radar-category";
      catSelect.style.padding = "6px 10px";
      catSelect.style.fontSize = "13px";
      catSelect.style.border = "1px solid #d8e2dc";
      catSelect.style.borderRadius = "6px";
      catSelect.style.minWidth = "140px";
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All";
      catSelect.appendChild(allOpt);
      controls.appendChild(catSelect);
    }

    let tabContainer = document.getElementById("radar-tabs");
    if (!tabContainer) {
      tabContainer = document.createElement("div");
      tabContainer.id = "radar-tabs";
      tabContainer.style.display = "flex";
      tabContainer.style.gap = "4px";
      tabContainer.marginBottom = "8px";
      const preBtn = document.createElement("button");
      preBtn.className = "tab-button";
      preBtn.dataset.tab = "pre-token";
      preBtn.textContent = "Pre-token";
      preBtn.style.padding = "6px 12px";
      preBtn.style.fontSize = "12px";
      preBtn.style.border = "1px solid #d8e2dc";
      preBtn.style.borderRadius = "6px";
      preBtn.style.background = "#fff";
      preBtn.style.cursor = "pointer";
      preBtn.style.fontWeight = "500";
      preBtn.dataset.active = "true";
      const liveBtn = document.createElement("button");
      liveBtn.className = "tab-button";
      liveBtn.dataset.tab = "live";
      liveBtn.textContent = "Live";
      liveBtn.style.padding = "6px 12px";
      liveBtn.style.fontSize = "12px";
      liveBtn.style.border = "1px solid #d8e2dc";
      liveBtn.style.borderRadius = "6px";
      liveBtn.style.background = "#fff";
      liveBtn.style.cursor = "pointer";
      liveBtn.style.fontWeight = "500";
      liveBtn.dataset.active = "false";
      tabContainer.appendChild(preBtn);
      tabContainer.appendChild(liveBtn);
      controls.appendChild(tabContainer);
    }

    let detailPanel = document.getElementById("detail-panel");
    if (!detailPanel) {
      detailPanel = document.createElement("div");
      detailPanel.id = "detail-panel";
      detailPanel.style.position = "fixed";
      detailPanel.style.top = "20px";
      detailPanel.style.right = "20px";
      detailPanel.style.width = "300px";
      detailPanel.style.background = "#fff";
      detailPanel.style.border = "1px solid #d8e2dc";
      detailPanel.style.borderRadius = "14px";
      detailPanel.style.padding = "20px";
      detailPanel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      detailPanel.style.display = "none";
      detailPanel.zIndex = 1000;
      container.appendChild(detailPanel);
    }

    return { table, tbody, thead };
  }

  function farmSteps(p) {
    const capital = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
    const chain = (p.chains && p.chains[0]) || "its main chain";
    const cat = (p.category || "").toLowerCase();
    let action = `Deposit $${capital} of USDC into ${p.name} on ${chain}.`;
    if (cat.includes("lend") || cat.includes("cdp")) action = `Supply $${capital} of USDC to ${p.name} on ${chain}.`;
    else if (cat.includes("dex") || cat.includes("yield")) action = `Provide $${capital} of liquidity to ${p.name}'s main pool on ${chain}.`;
    else if (cat.includes("bridge")) action = `Bridge $${capital} of USDC through ${p.name} to ${chain}.`;
    else if (cat.includes("staking") || cat.includes("restak")) action = `Stake $${capital} through ${p.name} and keep the receipt.`;
    return [
      "Use a fresh wallet and keep its seed phrase offline. Cost: under $3 gas. Time: 5 minutes.",
      `${action} Cost: $${capital} capital plus about $8 gas. Time: 15 minutes.`,
      "Make one qualifying deposit, borrow, swap or vote each week. Cost: about $2 gas weekly. Time: 10 minutes weekly.",
      "Hold the position for at least 30 days across multiple snapshots. Cost: capital remains in the position. Time: 30 days.",
      "Check the protocol's official rewards page before claiming; airdrop eligibility is never guaranteed. Cost: $0 to check. Time: 10 minutes."
    ];
  }

  // Show detail panel for a selected row
  function showDetail(protocol) {
    const panel = document.getElementById("detail-panel");
    if (!panel) return;

    const rawSteps = protocol.farm_steps && protocol.farm_steps.length ? protocol.farm_steps : farmSteps(protocol);
    const steps = rawSteps.map((step) => typeof step === "string" ? step : step.text || "Follow the protocol's official guide.").join("; ");

    panel.innerHTML = `
      <h3>${protocol.name} <span class="muted">(#${protocol.rank})</span></h3>
      <p><strong>Implied value:</strong> ${formatNum(computeImplied(protocol))}</p>
      <p><strong>TVL:</strong> ${formatNum(protocol.tvl_usd)}</p>
      <p><strong>7d change:</strong> ${formatPct(protocol.change_7d)}</p>
      <p><strong>Category:</strong> ${protocol.category}</p>
      <p><strong>Chains:</strong> ${(protocol.chains || []).join(", ")}</p>
      <p><strong>Age:</strong> ${formatAge(protocol.age_days)}</p>
      <p><strong>Farm steps:</strong> ${steps}</p>
    `;
    panel.style.display = "block";
  }

  // Initialise after container is ready
  function init() {
    renderTable();

    const searchInput = document.getElementById("radar-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        s.q = e.target.value;
        renderTable();
      });
    }

    const catSelect = document.getElementById("radar-category");
    if (catSelect) {
      const categories = [...new Set(l.rows.map((p) => p.category))];
      while (catSelect.options.length > 1) catSelect.remove(1);
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
      catSelect.addEventListener("change", (e) => {
        s.category = e.target.value;
        renderTable();
      });
    }

    document.querySelectorAll(".tab-button").forEach((el) => {
      el.addEventListener("click", () => {
        document.querySelectorAll(".tab-button").forEach((b) => {
          b.style.background = "#fff";
          b.style.fontWeight = "500";
          b.dataset.active = "false";
        });
        el.style.background = "#0f7a5a";
        el.style.color = "white";
        el.style.fontWeight = "600";
        el.dataset.active = "true";
        s.tab = el.dataset.tab;
        renderTable();
      });
    });

    document.querySelectorAll(".radar-row").forEach((el) => {
      el.addEventListener("click", () => {
        s.selected = Number(el.dataset.rank);
        const protocol = l.rows.find((p) => p.rank === s.selected);
        if (protocol) showDetail(protocol);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        s.selected = null;
        const panel = document.getElementById("detail-panel");
        if (panel) panel.style.display = "none";
      }
    });
  }

  // Run after DOM is ready
  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  // Expose for debugging
  window.radarState = s;
})();