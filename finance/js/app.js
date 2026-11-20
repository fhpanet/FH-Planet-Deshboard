/* FH Planet Finance UI. Ledger math lives in store.js. */
(function () {
  var F = window.FHFormat;
  var S = window.FHStore;
  var ui = {
    range: 30,
    txTab: "log",
    filters: { q: "", channel: "all", direction: "all", status: "all", tag: "all", account: "all" },
    selected: {},
    drawer: null,
    modal: null,
    smsText: "",
    smsParsed: null,
    suspend: false,
    switchSel: { companyId: "co-org", institutionId: "inst-brac", accountId: "acc-brac", cardId: "card-visa" },
    accountMode: "combined",
    groupId: "",
    loanId: ""
  };

  var NAV = [
    { route: "dashboard", id: "FIN-01", label: "Finance Dashboard" },
    { route: "transactions", id: "FIN-02", label: "Income & Expense" },
    { route: "accounts", id: "FIN-03", label: "Bank & MFS" },
    { route: "cash", id: "FIN-04", label: "Cash Box" },
    { route: "merchant", id: "FIN-03M", label: "Merchant Module", module: "merchant" },
    { route: "loans", id: "FIN-05", label: "Loans · Khata-Book", module: "loans" },
    { route: "assets", id: "FIN-06", label: "Assets & Investment", module: "assets" },
    { route: "charity", id: "FIN-07", label: "Charity", module: "charity" },
    { route: "recon", id: "FIN-08", label: "Reconciliation", module: "recon" },
    { route: "reports", id: "FIN-09", label: "Reports & Analytics" },
    { route: "audit", id: "FIN-10", label: "Ledger & Audit" },
    { route: "plans", id: "FIN-11", label: "Budget & Planning" },
    { route: "roles", id: "ADM", label: "Roles & Portal" },
    { route: "hermes", id: "HRM", label: "Hermes Control" }
  ];

  var TOGGLES = [
    ["merchant", "Merchant"],
    ["loans", "Loan Khata"],
    ["assets", "Assets"],
    ["charity", "Charity"],
    ["recon", "Reconciliation"],
    ["sms", "SMS Auto-Entry"],
    ["customerPortal", "Customer Portal"]
  ];

  function esc(value) { return F.escapeHtml(value); }
  function money(amount, currency) { return F.money(amount, currency || "BDT"); }
  function state() { return S.getState(); }

  function route() {
    var name = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    return name || "dashboard";
  }

  function routeAllowed(name) {
    var settings = state().settings;
    var needs = { merchant: "merchant", loans: "loans", assets: "assets", charity: "charity", recon: "recon" };
    if (needs[name] && !settings.modules[needs[name]]) return false;
    if (settings.role === "customer") {
      if (name === "dashboard" || name === "transactions" || name === "roles" || name === "request") return true;
      if (name === "loans" && settings.modules.loans) return true;
      return false;
    }
    return !!viewOf(name);
  }

  function viewOf(name) {
    return {
      dashboard: viewDashboard,
      transactions: viewTransactions,
      accounts: viewAccounts,
      cash: viewCash,
      merchant: viewMerchant,
      loans: viewLoans,
      assets: viewAssets,
      charity: viewCharity,
      recon: viewRecon,
      reports: viewReports,
      audit: viewAudit,
      plans: viewPlans,
      roles: viewRoles,
      hermes: viewHermes,
      request: viewRequest
    }[name];
  }

  function accountName(id) {
    var account = S.accountById(id);
    if (!account) return id || "—";
    return instOf(account).name + " · " + account.name;
  }

  function instOf(account) {
    var list = state().institutions;
    for (var i = 0; i < list.length; i++) if (list[i].id === account.institutionId) return list[i];
    return { name: account.name, type: account.type };
  }

  function companyName(id) {
    var list = state().companies;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return id || "";
  }

  function toast(message) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function selectedIds() {
    return Object.keys(ui.selected).filter(function (id) { return ui.selected[id]; });
  }

  function pill(tx) {
    if (tx.reversedBy) return '<span class="pill reversed">Reversed</span>';
    return '<span class="pill ' + esc(tx.status) + '">' + esc(tx.status) + "</span>";
  }

  function amountCell(tx) {
    var cls = tx.direction === "credit" ? "in" : tx.direction === "debit" ? "out" : "move";
    var sign = tx.direction === "credit" ? "+" : tx.direction === "debit" ? "−" : "±";
    var fee = tx.fee > 0 ? '<div class="muted">fee ' + esc(money(tx.fee, tx.currency)) + "</div>" : "";
    return '<div class="amount ' + cls + '">' + sign + " " + esc(money(tx.amount, tx.currency)) + "</div>" + fee;
  }

  function tagsHtml(tags) {
    return (tags || []).map(function (tag) { return '<span class="tag">#' + esc(tag) + "</span>"; }).join("");
  }

  function dueClass(days) {
    if (days <= 1) return "now";
    if (days <= 3) return "soon";
    return "";
  }

  function dueText(days) {
    if (days === 0) return "today";
    if (days === 1) return "1 day";
    return days + " days";
  }

  function blankForm(extra) {
    var form = {
      direction: "debit", amount: "", fee: "", currency: "BDT", date: F.todayISO(), time: F.dhakaTime(),
      accountId: "acc-cash", counterAccountId: "acc-brac", channel: "cash", party: "", description: "",
      category: "Expense", purpose: "", tags: "", groupId: "", newGroup: "", referenceNo: "", adminRef: "",
      customerId: "", school: "", classroom: "", section: "", trxId: "", note: ""
    };
    Object.keys(extra || {}).forEach(function (key) { form[key] = extra[key]; });
    return form;
  }

  function options(list, selected, labeler) {
    return list.map(function (item) {
      var value = item.id || item;
      var label = labeler ? labeler(item) : item;
      return '<option value="' + esc(value) + '"' + (value === selected ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
  }

  function render() {
    if (ui.suspend) return;
    var name = route();
    if (!routeAllowed(name)) {
      if ((location.hash || "") !== "#/dashboard") {
        location.hash = "#/dashboard";
        return;
      }
      name = "dashboard";
    }
    paintNav(name);
    paintChrome(name);
    document.getElementById("view").innerHTML = (viewOf(name) || viewDashboard)();
    paintFooter();
    if (ui.drawer) paintDrawer();
    else document.getElementById("drawer").innerHTML = "";
    if (ui.modal) paintModal();
    else closeModal(true);
  }

  function paintNav(name) {
    var settings = state().settings;
    var role = settings.role;
    document.getElementById("nav").innerHTML = NAV.filter(function (item) {
      if (item.module && !settings.modules[item.module]) return false;
      if (role === "customer" && ["dashboard", "transactions", "loans", "roles"].indexOf(item.route) === -1) return false;
      if (role === "customer" && item.route === "loans" && !settings.modules.loans) return false;
      return true;
    }).map(function (item) {
      return '<a href="#/' + item.route + '"' + (item.route === name ? ' class="active" aria-current="page"' : "") + ">" +
        esc(item.label) + '<span class="nid">' + esc(item.id) + "</span></a>";
    }).join("");
    var canToggle = S.can("toggle");
    document.getElementById("toggles").innerHTML = "<h3>LIGHTWEIGHT MODULE TOGGLES</h3>" + TOGGLES.map(function (item) {
      var on = !!settings.modules[item[0]];
      return '<button type="button" class="toggle" data-action="toggle-module" data-module="' + item[0] + '" aria-pressed="' + (on ? "true" : "false") + '"' + (canToggle ? "" : " disabled") + ">" +
        "<span>" + esc(item[1]) + '</span><span class="track"><i></i></span></button>';
    }).join("");
  }

  function paintChrome() {
    var role = state().settings.role;
    var labels = { supreme: "Supreme Admin", editor: "Editor", auditor: "Auditor", customer: "Customer layer" };
    document.getElementById("role-label").textContent = labels[role] || role;
    var select = document.getElementById("role-select");
    select.value = role;
    var customerOption = select.querySelector('option[value="customer"]');
    customerOption.disabled = !state().settings.modules.customerPortal;
    document.getElementById("quick-add").hidden = !S.can("create");
  }

  function paintFooter() {
    document.getElementById("foot").innerHTML =
      '<div><a href="/">FH Planet</a><a href="#/request">Logistics → request</a><a href="/">Operations</a><a href="#/roles">Admin</a><a href="#/reports">Reports</a><a href="#/request">External Request Link</a></div>' +
      "<div>FH Planet — Finance Department · Lightweight UI · " + esc(F.formatDate(F.todayISO())) + " · Asia/Dhaka</div>";
  }

  function banner(title, text, extra) {
    return '<section class="banner"><div class="banner-id"><div class="banner-mark">FH</div><div><h1>' + esc(title) + "</h1><p>" + esc(text) + "</p></div></div>" +
      '<div class="banner-meta"><span class="chip ok">Unified ledger</span><span class="chip plain">Today · ' + esc(F.formatDate(F.todayISO())) + "</span>" + (extra || "") + "</div></section>";
  }

  function kpi(label, value, sub) {
    return '<article class="kpi"><div class="label">' + esc(label) + '</div><div class="value">' + value + "</div>" + (sub || "") + "</article>";
  }

  function viewCustomerHome() {
    var settings = state().settings;
    var customer = state().customers.filter(function (item) { return item.id === settings.customerId; })[0];
    var txs = S.filteredTransactions({});
    var loans = state().loans.filter(function (loan) { return loan.customerId === settings.customerId; });
    return banner("Customer layer", "Read-only view for " + (customer ? customer.name : settings.customerId) + ". Internal notes stay hidden.") +
      '<section class="stat-row">' +
      kpi("Customer ID", esc(settings.customerId), "") +
      kpi("Visible entries", String(txs.length), "") +
      kpi("Open khata", String(loans.filter(function (loan) { return loan.status !== "closed"; }).length), "") +
      "</section>" +
      '<section class="card callout">This switcher only filters the screen so the owner can test the role. On this static demo the ledger still lives in this browser. A hosted portal would use a separate session.</section>' +
      '<section class="card"><div class="card-head"><h2>Your entries</h2></div>' + txTable(txs.slice(0, 8), false) + "</section>" +
      loanCards(loans);
  }

  function viewDashboard() {
    if (state().settings.role === "customer") return viewCustomerHome();
    var bal = S.balances();
    var kpiToday = S.todayKpis();
    var rows = S.series(ui.range);
    var first = rows[0] ? rows[0].liquid : bal.liquid;
    var pct = first ? ((bal.liquid - first) / first) * 100 : 0;
    var pctLabel = (pct >= 0 ? "▲ " : "▼ ") + Math.abs(pct).toFixed(1) + "% over this window";
    var parts = [
      { name: "Bank", value: bal.bank, color: "#2563eb" },
      { name: "MFS", value: bal.mfs, color: "#db2777" },
      { name: "Card", value: bal.card, color: "#d97706" },
      { name: "Cash", value: bal.cash, color: "#0f9f6e" }
    ];
    var dues = S.deadlines(7);
    var recent = S.filteredTransactions({}).slice(0, 6);
    return banner("Finance Home · Central Cash Box", "সব চ্যানেলের ব্যালেন্স, আজকের আয়-ব্যয় ও আসন্ন ডেডলাইন — এক Unified Ledger থেকে") +
      '<section class="kpi-row">' +
      kpi("Total Liquid Cash · মোট তরল নগদ", esc(money(bal.liquid)), '<div class="delta ' + (pct < 0 ? "down" : "") + '">' + esc(pctLabel) + "</div>") +
      kpi("Bank · ব্যাংক", esc(money(bal.bank)), '<div class="muted">BRAC Bank · Dutch-Bangla</div>') +
      kpi("MFS · মোবাইল ব্যাংকিং", esc(money(bal.mfs)), '<div class="muted">bKash · Nagad · Rocket · Upay</div>') +
      kpi("Card Available · কার্ড", esc(money(bal.card)), '<div class="muted">Authorized cards · no PIN stored</div>') +
      kpi("Cash in Hand · হাতে নগদ", esc(money(bal.cash)), '<div class="muted">Custodian: Main Cash Box</div>') +
      "</section>" +
      '<section class="grid-2"><article class="card"><div class="card-head"><div><h2>Today In / Out & Liquidity</h2><div class="muted">আজ আয় ' + esc(money(kpiToday["in"])) + " · আজ ব্যয় " + esc(money(kpiToday.out)) + " · " + kpiToday.entries + " entries · " + kpiToday.posted + ' posted</div></div><div class="ranges">' +
      [7, 30, 90].map(function (days) {
        return '<button type="button" data-action="range" data-days="' + days + '"' + (ui.range === days ? ' class="active"' : "") + ">" + days + "D</button>";
      }).join("") + '</div></div><div class="legend"><span><i style="background:#5b4bff"></i>Total</span><span><i style="background:#16a34a"></i>Bank</span><span><i style="background:#e11d48"></i>MFS</span></div>' +
      chartSVG(rows) + '</article><article class="card"><div class="card-head"><h2>Upcoming 7-Day Plan</h2><span class="pill pending">' + dues.length + " due</span></div>" +
      (dues.length ? dues.map(function (item) {
        return '<div class="due"><div class="date-badge">' + esc(F.formatShort(item.date)) + '</div><div class="grow"><b>' + esc(item.title) + "</b><div class=\"muted\">" + esc(money(item.amount, item.currency)) + '</div></div><span class="when ' + dueClass(item.days) + '">' + esc(dueText(item.days)) + "</span></div>";
      }).join("") : '<p class="muted">No deadlines in the next 7 days.</p>') +
      "</article></section>" +
      '<section class="grid-3"><article class="card"><div class="card-head"><h2>Channel breakdown</h2></div><div class="donut-wrap">' + donutSVG(parts) +
      '<div class="legend-col">' + parts.map(function (part) {
        var share = bal.liquid ? Math.round((part.value / bal.liquid) * 1000) / 10 : 0;
        return "<div><i class=\"dot\" style=\"background:" + part.color + "\"></i>" + esc(part.name) + " <b>" + share.toFixed(1) + "%</b><div class=\"muted\">" + esc(money(part.value)) + "</div></div>";
      }).join("") + "</div></div></article>" +
      '<article class="card"><div class="card-head"><h2>Recent activity</h2><a href="#/transactions">View all</a></div>' + recentList(recent) + "</article>" +
      '<article class="card"><div class="card-head"><h2>Quick actions</h2></div><div class="qa-grid">' +
      '<button type="button" data-action="open-drawer">Add Transaction</button>' +
      '<button type="button" data-action="open-transfer">Transfer</button>' +
      '<button type="button" data-action="go" data-route="recon">Match / Reconcile</button>' +
      '<button type="button" data-action="go" data-route="loans">Khata Entry</button>' +
      '<button type="button" data-action="export" data-kind="transactions">Export CSV</button>' +
      '<button type="button" data-action="go" data-route="transactions">Transaction Log</button>' +
      "</div></article></section>";
  }

  function chartSVG(rows) {
    if (!rows.length) return "";
    var w = 640, h = 210, padL = 52, padR = 8, padT = 12, padB = 26;
    var max = 0, min = Infinity;
    rows.forEach(function (row) {
      max = Math.max(max, row.liquid, row.bank, row.mfs);
      min = Math.min(min, row.liquid, row.bank, row.mfs);
    });
    var span = (max - min) || 1;
    min = Math.max(0, min - span * 0.2);
    max = max + span * 0.08;
    function x(i) { return padL + (rows.length === 1 ? 0 : i * (w - padL - padR) / (rows.length - 1)); }
    function y(v) { return padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB); }
    function path(key) {
      return rows.map(function (row, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(row[key]).toFixed(1); }).join(" ");
    }
    var grid = "";
    for (var t = 0; t <= 3; t++) {
      var val = min + (max - min) * (t / 3);
      var yy = y(val);
      grid += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#e7e9f2"/>';
      grid += '<text x="' + (padL - 6) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8b90a8">' + esc(F.compactBDT(val)) + "</text>";
    }
    var step = Math.max(1, Math.ceil(rows.length / 5));
    rows.forEach(function (row, i) {
      if (i % step && i !== rows.length - 1) return;
      grid += '<text x="' + x(i).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" font-size="10" fill="#8b90a8">' + esc(F.formatShort(row.date)) + "</text>";
    });
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="chart" role="img" aria-label="Liquidity trend">' + grid +
      '<path d="' + path("liquid") + '" fill="none" stroke="#5b4bff" stroke-width="2.6"/>' +
      '<path d="' + path("bank") + '" fill="none" stroke="#16a34a" stroke-width="2"/>' +
      '<path d="' + path("mfs") + '" fill="none" stroke="#e11d48" stroke-width="2"/></svg>';
  }

  function donutSVG(parts) {
    var total = parts.reduce(function (sum, part) { return sum + part.value; }, 0) || 1;
    var r = 52, c = 2 * Math.PI * r, acc = 0;
    var circles = parts.map(function (part) {
      var frac = Math.max(part.value, 0) / total;
      var dash = Math.max(frac * c - 2, 0);
      var rot = acc * 360 - 90;
      acc += frac;
      return '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + part.color + '" stroke-width="14" stroke-dasharray="' + dash.toFixed(2) + " " + (c - dash).toFixed(2) + '" transform="rotate(' + rot.toFixed(2) + ' 70 70)"/>';
    }).join("");
    return '<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="Channel split">' + circles +
      '<text x="70" y="66" text-anchor="middle" font-size="15" font-weight="700" fill="#1b2040">' + esc(F.compactBDT(total)) + '</text>' +
      '<text x="70" y="84" text-anchor="middle" font-size="11" fill="#6e7594">Liquid</text></svg>';
  }

  function txTable(rows, selectable) {
    var head = "<tr>" + (selectable ? "<th></th>" : "") + "<th>Description / Party</th><th>Channel</th><th>Category</th><th>Tags</th><th>Group / Pass</th><th>Amount</th><th>Status</th><th></th></tr>";
    var body = rows.map(function (tx) { return txRow(tx, selectable); }).join("");
    if (!rows.length) body = '<tr><td colspan="8" class="muted">No rows match.</td></tr>';
    return '<div class="table-wrap"><table><thead>' + head + '</thead><tbody id="tx-body">' + body + "</tbody></table></div>";
  }

  function txRow(tx, selectable) {
    var group = S.groupById(tx.groupId);
    var box = selectable ? '<td><input type="checkbox" data-select="' + esc(tx.id) + '"' + (ui.selected[tx.id] ? " checked" : "") + ' aria-label="Select ' + esc(tx.id) + '"></td>' : "";
    return "<tr>" + box +
      "<td><div class=\"strong\">" + esc(tx.description) + '</div><div class="muted">' + esc(F.formatShort(tx.date)) + " · " + esc(tx.time || "") + " · " + esc(tx.party || "—") + "</div></td>" +
      "<td><span class=\"dot\" style=\"background:" + channelColor(tx.channel) + "\"></span>" + esc(tx.provider || tx.channel) + "</td>" +
      "<td>" + esc(tx.category) + '<div class="muted">' + esc(tx.purpose || "") + "</div></td>" +
      "<td>" + (tagsHtml(tx.tags) || '<span class="muted">—</span>') + "</td>" +
      "<td>" + (group ? esc(group.name) : "—") + '<div class="muted">' + esc(tx.referenceNo || tx.adminRef || "") + "</div></td>" +
      "<td>" + amountCell(tx) + "</td><td>" + pill(tx) + "</td><td class=\"actions\">" + rowActions(tx) + "</td></tr>";
  }

  function recentList(rows) {
  if (!rows.length) return '<p class="muted">No activity yet.</p>';
  return rows.map(function (tx) {
    return '<div class="due"><div class="date-badge">' + esc(tx.time || "—") + '</div><div class="grow"><b>' + esc(tx.description) + '</b><div class="muted">' + esc(tx.provider || tx.channel) + " · " + esc(F.formatShort(tx.date)) + "</div></div><div>" + amountCell(tx) + pill(tx) + "</div></div>";
  }).join("");
}

function channelColor(channel) {
    return { bank: "#2563eb", mfs: "#db2777", card: "#d97706", cash: "#0f9f6e" }[channel] || "#6d7390";
  }

  function rowActions(tx) {
    var html = '<button type="button" class="ghost small" data-action="notes" data-kind="transaction" data-id="' + esc(tx.id) + '">Notes</button>';
    if (S.can("edit") && (tx.status === "draft" || tx.status === "pending" || tx.status === "approved")) {
      html += '<button type="button" class="ghost small" data-action="edit-tx" data-id="' + esc(tx.id) + '">Edit</button>';
    }
    if (S.can("post") && tx.status !== "posted" && tx.status !== "archived") {
      html += '<button type="button" class="primary small" data-action="post-tx" data-id="' + esc(tx.id) + '">Post</button>';
    }
    if (S.can("reverse") && tx.status === "posted" && !tx.reversedBy && !tx.reversalOf) {
      html += '<button type="button" class="ghost small" data-action="ask-reverse" data-id="' + esc(tx.id) + '">Reverse</button>';
      if (tx.direction !== "transfer") html += '<button type="button" class="ghost small" data-action="ask-adjust" data-id="' + esc(tx.id) + '">Adjust</button>';
    }
    if (S.can("edit") && tx.status !== "posted" && tx.status !== "archived") {
      html += '<button type="button" class="danger small" data-action="ask-archive" data-id="' + esc(tx.id) + '">Archive</button>';
    }
    return html;
  }

  function viewTransactions() {
    if (ui.txTab === "groups") return txShell(viewGroups());
    if (ui.txTab === "auto") return txShell(viewAuto());
    var month = S.monthKpis();
    var rows = S.filteredTransactions(ui.filters);
    var draftCount = state().transactions.filter(function (tx) {
      return S.inRoleScope(tx) && (tx.status === "draft" || tx.status === "pending" || tx.status === "approved");
    }).length;
    var openGroups = state().groups.filter(function (group) { return group.status !== "settled"; }).length;
    return txShell(
      '<section class="stat-row">' +
      kpi("Entries this month", String(month.count), "") +
      kpi("Income · আয়", esc(money(month.income)), "") +
      kpi("Expense · ব্যয়", esc(money(month.expense)), "") +
      kpi("Draft / Pending", String(draftCount), "") +
      kpi("Active groups", String(openGroups), "") +
      "</section>" +
      '<section class="card"><div class="filters">' +
      filterSelect("channel", ["all", "bank", "mfs", "card", "cash"]) +
      filterSelect("direction", ["all", "credit", "debit", "transfer"]) +
      filterSelect("status", ["all", "draft", "pending", "approved", "posted", "archived"]) +
      '<input data-filter="q" value="' + esc(ui.filters.q) + '" placeholder="Search description, pass, TrxID" aria-label="Filter text">' +
      '<select data-filter="account" aria-label="Account"><option value="all">All accounts</option>' + state().accounts.map(function (account) {
        return '<option value="' + esc(account.id) + '"' + (ui.filters.account === account.id ? " selected" : "") + ">" + esc(accountName(account.id)) + "</option>";
      }).join("") + "</select>" +
      '<select data-filter="tag" aria-label="Tag"><option value="all">All tags</option>' + tagOptions(ui.filters.tag) + "</select>" +
      "</div><div class=\"card-head\" style=\"margin-top:10px\"><div class=\"muted\"><span id=\"sel-count\">" + selectedIds().length + '</span> selected</div><div class="actions">' +
      (S.can("edit") ? '<button type="button" class="primary small" data-action="ask-group">Group selected</button>' : "") +
      '<button type="button" class="ghost small" data-action="export" data-kind="transactions">Export CSV</button></div></div>' +
      txTable(rows, S.can("edit")) +
      '<p class="muted">Draft and pending rows do not move a balance. Posted rows stay on the ledger — reverse or adjust them. Archive hides a draft; it does not erase the audit line.</p></section>'
    );
  }

  function txShell(inner) {
    return banner("Transaction Log & Gen UI · FIN-02", "Group, tag, and note every entry. Posted rows are immutable.") +
      '<div class="tabs"><button type="button" class="' + (ui.txTab === "log" ? "primary" : "ghost") + '" data-action="tx-tab" data-tab="log">Transactions</button>' +
      '<button type="button" class="' + (ui.txTab === "groups" ? "primary" : "ghost") + '" data-action="tx-tab" data-tab="groups">Groups</button>' +
      '<button type="button" class="' + (ui.txTab === "auto" ? "primary" : "ghost") + '" data-action="tx-tab" data-tab="auto">Rules & SMS</button></div>' + inner;
  }

  function filterSelect(key, values) {
    return '<select data-filter="' + key + '" aria-label="' + esc(key) + '">' + values.map(function (value) {
      return '<option value="' + esc(value) + '"' + (ui.filters[key] === value ? " selected" : "") + ">" + esc(value) + "</option>";
    }).join("") + "</select>";
  }

  function tagOptions(selected) {
    var seen = {};
    state().transactions.concat(state().groups).forEach(function (row) {
      (row.tags || []).forEach(function (tag) { seen[tag] = true; });
    });
    ["bazaar_market", "personal", "private", "FEE_CHARGE"].forEach(function (tag) { seen[tag] = true; });
    return Object.keys(seen).sort().map(function (tag) {
      return '<option value="' + esc(tag) + '"' + (selected === tag ? " selected" : "") + ">#" + esc(tag) + "</option>";
    }).join("");
  }

  function viewGroups() {
    var groups = state().groups.filter(function (group) {
      if (state().settings.role !== "customer") return true;
      return S.groupTotals(group.id).counts.all > 0;
    });
    var list = groups.map(function (group) {
      var totals = S.groupTotals(group.id);
      var open = ui.groupId === group.id;
      return '<article class="card"><div class="card-head"><div><h3>' + esc(group.name) + "</h3><div class=\"muted\">" + esc(group.id) +
        " · Pass " + esc(group.referenceNo || "—") + " · Admin " + esc(group.adminRef || "—") + "</div></div><div class=\"actions\">" +
        '<span class="pill ' + esc(group.status) + '">' + esc(group.status) + "</span>" +
        '<button type="button" class="ghost small" data-action="open-group" data-id="' + esc(group.id) + '">' + (open ? "Hide" : "Open") + "</button>" +
        '<button type="button" class="ghost small" data-action="notes" data-kind="group" data-id="' + esc(group.id) + '">Notes</button></div></div>' +
        "<div>Credit " + esc(money(totals.credit)) + " · Debit " + esc(money(totals.debit)) + " · Net <b>" + esc(money(totals.net)) + "</b> · " + totals.counts.all + " linked · " + totals.counts.posted + " posted</div>" +
        "<div>" + tagsHtml(group.tags) + "</div>" +
        (open ? groupDetail(group) : "") + "</article>";
    }).join("");
    var form = S.can("create") ? '<article class="card"><h3>New group</h3><form id="group-form" class="form-grid" autocomplete="off"><label class="field">Group name<input name="name" required maxlength="80"></label><label class="field">Reference / Pass<input name="referenceNo" maxlength="40"></label><label class="field">Admin reference<input name="adminRef" maxlength="40"></label><label class="field">Tags<input name="tags" placeholder="bazaar_market, personal"></label><label class="field full">First note<textarea name="note" rows="2"></textarea></label><div class="field"><button class="primary" type="submit">Create group</button></div></form></article>' : "";
    return list + form;
  }

  function groupDetail(group) {
    var notes = S.visibleNotes(group.notes || []);
    var rows = state().transactions.filter(function (tx) { return tx.groupId === group.id && S.inRoleScope(tx); });
    var statusPick = S.can("edit") ? '<label class="field">Status<select data-action="group-status" data-id="' + esc(group.id) + '">' +
      ["open", "pending", "settled"].map(function (status) {
        return '<option' + (group.status === status ? " selected" : "") + ">" + status + "</option>";
      }).join("") + "</select></label>" : "";
    return '<div class="muted" style="margin-top:8px">' + notes.length + " notes</div>" +
      notes.map(noteBlock).join("") + statusPick + '<div style="margin-top:8px">' + txTable(rows, false) + "</div>";
  }

  function noteBlock(note) {
    return '<div class="note"><div>' + esc(note.text) + '</div><div class="by">' + esc(note.by) + " · " + esc(note.at) + " · " + esc(note.visibility) + "</div></div>";
  }

  function viewAuto() {
    var rules = state().rules.map(function (rule) {
      return '<div class="due"><div class="grow"><b>' + esc(rule.name) + "</b><div class=\"muted\">" + esc(rule.field) + " " + esc(rule.operator) + ' “' + esc(rule.value) + "” → " +
        esc((rule.addTags || []).join(", ") || "no tag") + (rule.groupName ? " · group " + esc(rule.groupName) : "") + "</div></div>" +
        (S.can("rules") ? '<button type="button" class="ghost small" data-action="toggle-rule" data-id="' + esc(rule.id) + '">' + (rule.enabled ? "On" : "Off") + '</button><button type="button" class="danger small" data-action="delete-rule" data-id="' + esc(rule.id) + '">Remove</button>' : "") +
        "</div>";
    }).join("");
    var ruleForm = S.can("rules") ? '<form id="rule-form" class="form-grid" autocomplete="off"><label class="field">Name<input name="name" required></label><label class="field">Field<select name="field"><option>description</option><option>party</option><option>channel</option><option>provider</option><option>category</option><option>purpose</option></select></label><label class="field">Operator<select name="operator"><option value="contains">contains</option><option value="equals">equals</option></select></label><label class="field">Value<input name="value" required></label><label class="field">Add tags<input name="addTags" placeholder="personal, private"></label><label class="field">Group name<input name="groupName"></label><label class="field full">Note template<input name="noteTemplate"></label><div class="field"><button class="primary" type="submit">Save rule</button> <button type="button" class="ghost" data-action="run-rules">Run on existing</button></div></form>' : "";
    var sms = "";
    if (state().settings.modules.sms) {
      var parsed = ui.smsParsed;
      var preview = "";
      if (parsed && parsed.blocked) preview = '<div class="bad">' + esc(parsed.error) + "</div>";
      else if (parsed && !parsed.ok) preview = '<div class="bad">' + esc(parsed.error || "Could not parse") + "</div>";
      else if (parsed && parsed.ok) {
        var dup = parsed.trxId && S.findTrx(parsed.trxId);
        preview = '<div class="sms-result"><div>Provider</div><b>' + esc(parsed.provider || "—") + "</b><div>Direction</div><b>" + esc(parsed.direction || "—") + "</b><div>Amount</div><b>" + esc(money(parsed.amount)) + "</b><div>Fee</div><b>" + esc(money(parsed.fee || 0)) + "</b><div>TrxID</div><b>" + esc(parsed.trxId || "—") + "</b><div>Party</div><b>" + esc(parsed.counterparty || "—") + "</b><div>Balance hint</div><b>" + (parsed.balance == null ? "—" : esc(money(parsed.balance))) + "</b><div>When</div><b>" + esc((parsed.date || "") + " " + (parsed.time || "")) + "</b></div>" +
          (dup ? '<div class="bad">TrxID ' + esc(parsed.trxId) + " is already " + esc(dup.id) + ". It will not be saved again.</div>" : "") +
          (S.can("create") && !dup ? '<div class="actions" style="margin-top:8px"><button type="button" class="ghost" data-action="save-sms" data-status="pending">Save for review</button><button type="button" class="primary" data-action="save-sms" data-status="posted">Post to ledger</button></div>' : "");
      }
      sms = '<article class="card"><div class="card-head"><h2>BD MFS / bank SMS paste</h2></div><p class="muted">Paste a bKash, Nagad, Rocket, Upay, or bank SMS. OTP, PIN, CVV, and verification codes are rejected.</p>' +
        '<textarea id="sms-text" rows="5" style="width:100%" placeholder="Paste SMS…">' + esc(ui.smsText) + "</textarea>" +
        '<div class="actions" style="margin-top:8px"><button type="button" class="primary" data-action="parse-sms">Parse</button><button type="button" class="ghost" data-action="sample-sms" data-sample="new">Sample bKash</button><button type="button" class="ghost" data-action="sample-sms" data-sample="dup">Sample duplicate</button><button type="button" class="ghost" data-action="sample-sms" data-sample="otp">Sample OTP (blocked)</button></div>' + preview + "</article>";
    } else {
      sms = '<article class="card"><p class="muted">SMS Auto-Entry is turned off in the lightweight toggles. Rules still run.</p></article>';
    }
    return '<section class="grid-2"><article class="card"><div class="card-head"><h2>Auto-tag & auto-group</h2></div>' + rules + ruleForm + "</article>" + sms + "</section>";
  }

  function viewAccounts() {
    var bal = S.balances();
    var sel = normalizeSwitch();
    var account = S.accountById(sel.accountId);
    var card = state().cards.filter(function (item) { return item.id === sel.cardId; })[0];
    var companies = state().companies;
    var institutions = institutionsFor(sel.companyId);
    var accounts = state().accounts.filter(function (item) { return item.institutionId === sel.institutionId && item.companyId === sel.companyId; });
    if (!accounts.length) accounts = state().accounts.filter(function (item) { return item.companyId === sel.companyId; });
    var cards = state().cards.filter(function (item) { return !sel.accountId || item.accountId === sel.accountId || item.companyId === sel.companyId; });
    var float = S.floatRollup();
    var schools = ["Bank", "bKash", "Nagad", "Rocket", "Upay", "Card", "Cash"].filter(function (name) { return float[name]; });
    return banner("Account Hub · Bank & MFS Switchboard", "Company → institution → account → card. One active context at a time.") +
      '<section class="kpi-row">' +
      kpi("Companies", String(companies.length), '<div class="muted">FH Organization · FH Academy · FH Planet</div>') +
      kpi("Bank balance", esc(money(bal.bank)), "") +
      kpi("MFS wallets", esc(money(bal.mfs)), "") +
      kpi("Cards", String(state().cards.length) + " active", "") +
      kpi("Fee lines", esc(money(S.feeReport())), '<div class="muted">Posted charges, counted once</div>') +
      "</section>" +
      '<section class="card"><div class="card-head"><h2>Switchboard</h2><div class="seg"><button type="button" data-action="account-mode" data-mode="individual" class="' + (ui.accountMode === "individual" ? "active" : "") + '">Individual</button><button type="button" data-action="account-mode" data-mode="combined" class="' + (ui.accountMode === "combined" ? "active" : "") + '">Combined</button></div></div>' +
      '<div class="switchboard">' +
      switchCol("Company", companies.map(function (company) { return pick("companyId", company.id, company.name, sel.companyId === company.id); }).join("")) +
      switchCol("Bank / MFS", institutions.map(function (inst) { return pick("institutionId", inst.id, inst.name, sel.institutionId === inst.id); }).join("")) +
      switchCol("Account", accounts.map(function (item) { return pick("accountId", item.id, item.name + " " + item.masked, sel.accountId === item.id); }).join("")) +
      switchCol("Authorized card", cards.map(function (item) { return pick("cardId", item.id, item.network + " " + item.masked, sel.cardId === item.id); }).join("")) +
      '<div class="workspace-card"><h3>Role check → workspace</h3><div class="muted">' + esc(companyName(sel.companyId)) + "</div><div class=\"strong\">" + esc(account ? accountName(account.id) : "—") + "</div><div style=\"font-size:22px;font-weight:800;margin:8px 0\">" + esc(account ? money(bal.byAccount[account.id] || 0) : "—") + "</div><div>" + esc(card ? card.network + " " + card.masked + " · " + card.assignedRole : "No card selected") + "</div><p class=\"secret-note\" style=\"color:rgba(255,255,255,.8)\">PIN, CVV, and OTP are never stored or requested.</p></div>" +
      "</div></section>" +
      '<section class="card"><div class="card-head"><h2>School → Classroom → Section float</h2><span class="muted">Float total is the current balance. Rooms show posted movement.</span></div><div class="float">' +
      schools.map(function (name) { return floatCard(float[name]); }).join("") + "</div></section>" +
      '<section class="card"><div class="card-head"><h2>Account registry</h2></div>' + registryTable(ui.accountMode === "individual" && account ? [account] : state().accounts) + "</section>";
  }

  function normalizeSwitch() {
    var sel = ui.switchSel;
    var account = S.accountById(sel.accountId) || state().accounts[0];
    sel.accountId = account.id;
    sel.companyId = account.companyId;
    sel.institutionId = account.institutionId;
    var cards = state().cards.filter(function (card) { return card.accountId === account.id; });
    if (!cards.some(function (card) { return card.id === sel.cardId; })) sel.cardId = cards[0] ? cards[0].id : "";
    return sel;
  }

  function institutionsFor(companyId) {
    var ids = {};
    state().accounts.forEach(function (account) { if (account.companyId === companyId) ids[account.institutionId] = true; });
    return state().institutions.filter(function (inst) { return ids[inst.id]; });
  }

  function switchCol(title, inner) {
    return '<div class="col"><h3>' + esc(title) + "</h3>" + inner + "</div>";
  }

  function pick(kind, id, label, active) {
    return '<button type="button" class="pick' + (active ? " active" : "") + '" data-action="pick" data-kind="' + kind + '" data-id="' + esc(id) + '">' + esc(label) + "</button>";
  }

  function floatCard(node) {
    var sections = Object.keys(node.sections).sort().map(function (key) {
      var bits = key.split("|");
      return "<div>" + esc(bits[1]) + " · " + esc(money(node.sections[key])) + "</div>";
    }).join("");
    return '<article class="float-card"><div class="card-head"><h3>' + esc(node.school) + '</h3><b>' + esc(money(node.balance)) + '</b></div><div class="rooms"><div class="room credit"><b>Credit</b><div>' + esc(money(node.credit)) + '</div></div><div class="room debit"><b>Debit</b><div>' + esc(money(node.debit)) + "</div></div></div><div class=\"muted\" style=\"margin-top:8px\">" + sections + "</div></article>";
  }

  function registryTable(accounts) {
    var bal = S.balances();
    var rows = accounts.map(function (account) {
      var last = "";
      state().transactions.forEach(function (tx) {
        if ((tx.accountId === account.id || tx.counterAccountId === account.id) && tx.date > last) last = tx.date;
      });
      return "<tr><td>" + esc(instOf(account).name) + " · " + esc(account.name) + '<div class="muted">' + esc(account.masked) + "</div></td><td>" + esc(companyName(account.companyId)) + "</td><td>" + esc(account.type) + "</td><td class=\"amount\">" + esc(money(bal.byAccount[account.id] || 0)) + "</td><td>" + esc(last ? F.formatShort(last) : "—") + "</td><td>" + esc(account.reconStatus) + '<div class="muted">' + esc(account.reconNote || "") + "</div></td></tr>";
    }).join("");
    return '<div class="table-wrap"><table><thead><tr><th>Institution</th><th>Company</th><th>Type</th><th>Balance</th><th>Last</th><th>Recon</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }

  function viewCash() {
    var account = S.accountById("acc-cash");
    var bal = S.balances().byAccount["acc-cash"] || 0;
    var rows = S.filteredTransactions({ account: "acc-cash" });
    var inflow = 0, outflow = 0;
    state().transactions.forEach(function (tx) {
      if (tx.status !== "posted") return;
      tx.lines.forEach(function (line) {
        if (line.accountId !== "acc-cash") return;
        var amt = F.toBDT(line.amount, line.currency, state().settings.usdRate);
        if (line.direction === "credit") inflow += amt;
        else outflow += amt;
      });
    });
    return banner("Cash Box · FIN-04", "Hand cash is a view of the same ledger, with its own custodian.") +
      '<section class="stat-row">' +
      kpi("Opening", esc(money(account.openingBalance)), "") +
      kpi("Cash in", esc(money(inflow)), "") +
      kpi("Cash out", esc(money(outflow)), "") +
      kpi("Current", esc(money(bal)), '<div class="muted">Custodian: ' + esc(account.custodian || "Main Cash Box") + "</div>") +
      "</section>" +
      '<section class="card"><div class="card-head"><h2>Cash movements</h2><button type="button" class="primary" data-action="open-drawer" data-account="acc-cash">Cash entry</button></div>' + txTable(rows, false) + "</section>";
  }

  function viewMerchant() {
    var rows = S.merchantRollup().map(function (row) {
      return "<tr><td>" + esc(row.merchant.name) + '<div class="muted">' + esc(row.merchant.category) + "</div></td><td class=\"amount in\">" + esc(money(row.income)) + "</td><td class=\"amount out\">" + esc(money(row.expense)) + "</td><td class=\"amount\">" + esc(money(row.net)) + "</td></tr>";
    }).join("");
    var form = S.can("create") ? '<form id="merchant-form" class="form-grid" autocomplete="off"><label class="field">Name<input name="name" required></label><label class="field">Category<input name="category" placeholder="Printing"></label><div class="field"><button class="primary" type="submit">Add merchant</button></div></form>' : "";
    return banner("Merchant module", "Income and expense roll up from ledger rows that name the merchant.") +
      '<section class="card">' + form + '<div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function viewLoans() {
    var loans = state().loans.filter(function (loan) {
      return state().settings.role !== "customer" || loan.customerId === state().settings.customerId;
    });
    var given = 0, received = 0;
    loans.forEach(function (loan) {
      var math = S.loanMath(loan);
      if (loan.direction === "given") given += math.remaining;
      else received += math.remaining;
    });
    return banner("Loans · Khata-Book · FIN-05", "পাওনা (given) and দেনা (received). Charge is stored once.") +
      '<section class="stat-row">' + kpi("পাওনা still out", esc(money(given)), "") + kpi("দেনা still due", esc(money(received)), "") + "</section>" +
      loanCards(loans) + loanForm();
  }

  function loanCards(loans) {
    return loans.map(function (loan) {
      var math = S.loanMath(loan);
      var open = ui.loanId === loan.id;
      var notes = S.visibleNotes(loan.notes || []);
      return '<article class="card"><div class="card-head"><div><h3>' + esc(loan.party) + "</h3><div class=\"muted\">" + (loan.direction === "given" ? "Loans given · পাওনা" : "Loans received · দেনা") + " · due " + esc(loan.dueDate || "—") + "</div></div><span class=\"pill " + esc(loan.status === "closed" ? "posted" : "pending") + "\">" + esc(loan.status) + "</span></div>" +
        "<div>Principal " + esc(money(math.principal)) + " · Charge " + esc(money(math.charge)) + " · Paid " + esc(money(math.paid)) + " · Remaining <b>" + esc(money(math.remaining)) + "</b></div>" +
        '<div class="actions" style="margin-top:8px"><button type="button" class="ghost small" data-action="open-loan" data-id="' + esc(loan.id) + '">' + (open ? "Hide" : "Khata") + '</button><button type="button" class="ghost small" data-action="notes" data-kind="loan" data-id="' + esc(loan.id) + '">Notes</button></div>' +
        (open ? notes.map(noteBlock).join("") + repayForm(loan) : "") + "</article>";
    }).join("");
  }

  function repayForm(loan) {
    if (!S.can("create")) return "";
    return '<form class="form-grid repay-form" data-id="' + esc(loan.id) + '" autocomplete="off" style="margin-top:8px"><label class="field">Repayment amount<input name="amount" required inputmode="decimal"></label><label class="field">Account<select name="accountId">' + state().accounts.map(function (account) {
      return '<option value="' + esc(account.id) + '">' + esc(accountName(account.id)) + "</option>";
    }).join("") + '</select></label><div class="field"><button class="primary" type="submit">Record repayment</button></div></form>';
  }

  function loanForm() {
    if (!S.can("create")) return "";
    return '<article class="card"><h3>Open a khata</h3><form id="loan-form" class="form-grid" autocomplete="off"><label class="field">Person / party<input name="party" required></label><label class="field">Contact<input name="contact"></label><label class="field">Side<select name="direction"><option value="given">Given · পাওনা</option><option value="received">Received · দেনা</option></select></label><label class="field">Principal<input name="principal" required inputmode="decimal"></label><label class="field">Charge (once)<input name="charge" inputmode="decimal" value="0"></label><label class="field">Due date<input name="dueDate" type="date"></label><label class="field">Customer ID<input name="customerId" placeholder="CUS-1042"></label><label class="field">Note<input name="note"></label><label class="field"><span>Also post the cash movement</span><select name="disburse"><option value="yes">Yes, post disbursement</option><option value="no">Khata only</option></select></label><div class="field"><button class="primary" type="submit">Save loan</button></div></form><p class="secret-note">A charge increases what is owed once. It is not added again when the disbursement hits the cash box.</p></article>';
  }

  function viewPlans() {
    var alerts = S.alerts();
    var cards = state().plans.map(function (plan) {
      var progress = S.planProgress(plan);
      var width = Math.min(progress.pct, 100);
      return '<article class="card"><div class="card-head"><h3>' + esc(plan.name) + '</h3><span class="pill ' + (progress.level === "over" ? "reversed" : progress.level === "warn" ? "pending" : "posted") + '">' + progress.pct + "%</span></div>" +
        '<div class="muted">' + esc(plan.scopeType) + " · " + esc(plan.scopeId) + " · " + esc(F.formatShort(plan.start)) + " – " + esc(F.formatShort(plan.end)) + "</div>" +
        '<div class="progress ' + esc(progress.level) + '" style="margin:8px 0"><span style="width:' + width + '%"></span></div>' +
        "<div>" + esc(money(progress.actual)) + " of " + esc(money(progress.limit)) + " · alert at " + esc(String(plan.thresholdPct)) + "%</div></article>";
    }).join("");
    var form = S.can("create") ? '<article class="card"><h3>New budget</h3><form id="plan-form" class="form-grid" autocomplete="off"><label class="field">Name<input name="name" required></label><label class="field">Scope<select name="scopeType"><option value="tag">Tag</option><option value="group">Group</option></select></label><label class="field">Tag or group id<input name="scopeId" placeholder="bazaar_market or GRP-1138" required></label><label class="field">Timeframe<select name="timeframe"><option value="monthly">Monthly</option><option value="custom">Custom</option></select></label><label class="field">Start<input type="date" name="start" value="' + esc(F.monthBounds().start) + '"></label><label class="field">End<input type="date" name="end" value="' + esc(F.monthBounds().end) + '"></label><label class="field">Limit<input name="limit" required inputmode="decimal"></label><label class="field">Alert at %<input name="thresholdPct" value="80" inputmode="numeric"></label><div class="field"><button class="primary" type="submit">Save plan</button></div></form></article>' : "";
    return banner("Budget & Planning · FIN-11", "Plans watch posted debits for a tag or a group.") +
      (alerts.length ? alerts.map(function (alert) { return '<div class="alert ' + (alert.level === "over" ? "over" : "") + '">' + esc(alert.message) + "</div>"; }).join("") : '<div class="callout">No budget alerts right now.</div>') +
      cards + form;
  }

  function viewAudit() {
    var rows = state().audit.slice().reverse().map(function (row) {
      var detail = "";
      if (row.before || row.after) {
        detail = "<details><summary>Snapshot</summary><pre>" + esc(JSON.stringify({ before: row.before, after: row.after }, null, 2)) + "</pre></details>";
      }
      return "<tr><td>" + esc(row.at) + "</td><td>" + esc(row.actor) + "</td><td>" + esc(row.action) + "</td><td>" + esc(row.targetType) + " " + esc(row.targetId) + "</td><td>" + esc(row.summary) + detail + "</td></tr>";
    }).join("");
    return banner("Ledger & Audit · FIN-10", "Every edit, note, rule, reversal, and export is appended. This list cannot be cleared.") +
      '<section class="card callout">Supreme access cannot erase this audit trail, and posted amounts are not rewritten. Corrections are new reversal or adjustment rows.</section>' +
      '<section class="card"><div class="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Summary</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function viewRoles() {
    var settings = state().settings;
    var customer = state().customers.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (settings.customerId === item.id ? " selected" : "") + ">" + esc(item.id + " · " + item.name) + "</option>";
    }).join("");
    var perms = ["view", "create", "edit", "post", "reverse", "note", "export", "import", "toggle", "rules", "request"];
    return banner("Roles & access preview", "Switch Admin/Supreme, Editor, Auditor, or the customer layer without a password.") +
      '<section class="card"><p>Use the preview menu in the top bar. Customer layer filters entries and loans to the selected customer id and hides internal notes.</p>' +
      '<label class="field">Customer id<select id="customer-id">' + customer + '</select></label>' +
      '<div class="table-wrap"><table class="matrix"><thead><tr><th>Action</th><th>This preview</th></tr></thead><tbody>' +
      perms.map(function (perm) { return "<tr><td>" + esc(perm) + "</td><td>" + (S.can(perm) ? "Allowed" : "Hidden") + "</td></tr>"; }).join("") +
      "</tbody></table></div><p class=\"secret-note\">No PIN, CVV, OTP, or password is collected for this preview.</p></section>";
  }

  function viewHermes() {
    var can = S.can("import");
    return banner("Hermes control", "Manage, configure, export, and restore. Posted history is not a setting.") +
      '<section class="grid-2"><article class="card"><h3>Backup</h3><p class="muted">JSON holds the ledger, groups, notes, rules, and the audit log.</p><div class="actions"><button type="button" class="primary" data-action="export-json">Download JSON</button><button type="button" class="ghost" data-action="export" data-kind="transactions">CSV transactions</button><button type="button" class="ghost" data-action="export" data-kind="groups">CSV groups</button><button type="button" class="ghost" data-action="export" data-kind="loans">CSV loans</button></div>' +
      (can ? '<label class="field" style="margin-top:10px">Restore JSON<input id="restore-file" type="file" accept="application/json"></label><button type="button" class="danger" data-action="ask-reset">Restore sample data</button>' : '<p class="muted">Only Admin/Supreme can restore.</p>') +
      '</article><article class="card"><h3>Display USD rate</h3><p class="muted">Taka per 1 USD. Stored USD amounts stay as entered; only the combined view changes.</p><form id="fx-form" class="form-grid" autocomplete="off"><label class="field">BDT per USD<input name="usdRate" value="' + esc(String(state().settings.usdRate)) + '"' + (S.can("toggle") ? "" : " readonly") + '></label><div class="field"><button class="primary" type="submit"' + (S.can("toggle") ? "" : " disabled") + '>Save rate</button></div></form><p class="secret-note">Module toggles live in the sidebar. Turning one off hides it; it does not delete its records.</p></article></section>';
  }

  function viewReports() {
    var month = S.monthKpis();
    var byTag = {};
    state().transactions.forEach(function (tx) {
      if (tx.status !== "posted" || tx.direction !== "debit" || !S.inRoleScope(tx)) return;
      (tx.tags.length ? tx.tags : ["untagged"]).forEach(function (tag) {
        byTag[tag] = (byTag[tag] || 0) + F.toBDT(tx.amount, tx.currency, state().settings.usdRate);
      });
    });
    var tags = Object.keys(byTag).sort().map(function (tag) {
      return "<tr><td>#" + esc(tag) + "</td><td>" + esc(money(byTag[tag])) + "</td></tr>";
    }).join("");
    return banner("Reports · FIN-09", "Figures are calculated from posted ledger lines.") +
      '<section class="stat-row">' + kpi("Month income", esc(money(month.income)), "") + kpi("Month expense", esc(money(month.expense)), "") + kpi("Fees", esc(money(month.fees)), "") + kpi("Net", esc(money(month.net)), "") + "</section>" +
      '<section class="card"><div class="card-head"><h2>Posted debit by tag</h2><button type="button" class="primary" data-action="export" data-kind="transactions">Export CSV</button></div><div class="table-wrap"><table><thead><tr><th>Tag</th><th>Amount</th></tr></thead><tbody>' + (tags || '<tr><td colspan="2">No posted debits.</td></tr>') + "</tbody></table></div></section>";
  }

  function viewAssets() {
    var rows = state().assets.map(function (asset) {
      return "<tr><td>" + esc(asset.name) + "</td><td>" + esc(asset.kind) + "</td><td>" + esc(money(asset.value, asset.currency)) + "</td><td>" + esc(asset.status) + "</td><td>" + esc(asset.note || "") + "</td></tr>";
    }).join("");
    var form = S.can("create") ? '<form id="asset-form" class="form-grid" autocomplete="off"><label class="field">Name<input name="name" required></label><label class="field">Kind<input name="kind" value="Equipment"></label><label class="field">Value<input name="value" required inputmode="decimal"></label><label class="field">Note<input name="note"></label><div class="field"><button class="primary" type="submit">Add asset</button></div></form>' : "";
    return banner("Assets & investment", "Asset values are not added to liquid cash.") + '<section class="card">' + form + '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Kind</th><th>Value</th><th>Status</th><th>Note</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function viewCharity() {
    var rows = state().charities.map(function (row) {
      return "<tr><td>" + esc(row.beneficiary) + "</td><td>" + esc(money(row.principal)) + "</td><td>" + esc(money(row.fee)) + "</td><td>" + esc(row.txId) + "</td><td>" + esc(row.note || "") + "</td></tr>";
    }).join("");
    var form = S.can("create") ? '<form id="charity-form" class="form-grid" autocomplete="off"><label class="field">Beneficiary<input name="beneficiary" required></label><label class="field">Principal<input name="principal" required inputmode="decimal"></label><label class="field">Fee<input name="fee" value="0" inputmode="decimal"></label><label class="field">Note<input name="note"></label><div class="field"><button class="primary" type="submit">Post charity</button></div></form>' : "";
    return banner("Charity", "The fee is its own charge line. It is not folded into the donation principal.") + '<section class="card">' + form + '<div class="table-wrap"><table><thead><tr><th>Beneficiary</th><th>Principal</th><th>Fee</th><th>Ledger</th><th>Note</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function viewRecon() {
    var rows = state().accounts.map(function (account) {
      var action = "";
      if (account.reconStatus !== "matched" && S.can("edit") && !account.reconAck) {
        action = '<button type="button" class="ghost small" data-action="ack-recon" data-id="' + esc(account.id) + '">Keep unallocated</button>';
      } else if (account.reconAck) action = '<span class="pill pending">Held</span>';
      return "<tr><td>" + esc(accountName(account.id)) + "</td><td>" + esc(account.reconStatus) + "</td><td>" + esc(account.reconNote || "—") + "</td><td>" + action + "</td></tr>";
    }).join("");
    var pending = S.filteredTransactions({ status: "pending" });
    return banner("Reconciliation", "A gap stays unexplained until someone reviews it. Balances are not forced equal.") +
      '<section class="card"><div class="table-wrap"><table><thead><tr><th>Account</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></section>" +
      '<section class="card"><h3>Pending review</h3>' + txTable(pending, false) + "</section>";
  }

  function viewRequest() {
    var list = state().requests.map(function (item) {
      return "<tr><td>" + esc(item.purpose) + "</td><td>" + esc(money(item.amount)) + "</td><td>" + esc(item.customerId || "—") + "</td><td>" + esc(item.txId) + "</td><td>Pending</td></tr>";
    }).join("");
    var form = S.can("request") ? '<form id="request-form" class="form-grid" autocomplete="off"><label class="field">Payee<input name="party" required></label><label class="field">Purpose<input name="purpose" required></label><label class="field">Amount<input name="amount" required inputmode="decimal"></label><label class="field">Customer ID<input name="customerId"' + (state().settings.role === "customer" ? " readonly value=\"" + esc(state().settings.customerId) + "\"" : "") + '></label><label class="field full">Note<textarea name="note" rows="2"></textarea></label><div class="field"><button class="primary" type="submit">Submit request</button></div></form>' : '<p class="muted">This preview cannot file a request.</p>';
    return banner("Request link", "External and cross-page requests land here as pending ledger rows. Nothing is paid automatically.") +
      '<section class="card">' + form + '<div class="table-wrap"><table><thead><tr><th>Purpose</th><th>Amount</th><th>Customer</th><th>Ledger</th><th>Status</th></tr></thead><tbody>' + (list || '<tr><td colspan="5">No requests yet.</td></tr>') + "</tbody></table></div></section>";
  }

  function openDrawer(extra, editId) {
    if (!S.can(editId ? "edit" : "create")) { toast("This preview role cannot add entries."); return; }
    ui.drawer = { id: editId || "", form: extra };
    document.body.classList.add("drawer-open");
    document.getElementById("scrim").hidden = false;
    paintDrawer();
  }

  function closeDrawer() {
    ui.drawer = null;
    document.body.classList.remove("drawer-open");
    if (!document.body.classList.contains("nav-open")) document.getElementById("scrim").hidden = true;
    document.getElementById("drawer").innerHTML = "";
  }

  function paintDrawer() {
    var form = ui.drawer.form;
    var groups = state().groups;
    document.getElementById("drawer").innerHTML =
      '<div class="card-head"><h2>' + (ui.drawer.id ? "Edit draft" : "Quick Add") + '</h2><button type="button" class="ghost" data-action="close-drawer">Close</button></div>' +
      '<form id="tx-form" class="' + (form.direction === "transfer" ? "is-transfer" : "") + '" autocomplete="off"><div class="seg" style="margin-bottom:8px">' +
      ["credit", "debit", "transfer"].map(function (dir) {
        var label = dir === "credit" ? "Income" : dir === "debit" ? "Expense" : "Transfer";
        return '<label class="ghost" style="display:inline-flex;gap:6px;align-items:center"><input type="radio" name="direction" value="' + dir + '"' + (form.direction === dir ? " checked" : "") + "> " + label + "</label>";
      }).join("") + "</div>" +
      '<div class="form-grid"><label class="field">Amount<input name="amount" required inputmode="decimal" value="' + esc(form.amount) + '"></label>' +
      '<label class="field">Currency<select name="currency"><option' + (form.currency === "BDT" ? " selected" : "") + '>BDT</option><option' + (form.currency === "USD" ? " selected" : "") + '>USD</option></select></label>' +
      '<label class="field">Fee<input name="fee" inputmode="decimal" value="' + esc(form.fee) + '"></label>' +
      '<label class="field">Date<input type="date" name="date" value="' + esc(form.date) + '"></label>' +
      '<label class="field">Time<input type="time" name="time" value="' + esc(form.time) + '"></label>' +
      '<label class="field">Channel<select name="channel">' + ["cash", "bank", "mfs", "card"].map(function (ch) { return '<option' + (form.channel === ch ? " selected" : "") + ">" + ch + "</option>"; }).join("") + "</select></label>" +
      '<label class="field full">Account<select name="accountId">' + state().accounts.map(function (account) { return '<option value="' + esc(account.id) + '"' + (form.accountId === account.id ? " selected" : "") + ">" + esc(accountName(account.id)) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field full only-transfer">Destination<select name="counterAccountId">' + state().accounts.map(function (account) { return '<option value="' + esc(account.id) + '"' + (form.counterAccountId === account.id ? " selected" : "") + ">" + esc(accountName(account.id)) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field">Party<input name="party" value="' + esc(form.party) + '"></label>' +
      '<label class="field">Description<input name="description" value="' + esc(form.description) + '"></label>' +
      '<label class="field">Category<select name="category">' + ["Income", "Expense", "Transfer", "Loan", "Charity", "Charge"].map(function (cat) { return '<option' + (form.category === cat ? " selected" : "") + ">" + cat + "</option>"; }).join("") + "</select></label>" +
      '<label class="field">Purpose<input name="purpose" value="' + esc(form.purpose) + '"></label>' +
      '<label class="field full">Tags<input name="tags" value="' + esc(form.tags) + '" placeholder="bazaar_market, personal, private"></label>' +
      '<div class="field full actions"><button type="button" class="ghost small" data-action="add-preset" data-tag="bazaar_market">#bazaar_market</button><button type="button" class="ghost small" data-action="add-preset" data-tag="personal">#personal</button><button type="button" class="ghost small" data-action="add-preset" data-tag="private">#private</button></div>' +
      '<label class="field">Existing group<select name="groupId"><option value="">None</option>' + groups.map(function (group) { return '<option value="' + esc(group.id) + '"' + (form.groupId === group.id ? " selected" : "") + ">" + esc(group.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field">Or new group<input name="newGroup" value="' + esc(form.newGroup || "") + '"></label>' +
      '<label class="field">Reference / pass<input name="referenceNo" value="' + esc(form.referenceNo) + '"></label>' +
      '<label class="field">Admin reference<input name="adminRef" value="' + esc(form.adminRef) + '"></label>' +
      '<label class="field">TrxID<input name="trxId" value="' + esc(form.trxId) + '"></label>' +
      '<label class="field">Customer ID<input name="customerId" value="' + esc(form.customerId) + '"></label>' +
      '<label class="field full">Note<textarea name="note" rows="2">' + esc(form.note || "") + "</textarea></label>" +
      '<details class="field full"><summary>School / classroom / section</summary><div class="form-grid"><label class="field">School<input name="school" value="' + esc(form.school) + '"></label><label class="field">Classroom<input name="classroom" value="' + esc(form.classroom) + '"></label><label class="field">Section<input name="section" value="' + esc(form.section) + '"></label></div></details>' +
      "</div><div class=\"actions\" style=\"margin-top:10px\">" +
      (ui.drawer.id ? '<button type="button" class="ghost" data-action="save-drawer" data-status="keep">Save draft</button><button type="button" class="primary" data-action="save-drawer" data-status="posted">Post to ledger</button>' : '<button type="button" class="ghost" data-action="save-drawer" data-status="draft">Save draft</button><button type="button" class="primary" data-action="save-drawer" data-status="posted">Post to ledger</button>') +
      "</div></form>";
  }

  function readForm(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (data[key] == null) data[key] = value;
    });
    return data;
  }

  function saveDrawer(status) {
    var form = document.getElementById("tx-form");
    if (!form) return;
    var data = readForm(form);
    data.tags = String(data.tags || "").split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    ui.suspend = true;
    if (data.newGroup && String(data.newGroup).trim()) {
      var created = S.addGroup({ name: data.newGroup.trim(), referenceNo: data.referenceNo, adminRef: data.adminRef });
      if (!created.ok) { ui.suspend = false; toast(created.error); return; }
      data.groupId = created.id;
    }
    var result;
    if (ui.drawer && ui.drawer.id) {
      result = S.updateDraft(ui.drawer.id, data);
      if (result.ok && status === "posted") result = S.setStatus(ui.drawer.id, "posted");
    } else {
      data.status = status === "posted" ? "posted" : "draft";
      result = S.addTransaction(data);
    }
    if (result.ok && data.note && String(data.note).trim()) {
      S.addNote("transaction", result.id || (ui.drawer && ui.drawer.id), String(data.note).trim(), "internal");
    }
    ui.suspend = false;
    if (!result.ok) { render(); toast(result.error); return; }
    closeDrawer();
    render();
    toast(status === "posted" ? "Posted to the ledger." : "Draft saved.");
  }

  function openModal(modal) {
    ui.modal = modal;
    paintModal();
  }

  function closeModal(silent) {
    ui.modal = null;
    var el = document.getElementById("modal");
    el.hidden = true;
    el.innerHTML = "";
    if (!silent) { /* closed by the user */ }
  }

  function paintModal() {
    var modal = ui.modal;
    if (!modal) return;
    var html = "";
    if (modal.kind === "notes") html = notesModal(modal);
    else if (modal.kind === "reverse") html = '<div class="modal"><h3>Reverse ' + esc(modal.id) + '</h3><p class="muted">The original posted row stays. A matching opposite entry is added.</p><label class="field">Reason<textarea id="modal-reason" rows="3"></textarea></label><div class="actions"><button type="button" class="primary" data-action="do-reverse" data-id="' + esc(modal.id) + '">Post reversal</button><button type="button" class="ghost" data-action="close-modal">Cancel</button></div></div>';
    else if (modal.kind === "adjust") html = '<div class="modal"><h3>Adjust ' + esc(modal.id) + '</h3><p class="muted">Enter the corrected principal. The difference is posted as a new row.</p><label class="field">Corrected amount<input id="modal-amount" inputmode="decimal"></label><label class="field">Reason<textarea id="modal-reason" rows="3"></textarea></label><div class="actions"><button type="button" class="primary" data-action="do-adjust" data-id="' + esc(modal.id) + '">Post adjustment</button><button type="button" class="ghost" data-action="close-modal">Cancel</button></div></div>';
    else if (modal.kind === "group") html = groupModal();
    else if (modal.kind === "archive") html = '<div class="modal"><h3>Archive this draft?</h3><p>The row leaves the active log and stays in the audit trail. Posted rows cannot be archived.</p><div class="actions"><button type="button" class="danger" data-action="do-archive" data-id="' + esc(modal.id) + '">Archive</button><button type="button" class="ghost" data-action="close-modal">Cancel</button></div></div>';
    else if (modal.kind === "reset") html = '<div class="modal"><h3>Restore sample data?</h3><p>This replaces the ledger in this browser with the demo books.</p><div class="actions"><button type="button" class="danger" data-action="do-reset">Restore sample</button><button type="button" class="ghost" data-action="close-modal">Cancel</button></div></div>';
    var host = document.getElementById("modal");
    host.innerHTML = html;
    host.hidden = false;
  }

  function notesModal(modal) {
    var list = modal.target === "transaction" ? state().transactions : modal.target === "group" ? state().groups : state().loans;
    var row = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === modal.id) row = list[i];
    if (!row) return '<div class="modal"><p>That record is gone.</p></div>';
    var notes = S.visibleNotes(row.notes || []).map(noteBlock).join("") || '<p class="muted">No visible notes yet.</p>';
    var tagEditor = row.tags && S.can("edit") ? '<label class="field">Tags<input id="modal-tags" value="' + esc((row.tags || []).join(", ")) + '"></label><button type="button" class="ghost" data-action="save-tags" data-kind="' + esc(modal.target) + '" data-id="' + esc(row.id) + '">Save tags</button>' : "<div>" + tagsHtml(row.tags) + "</div>";
    var composer = S.can("note") ? '<label class="field">New note<textarea id="modal-note" rows="3"></textarea></label><label class="field">Visibility<select id="modal-vis"><option value="internal">Internal</option><option value="customer">Customer-visible</option></select></label><button type="button" class="primary" data-action="save-note" data-kind="' + esc(modal.target) + '" data-id="' + esc(row.id) + '">Add note</button>' : "";
    return '<div class="modal"><div class="card-head"><h3>Notes · ' + esc(row.name || row.description || row.party || row.id) + '</h3><button type="button" class="ghost" data-action="close-modal">Close</button></div>' + tagEditor + notes + composer + '<p class="secret-note">Notes are append-only and keep a timestamp.</p></div>';
  }

  function groupModal() {
    var ids = selectedIds();
    return '<div class="modal"><h3>Group ' + ids.length + ' selected</h3><label class="field">Existing group<select id="modal-group"><option value="">Choose…</option>' +
      state().groups.map(function (group) { return '<option value="' + esc(group.id) + '">' + esc(group.name) + "</option>"; }).join("") +
      '</select></label><label class="field">Or create<input id="modal-new-group" placeholder="Group name"></label><div class="actions"><button type="button" class="primary" data-action="do-link">Link</button><button type="button" class="ghost" data-action="close-modal">Cancel</button></div></div>';
  }

  function accountForParsed(parsed) {
    if (parsed.accountMask) {
      var digits = String(parsed.accountMask).replace(/\D/g, "");
      var found = state().accounts.filter(function (account) {
        return digits && String(account.masked).replace(/\D/g, "").slice(-digits.length) === digits;
      })[0];
      if (found) return found.id;
    }
    return { bKash: "acc-bkash", Nagad: "acc-nagad", Rocket: "acc-rocket", Upay: "acc-upay", Bank: "acc-brac" }[parsed.provider] || "acc-cash";
  }

  var SAMPLES = {
    new: "bKash: You have received Tk 2,400.00 from 01711000000. Fee Tk 0.00. Balance Tk 2,50,000.00. TrxID 9FHNEW2400 at 20/11/2026 11:40",
    dup: "bKash: You have received Tk 12,000.00 from 01711000000. Fee Tk 0.00. Balance Tk 2,48,600.00. TrxID 8BKASHDEMO1 at 20/11/2026 09:02",
    otp: "Your bKash OTP is 482193. Do not share this verification code."
  };

  document.getElementById("menu-btn").addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
    document.getElementById("scrim").hidden = !document.body.classList.contains("nav-open") && !document.body.classList.contains("drawer-open");
  });
  document.getElementById("scrim").addEventListener("click", function () {
    document.body.classList.remove("nav-open");
    closeDrawer();
  });
  document.getElementById("quick-add").addEventListener("click", function () { openDrawer(blankForm()); });
  document.getElementById("role-select").addEventListener("change", function (event) {
    var result = S.setRole(event.target.value);
    if (!result.ok) { toast(result.error); event.target.value = state().settings.role; }
  });
  document.getElementById("global-search").addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    ui.filters.q = event.target.value.trim();
    ui.txTab = "log";
    if (location.hash !== "#/transactions") location.hash = "#/transactions";
    else render();
  });

  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-action]");
    if (!el) return;
    var action = el.dataset.action;
    if (el.closest(".nav")) {
      document.body.classList.remove("nav-open");
      if (!document.body.classList.contains("drawer-open")) document.getElementById("scrim").hidden = true;
    }
    var fn = handlers[action];
    if (!fn) return;
    if (el.tagName !== "A") event.preventDefault();
    fn(el, event);
  });

  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.hasAttribute("data-select")) {
      ui.selected[target.getAttribute("data-select")] = target.checked;
      var count = document.getElementById("sel-count");
      if (count) count.textContent = String(selectedIds().length);
      return;
    }
    if (target.hasAttribute("data-filter")) {
      ui.filters[target.getAttribute("data-filter")] = target.value;
      var body = document.getElementById("tx-body");
      if (body && route() === "transactions" && ui.txTab === "log") {
        var rows = S.filteredTransactions(ui.filters);
        body.innerHTML = rows.length ? rows.map(function (tx) { return txRow(tx, S.can("edit")); }).join("") : '<tr><td colspan="9" class="muted">No rows match.</td></tr>';
      } else render();
      return;
    }
    if (target.name === "direction" && target.form && target.form.id === "tx-form") {
      target.form.classList.toggle("is-transfer", target.value === "transfer");
      var category = target.form.querySelector("[name=category]");
      if (category) category.value = target.value === "credit" ? "Income" : target.value === "transfer" ? "Transfer" : "Expense";
    }
    if (target.id === "customer-id") {
      S.setCustomer(target.value);
      toast("Customer preview set to " + target.value);
    }
    if (target.id === "restore-file" && target.files && target.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var result = S.importJSON(JSON.parse(String(reader.result)));
          toast(result.ok ? "Backup restored." : result.error);
        } catch (err) {
          toast("That file is not valid JSON.");
        }
      };
      reader.readAsText(target.files[0]);
    }
    if (target.getAttribute("data-action") === "group-status") {
      var result = S.updateGroup(target.getAttribute("data-id"), { status: target.value });
      if (!result.ok) toast(result.error);
    }
  });

  document.addEventListener("input", function (event) {
    if (event.target.id === "sms-text") ui.smsText = event.target.value;
    if (event.target.hasAttribute("data-filter") && event.target.tagName === "INPUT") {
      ui.filters[event.target.getAttribute("data-filter")] = event.target.value;
      var body = document.getElementById("tx-body");
      if (body && route() === "transactions" && ui.txTab === "log") {
        var rows = S.filteredTransactions(ui.filters);
        body.innerHTML = rows.length ? rows.map(function (tx) { return txRow(tx, S.can("edit")); }).join("") : '<tr><td colspan="9" class="muted">No rows match.</td></tr>';
      }
    }
  });

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (form.id === "group-form") {
      event.preventDefault();
      var data = readForm(form);
      data.tags = String(data.tags || "").split(",");
      var result = S.addGroup(data);
      toast(result.ok ? "Group created." : result.error);
    } else if (form.id === "rule-form") {
      event.preventDefault();
      var rule = readForm(form);
      rule.addTags = String(rule.addTags || "").split(",");
      var saved = S.addRule(rule);
      toast(saved.ok ? "Rule saved." : saved.error);
    } else if (form.id === "loan-form") {
      event.preventDefault();
      var loan = readForm(form);
      loan.disburse = loan.disburse !== "no";
      var opened = S.addLoan(loan);
      toast(opened.ok ? "Khata opened." : opened.error);
    } else if (form.classList.contains("repay-form")) {
      event.preventDefault();
      var pay = readForm(form);
      var paid = S.addRepayment(form.getAttribute("data-id"), pay);
      toast(paid.ok ? "Repayment posted. Remaining " + money(paid.remaining) : paid.error);
    } else if (form.id === "plan-form") {
      event.preventDefault();
      var plan = S.addPlan(readForm(form));
      toast(plan.ok ? "Plan saved." : plan.error);
    } else if (form.id === "merchant-form") {
      event.preventDefault();
      var merchant = S.addMerchant(readForm(form));
      toast(merchant.ok ? "Merchant added." : merchant.error);
    } else if (form.id === "asset-form") {
      event.preventDefault();
      var asset = S.addAsset(readForm(form));
      toast(asset.ok ? "Asset noted." : asset.error);
    } else if (form.id === "charity-form") {
      event.preventDefault();
      var charity = S.addCharity(readForm(form));
      toast(charity.ok ? "Charity posted." : charity.error);
    } else if (form.id === "request-form") {
      event.preventDefault();
      var request = S.addRequest(readForm(form));
      toast(request.ok ? "Request saved as pending. Nothing was paid." : request.error);
    } else if (form.id === "fx-form") {
      event.preventDefault();
      var fx = S.setUsdRate(readForm(form).usdRate);
      toast(fx.ok ? "Display rate updated." : fx.error);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (ui.modal) closeModal();
    else if (ui.drawer) closeDrawer();
    document.body.classList.remove("nav-open");
  });

  var handlers = {
    "toggle-module": function (el) {
      var key = el.getAttribute("data-module");
      var result = S.setModule(key, !state().settings.modules[key]);
      if (!result.ok) toast(result.error);
    },
    range: function (el) { ui.range = Number(el.getAttribute("data-days")) || 30; render(); },
    "tx-tab": function (el) { ui.txTab = el.getAttribute("data-tab"); render(); },
    go: function (el) {
      var next = el.getAttribute("data-route");
      if (!routeAllowed(next)) { toast("That module is turned off or hidden for this preview."); return; }
      location.hash = "#/" + next;
    },
    "open-drawer": function (el) {
      openDrawer(blankForm(el.getAttribute("data-account") ? { accountId: el.getAttribute("data-account"), channel: "cash" } : null));
    },
    "open-transfer": function () {
      openDrawer(blankForm({ direction: "transfer", category: "Transfer", accountId: "acc-dbbl", counterAccountId: "acc-cash", channel: "bank" }));
    },
    "close-drawer": function () { closeDrawer(); },
    "add-preset": function (el) {
      var input = document.querySelector('#tx-form [name="tags"]');
      if (!input) return;
      var parts = input.value.split(",").map(function (part) { return part.trim(); }).filter(Boolean);
      if (parts.map(function (part) { return part.toLowerCase(); }).indexOf(el.getAttribute("data-tag")) === -1) parts.push(el.getAttribute("data-tag"));
      input.value = parts.join(", ");
    },
    "save-drawer": function (el) { saveDrawer(el.getAttribute("data-status")); },
    "edit-tx": function (el) {
      var tx = S.txById(el.getAttribute("data-id"));
      if (!tx) return;
      openDrawer(blankForm({
        direction: tx.direction, amount: String(tx.amount), fee: String(tx.fee || ""), currency: tx.currency,
        date: tx.date, time: tx.time, accountId: tx.accountId, counterAccountId: tx.counterAccountId || "acc-brac",
        channel: tx.channel, party: tx.party, description: tx.description, category: tx.category, purpose: tx.purpose,
        tags: (tx.tags || []).join(", "), groupId: tx.groupId, referenceNo: tx.referenceNo, adminRef: tx.adminRef,
        customerId: tx.customerId, school: tx.school, classroom: tx.classroom, section: tx.section, trxId: tx.trxId
      }), tx.id);
    },
    "post-tx": function (el) {
      var result = S.setStatus(el.getAttribute("data-id"), "posted");
      toast(result.ok ? "Posted." : result.error);
    },
    "ask-reverse": function (el) { openModal({ kind: "reverse", id: el.getAttribute("data-id") }); },
    "ask-adjust": function (el) { openModal({ kind: "adjust", id: el.getAttribute("data-id") }); },
    "ask-archive": function (el) { openModal({ kind: "archive", id: el.getAttribute("data-id") }); },
    "do-reverse": function (el) {
      var result = S.reverse(el.getAttribute("data-id"), document.getElementById("modal-reason").value);
      if (!result.ok) { toast(result.error); return; }
      closeModal();
      toast("Reversal posted.");
    },
    "do-adjust": function (el) {
      var result = S.adjust(el.getAttribute("data-id"), document.getElementById("modal-amount").value, document.getElementById("modal-reason").value);
      if (!result.ok) { toast(result.error); return; }
      closeModal();
      toast("Adjustment posted.");
    },
    "do-archive": function (el) {
      var result = S.archive(el.getAttribute("data-id"));
      closeModal();
      toast(result.ok ? "Draft archived." : result.error);
    },
    notes: function (el) { openModal({ kind: "notes", target: el.getAttribute("data-kind"), id: el.getAttribute("data-id") }); },
    "close-modal": function () { closeModal(); },
    "save-note": function (el) {
      var result = S.addNote(el.getAttribute("data-kind"), el.getAttribute("data-id"), document.getElementById("modal-note").value, document.getElementById("modal-vis").value);
      if (!result.ok) toast(result.error);
    },
    "save-tags": function (el) {
      var result = S.setTags(el.getAttribute("data-kind"), el.getAttribute("data-id"), document.getElementById("modal-tags").value.split(","));
      toast(result.ok ? "Tags saved." : result.error);
    },
    "open-group": function (el) {
      ui.groupId = ui.groupId === el.getAttribute("data-id") ? "" : el.getAttribute("data-id");
      render();
    },
    "ask-group": function () {
      if (!selectedIds().length) { toast("Select at least one transaction."); return; }
      openModal({ kind: "group" });
    },
    "do-link": function () {
      var groupId = document.getElementById("modal-group").value;
      var name = document.getElementById("modal-new-group").value.trim();
      ui.suspend = true;
      if (name) {
        var created = S.addGroup({ name: name });
        if (!created.ok) { ui.suspend = false; toast(created.error); return; }
        groupId = created.id;
      }
      var linked = S.linkTransactions(groupId, selectedIds());
      ui.suspend = false;
      if (!linked.ok) { toast(linked.error); return; }
      ui.selected = {};
      closeModal();
      ui.txTab = "groups";
      ui.groupId = groupId;
      render();
      toast("Linked " + linked.linked + " entries.");
    },
    "toggle-rule": function (el) {
      var rule = state().rules.filter(function (item) { return item.id === el.getAttribute("data-id"); })[0];
      if (!rule) return;
      S.updateRule(rule.id, { enabled: !rule.enabled });
    },
    "delete-rule": function (el) {
      var result = S.deleteRule(el.getAttribute("data-id"));
      toast(result.ok ? "Rule removed. The audit line remains." : result.error);
    },
    "run-rules": function () {
      var result = S.runRules();
      toast(result.ok ? "Rules checked " + result.count + " changed rows." : result.error);
    },
    "parse-sms": function () {
      ui.smsText = document.getElementById("sms-text").value;
      ui.smsParsed = S.parseSms(ui.smsText);
      render();
    },
    "sample-sms": function (el) {
      ui.smsText = SAMPLES[el.getAttribute("data-sample")] || "";
      ui.smsParsed = S.parseSms(ui.smsText);
      render();
    },
    "save-sms": function (el) {
      var parsed = ui.smsParsed;
      if (!parsed || !parsed.ok) { toast("Parse a transaction SMS first."); return; }
      var status = el.getAttribute("data-status") || "pending";
      ui.suspend = true;
      var result = S.addTransaction({
        direction: parsed.direction || "credit",
        amount: parsed.amount,
        fee: parsed.fee || 0,
        currency: "BDT",
        accountId: accountForParsed(parsed),
        party: parsed.counterparty || parsed.provider || "SMS",
        description: (parsed.provider || "SMS") + " " + (parsed.direction === "debit" ? "out" : "in"),
        trxId: parsed.trxId,
        referenceNo: parsed.referenceNo,
        date: parsed.date || F.todayISO(),
        time: parsed.time || F.dhakaTime(),
        channel: parsed.channel || "mfs",
        provider: parsed.provider,
        category: parsed.direction === "debit" ? "Expense" : "Income",
        purpose: "SMS import",
        source: "sms",
        status: status
      });
      ui.suspend = false;
      if (!result.ok) { toast(result.error); return; }
      ui.smsParsed = null;
      ui.smsText = "";
      ui.txTab = "log";
      render();
      toast(status === "posted" ? "SMS posted to the ledger." : "SMS saved for review.");
    },
    "open-loan": function (el) {
      ui.loanId = ui.loanId === el.getAttribute("data-id") ? "" : el.getAttribute("data-id");
      render();
    },
    "account-mode": function (el) { ui.accountMode = el.getAttribute("data-mode"); render(); },
    pick: function (el) {
      ui.switchSel[el.getAttribute("data-kind")] = el.getAttribute("data-id");
      if (el.getAttribute("data-kind") === "companyId") {
        var inst = institutionsFor(ui.switchSel.companyId)[0];
        if (inst) ui.switchSel.institutionId = inst.id;
      }
      if (el.getAttribute("data-kind") === "companyId" || el.getAttribute("data-kind") === "institutionId") {
        var match = state().accounts.filter(function (account) {
          return account.companyId === ui.switchSel.companyId && account.institutionId === ui.switchSel.institutionId;
        })[0];
        if (match) ui.switchSel.accountId = match.id;
      }
      render();
    },
    "ack-recon": function (el) {
      var result = S.ackRecon(el.getAttribute("data-id"));
      toast(result.ok ? "Left in Unallocated. Balance unchanged." : result.error);
    },
    export: function (el) {
      var result = S.exportCSV(el.getAttribute("data-kind"));
      if (!result.ok) { toast(result.error); return; }
      download(result.filename, result.csv, "text/csv;charset=utf-8");
      toast("CSV downloaded.");
    },
    "export-json": function () {
      var result = S.exportJSON();
      if (!result.ok) { toast(result.error); return; }
      download(result.filename, result.json, "application/json");
      toast("JSON backup downloaded.");
    },
    "ask-reset": function () { openModal({ kind: "reset" }); },
    "do-reset": function () {
      var result = S.resetDemo();
      closeModal();
      closeDrawer();
      toast(result.ok ? "Sample ledger restored." : result.error);
    }
  };

  window.addEventListener("hashchange", function () {
    ui.modal = null;
    closeDrawer();
    render();
  });
  S.subscribe(function () { render(); });
  if (state().settings && document.getElementById("role-select")) render();
})();
