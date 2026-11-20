/* FH Planet Finance — local ledger. Posted rows are never deleted.
   PIN, CVV, OTP, and passwords are not part of this data model. */
(function (root, factory) {
  var FHFormat = root.FHFormat;
  var FHSms = root.FHSms;
  if (!FHFormat && typeof require === "function") FHFormat = require("./format");
  if (!FHSms && typeof require === "function") FHSms = require("./sms");
  var api = factory(FHFormat, FHSms);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined" && window.document && window.localStorage) {
    window.FHStore = api.createFinanceStore(window.localStorage);
  }
  root.FHStoreApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (FHFormat, FHSms) {
  var KEY = "fhplanet.finance.v1";
  var SUMMARY = "fhplanet.finance.summary";

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function makeLines(input) {
    var amount = FHFormat.round2(input.amount);
    var fee = FHFormat.round2(input.fee || 0);
    var currency = input.currency || "BDT";
    var lines = [];
    if (input.direction === "transfer") {
      lines.push({ accountId: input.accountId, head: "principal", direction: "debit", amount: amount, currency: currency });
      lines.push({ accountId: input.counterAccountId, head: "principal", direction: "credit", amount: amount, currency: currency });
      if (fee > 0) lines.push({ accountId: input.accountId, head: "fee", direction: "debit", amount: fee, currency: currency });
    } else {
      var principalDir = input.direction === "credit" ? "credit" : "debit";
      lines.push({ accountId: input.accountId, head: "principal", direction: principalDir, amount: amount, currency: currency });
      if (fee > 0) lines.push({ accountId: input.accountId, head: "fee", direction: "debit", amount: fee, currency: currency });
    }
    return lines;
  }

  function stamp(date, time) {
    return (date || "2026-11-20") + "T" + (time || "12:00") + ":00+06:00";
  }

  function seedTx(partial) {
    var status = partial.status || "posted";
    var direction = partial.direction;
    var tx = {
      id: partial.id,
      createdAt: stamp(partial.date, partial.time),
      date: partial.date,
      time: partial.time || "12:00",
      direction: direction,
      amount: partial.amount,
      fee: partial.fee || 0,
      currency: partial.currency || "BDT",
      accountId: partial.accountId,
      counterAccountId: partial.counterAccountId || "",
      channel: partial.channel,
      provider: partial.provider,
      party: partial.party || "",
      description: partial.description,
      category: partial.category,
      purpose: partial.purpose || "",
      tags: partial.tags ? partial.tags.slice() : [],
      groupId: partial.groupId || "",
      referenceNo: partial.referenceNo || "",
      adminRef: partial.adminRef || "",
      trxId: partial.trxId || "",
      merchantId: partial.merchantId || "",
      customerId: partial.customerId || "",
      school: partial.school || "",
      classroom: partial.classroom || "",
      section: partial.section || "",
      status: status,
      notes: partial.notes ? clone(partial.notes) : [],
      reversalOf: null,
      reversedBy: null,
      adjustmentOf: null,
      source: partial.source || "seed",
      lines: makeLines(partial),
      createdBy: "Sourav",
      postedAt: status === "posted" ? stamp(partial.date, partial.time) : null
    };
    return tx;
  }

  function buildSeed() {
    var companies = [
      { id: "co-org", name: "FH Organization" },
      { id: "co-aca", name: "FH Academy" },
      { id: "co-plt", name: "FH Planet" }
    ];
    var institutions = [
      { id: "inst-brac", name: "BRAC Bank", type: "bank" },
      { id: "inst-dbbl", name: "Dutch-Bangla", type: "bank" },
      { id: "inst-bkash", name: "bKash", type: "mfs" },
      { id: "inst-nagad", name: "Nagad", type: "mfs" },
      { id: "inst-rocket", name: "Rocket", type: "mfs" },
      { id: "inst-upay", name: "Upay", type: "mfs" },
      { id: "inst-card", name: "Card", type: "card" },
      { id: "inst-cash", name: "Cash Box", type: "cash" }
    ];
    var accounts = [
      { id: "acc-brac", companyId: "co-org", institutionId: "inst-brac", name: "Current", masked: "****1234", type: "bank", currency: "BDT", school: "Bank", target: 792300, custodian: "", reconStatus: "matched", reconNote: "", reconAck: false },
      { id: "acc-dbbl", companyId: "co-aca", institutionId: "inst-dbbl", name: "Savings", masked: "****5678", type: "bank", currency: "BDT", school: "Bank", target: 328100, custodian: "", reconStatus: "delta", reconNote: "Statement is ৳1,200 higher. Held in Unallocated — not forced to match.", reconAck: false },
      { id: "acc-bkash", companyId: "co-aca", institutionId: "inst-bkash", name: "Merchant", masked: "01XXXXXXX90", type: "mfs", currency: "BDT", school: "bKash", target: 248600, custodian: "", reconStatus: "matched", reconNote: "", reconAck: false },
      { id: "acc-nagad", companyId: "co-plt", institutionId: "inst-nagad", name: "Personal", masked: "01XXXXXXX67", type: "mfs", currency: "BDT", school: "Nagad", target: 102650, custodian: "", reconStatus: "review", reconNote: "Live SMS feed needs a human check before it can match.", reconAck: false },
      { id: "acc-rocket", companyId: "co-aca", institutionId: "inst-rocket", name: "Agent", masked: "01XXXXXXX12", type: "mfs", currency: "BDT", school: "Rocket", target: 22000, custodian: "", reconStatus: "matched", reconNote: "", reconAck: false },
      { id: "acc-upay", companyId: "co-org", institutionId: "inst-upay", name: "Wallet", masked: "01XXXXXXX33", type: "mfs", currency: "BDT", school: "Upay", target: 13000, custodian: "", reconStatus: "matched", reconNote: "", reconAck: false },
      { id: "acc-card", companyId: "co-org", institutionId: "inst-card", name: "Visa Debit", masked: "***9012", type: "card", currency: "BDT", school: "Card", target: 175000, custodian: "", reconStatus: "matched", reconNote: "", reconAck: false },
      { id: "acc-cash", companyId: "co-org", institutionId: "inst-cash", name: "Main Custodial", masked: "Cash Box", type: "cash", currency: "BDT", school: "Cash", target: 161000, custodian: "Main Cash Box", reconStatus: "matched", reconNote: "", reconAck: false }
    ];
    var cards = [
      { id: "card-visa", accountId: "acc-card", companyId: "co-org", network: "Visa Debit", masked: "***9012", holder: "Sourav", status: "active", assignedRole: "Supreme" },
      { id: "card-pre", accountId: "acc-card", companyId: "co-aca", network: "Prepaid", masked: "***3301", holder: "FH Academy Desk", status: "active", assignedRole: "Editor" }
    ];
    var note = function (id, text, at, visibility) {
      return { id: id, text: text, at: at, by: "Sourav", visibility: visibility || "internal" };
    };
    var transactions = [
      seedTx({ id: "TX-1001", date: "2026-11-20", time: "09:02", direction: "credit", amount: 12000, accountId: "acc-bkash", channel: "mfs", provider: "bKash", party: "FH Academy", description: "FH Academy course fee", category: "Income", purpose: "Tuition", groupId: "GRP-1142", referenceNo: "PASS-0931", adminRef: "ADM-ACA-20", customerId: "CUS-2201", trxId: "8BKASHDEMO1", school: "bKash", classroom: "Credit", section: "e-money", merchantId: "" }),
      seedTx({ id: "TX-1002", date: "2026-11-20", time: "09:20", direction: "credit", amount: 15000, accountId: "acc-bkash", channel: "mfs", provider: "bKash", party: "FH Academy", description: "Course fee batch", category: "Income", purpose: "Tuition", groupId: "GRP-1142", referenceNo: "PASS-0931", adminRef: "ADM-ACA-20", customerId: "CUS-2201", school: "bKash", classroom: "Credit", section: "MFS" }),
      seedTx({ id: "TX-1003", date: "2026-11-20", time: "10:05", direction: "credit", amount: 42000, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "FH Academy", description: "Tuition batch settlement", category: "Income", purpose: "Tuition", school: "Bank", classroom: "Credit", section: "NPSB" }),
      seedTx({ id: "TX-1004", date: "2026-11-20", time: "10:40", direction: "credit", amount: 15500, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Campus desk", description: "Campus cash-in", category: "Income", purpose: "Cash-in", school: "Cash", classroom: "Credit", section: "Cash-in" }),
      seedTx({ id: "TX-1005", date: "2026-11-20", time: "08:47", direction: "debit", amount: 2350, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Office supplies", description: "Office supplies", category: "Expense", purpose: "Office supplies", school: "Cash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1006", date: "2026-11-20", time: "11:10", direction: "debit", amount: 14800, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "City Vendor", description: "Vendor payment", category: "Expense", purpose: "Vendor", school: "Bank", classroom: "Debit", section: "NPSB" }),
      seedTx({ id: "TX-1007", date: "2026-11-20", time: "16:05", direction: "debit", amount: 20130, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Kawran Bazar", description: "Weekly bazaar stock", category: "Expense", purpose: "Staff welfare", tags: ["bazaar_market"], merchantId: "merch-bazar", school: "Cash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1008", date: "2026-11-20", time: "07:55", direction: "transfer", amount: 20000, accountId: "acc-dbbl", counterAccountId: "acc-cash", channel: "bank", provider: "Dutch-Bangla", party: "Main Cash Box", description: "Bank → Cash Box", category: "Transfer", purpose: "Float move", school: "Bank", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1009", date: "2026-11-20", time: "18:10", direction: "debit", amount: 4860, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Kawran Bazar", description: "Weekly bazaar", category: "Expense", purpose: "Staff welfare", tags: ["bazaar_market"], merchantId: "merch-bazar", status: "draft", school: "Cash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1010", date: "2026-11-20", time: "08:12", direction: "debit", amount: 6800, accountId: "acc-nagad", channel: "mfs", provider: "Nagad", party: "Print Hub", description: "Vendor — Print Hub", category: "Expense", purpose: "Printing", tags: ["bazaar_market"], groupId: "GRP-1138", referenceNo: "PASS-0927", adminRef: "ADM-REF-077", merchantId: "merch-print", status: "draft", school: "Nagad", classroom: "Debit", section: "MFS" }),
      seedTx({ id: "TX-1011", date: "2026-11-19", time: "08:30", direction: "credit", amount: 55000, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "Nova Retail Ltd.", description: "Client settlement", category: "Income", purpose: "Project delivery", referenceNo: "INV-2211", adminRef: "ADM-REF-077", merchantId: "merch-nova", status: "pending", school: "Bank", classroom: "Credit", section: "NPSB" }),
      seedTx({ id: "TX-1012", date: "2026-11-19", time: "20:12", direction: "debit", amount: 7500, accountId: "acc-nagad", channel: "mfs", provider: "Nagad", party: "Family", description: "Family medical", category: "Expense", purpose: "Health", tags: ["personal"], school: "Nagad", classroom: "Debit", section: "MFS" }),
      seedTx({ id: "TX-1013", date: "2026-11-18", time: "15:40", direction: "debit", amount: 98000, accountId: "acc-card", channel: "card", provider: "Visa Debit", party: "Tech Land BD", description: "Laptop purchase (asset)", category: "Expense", purpose: "Ops capacity", tags: ["private"], groupId: "GRP-1139", adminRef: "ADM-EQ-01", status: "approved", school: "Card", classroom: "Debit", section: "MFS" }),
      seedTx({ id: "TX-1014", date: "2026-11-18", time: "13:05", direction: "debit", amount: 18450, accountId: "acc-dbbl", channel: "bank", provider: "Dutch-Bangla", party: "Print Hub", description: "Print Hub (3 bills)", category: "Expense", purpose: "Printing", tags: ["bazaar_market"], groupId: "GRP-1138", referenceNo: "PASS-0927", adminRef: "ADM-REF-077", merchantId: "merch-print", school: "Bank", classroom: "Debit", section: "NPSB" }),
      seedTx({ id: "TX-1015", date: "2026-11-17", time: "19:22", direction: "debit", amount: 185, accountId: "acc-bkash", channel: "mfs", provider: "bKash", party: "bKash", description: "MFS cash-out fee", category: "Charge", purpose: "MFS Fee", tags: ["FEE_CHARGE"], school: "bKash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1016", date: "2026-10-22", time: "11:00", direction: "credit", amount: 18000, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "FH Organization", description: "Opening collections", category: "Income", purpose: "Collections", school: "Bank", classroom: "Credit", section: "NPSB" }),
      seedTx({ id: "TX-1017", date: "2026-10-26", time: "17:10", direction: "debit", amount: 3000, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Self", description: "Petty cash", category: "Expense", purpose: "Personal", tags: ["personal"], school: "Cash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1018", date: "2026-10-30", time: "12:15", direction: "credit", amount: 12000, accountId: "acc-bkash", channel: "mfs", provider: "bKash", party: "FH Academy", description: "Workshop fee", category: "Income", purpose: "Tuition", customerId: "CUS-2201", school: "bKash", classroom: "Credit", section: "e-money" }),
      seedTx({ id: "TX-1019", date: "2026-11-03", time: "09:40", direction: "credit", amount: 6000, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Front desk", description: "Counter collection", category: "Income", purpose: "Cash-in", school: "Cash", classroom: "Credit", section: "Cash-in" }),
      seedTx({ id: "TX-1020", date: "2026-11-07", time: "18:20", direction: "debit", amount: 4500, accountId: "acc-nagad", channel: "mfs", provider: "Nagad", party: "Kawran Bazar", description: "Bazaar top-up", category: "Expense", purpose: "Market", tags: ["bazaar_market"], merchantId: "merch-bazar", school: "Nagad", classroom: "Debit", section: "MFS" }),
      seedTx({ id: "TX-1021", date: "2026-11-11", time: "10:10", direction: "credit", amount: 9000, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "FH Organization", description: "Grant tranche", category: "Income", purpose: "Grant", school: "Bank", classroom: "Credit", section: "NPSB" }),
      seedTx({ id: "TX-1022", date: "2026-11-14", time: "14:00", direction: "credit", amount: 4000, accountId: "acc-dbbl", channel: "bank", provider: "Dutch-Bangla", party: "FH Academy", description: "Savings top-up", category: "Income", purpose: "Reserve", school: "Bank", classroom: "Credit", section: "Cash-in" }),
      seedTx({ id: "TX-1023", date: "2026-10-28", time: "11:30", direction: "debit", amount: 50000, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Karim Traders", description: "Loan given — Karim Traders", category: "Loan", purpose: "Working capital", customerId: "CUS-1042", school: "Cash", classroom: "Debit", section: "Cash-out" }),
      seedTx({ id: "TX-1024", date: "2026-11-01", time: "16:45", direction: "credit", amount: 35000, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Karim Traders", description: "Loan repayment — Karim Traders", category: "Loan", purpose: "Repayment", customerId: "CUS-1042", school: "Cash", classroom: "Credit", section: "Cash-in", notes: [note("NT-1", "Repayment received. Thank you.", "2026-11-01T16:50:00+06:00", "customer"), note("NT-2", "Call before the next EMI. Internal follow-up only.", "2026-11-01T16:55:00+06:00", "internal")] }),
      seedTx({ id: "TX-1025", date: "2026-10-29", time: "12:00", direction: "credit", amount: 20000, accountId: "acc-brac", channel: "bank", provider: "BRAC Bank", party: "Nova Retail Ltd.", description: "Loan received — Nova Retail", category: "Loan", purpose: "Bridge", merchantId: "merch-nova", school: "Bank", classroom: "Credit", section: "NPSB" }),
      seedTx({ id: "TX-1026", date: "2026-11-10", time: "09:15", direction: "debit", amount: 5000, fee: 25, accountId: "acc-cash", channel: "cash", provider: "Cash Box", party: "Community kitchen", description: "Community kitchen support", category: "Charity", purpose: "Meal support", school: "Cash", classroom: "Debit", section: "Cash-out" })
    ];

    var rate = 122;
    var net = {};
    transactions.forEach(function (tx) {
      if (tx.status !== "posted") return;
      tx.lines.forEach(function (line) {
        var sign = line.direction === "credit" ? 1 : -1;
        var amt = FHFormat.toBDT(line.amount, line.currency, rate);
        net[line.accountId] = FHFormat.round2((net[line.accountId] || 0) + sign * amt);
      });
    });
    accounts.forEach(function (account) {
      account.openingBalance = FHFormat.round2(account.target - (net[account.id] || 0));
      delete account.target;
    });

    return {
      schema: 1,
      settings: {
        usdRate: 122,
        role: "supreme",
        customerId: "CUS-1042",
        modules: {
          merchant: true,
          loans: true,
          assets: true,
          charity: true,
          recon: true,
          sms: true,
          customerPortal: true
        }
      },
      seq: 5000,
      companies: companies,
      institutions: institutions,
      accounts: accounts,
      cards: cards,
      merchants: [
        { id: "merch-print", name: "Print Hub", category: "Printing", status: "active" },
        { id: "merch-bazar", name: "Kawran Bazar", category: "Market", status: "active" },
        { id: "merch-nova", name: "Nova Retail Ltd.", category: "Client", status: "active" }
      ],
      customers: [
        { id: "CUS-1042", name: "Karim Traders" },
        { id: "CUS-2201", name: "FH Academy Student Batch" }
      ],
      groups: [
        {
          id: "GRP-1142",
          name: "Course fee batch",
          referenceNo: "PASS-0931",
          adminRef: "ADM-ACA-20",
          status: "open",
          tags: ["personal"],
          notes: [note("GN-1", "November student batch — FH Academy. Customer-visible summary.", "2026-11-20T09:05:00+06:00", "customer")],
          createdAt: "2026-11-20T09:00:00+06:00",
          createdBy: "Sourav"
        },
        {
          id: "GRP-1138",
          name: "Vendor — Print Hub",
          referenceNo: "PASS-0927",
          adminRef: "ADM-REF-077",
          status: "pending",
          tags: ["bazaar_market"],
          notes: [note("GN-2", "Three bills under one pass. Internal: confirm paper stock before posting the draft.", "2026-11-18T13:10:00+06:00", "internal")],
          createdAt: "2026-11-18T13:00:00+06:00",
          createdBy: "Sourav"
        },
        {
          id: "GRP-1139",
          name: "Ops equipment",
          referenceNo: "PASS-1139",
          adminRef: "ADM-EQ-01",
          status: "open",
          tags: ["private"],
          notes: [],
          createdAt: "2026-11-18T15:30:00+06:00",
          createdBy: "Sourav"
        }
      ],
      transactions: transactions,
      loans: [
        {
          id: "LN-3001",
          party: "Karim Traders",
          contact: "01710000000",
          direction: "given",
          principal: 50000,
          charge: 0,
          dueDate: "2026-11-25",
          customerId: "CUS-1042",
          disbursementTxId: "TX-1023",
          repaymentTxIds: ["TX-1024"],
          groupId: "",
          status: "open",
          notes: [note("LN-1", "EMI reminder sits on the 7-day plan. Remaining is principal minus posted repayments.", "2026-11-01T17:00:00+06:00", "internal")],
          createdAt: "2026-10-28T11:30:00+06:00"
        },
        {
          id: "LN-3002",
          party: "Nova Retail Ltd.",
          contact: "Nova desk",
          direction: "received",
          principal: 20000,
          charge: 500,
          dueDate: "2026-12-05",
          customerId: "",
          disbursementTxId: "TX-1025",
          repaymentTxIds: [],
          groupId: "",
          status: "open",
          notes: [note("LN-2", "Bridge charge of ৳500 is recorded once on the khata, not added again to the principal line.", "2026-10-29T12:10:00+06:00", "internal")],
          createdAt: "2026-10-29T12:00:00+06:00"
        }
      ],
      plans: [
        { id: "PLN-1", name: "Bazaar & market", scopeType: "tag", scopeId: "bazaar_market", timeframe: "monthly", start: "2026-11-01", end: "2026-11-30", limit: 50000, currency: "BDT", thresholdPct: 80, status: "active" },
        { id: "PLN-2", name: "Personal", scopeType: "tag", scopeId: "personal", timeframe: "monthly", start: "2026-11-01", end: "2026-11-30", limit: 7000, currency: "BDT", thresholdPct: 80, status: "active" },
        { id: "PLN-3", name: "Print Hub pass", scopeType: "group", scopeId: "GRP-1138", timeframe: "custom", start: "2026-11-01", end: "2026-11-30", limit: 30000, currency: "BDT", thresholdPct: 80, status: "active" }
      ],
      deadlines: [
        { id: "DL-1", date: "2026-11-21", title: "Office Rent — FH Organization", amount: 45000, currency: "BDT" },
        { id: "DL-2", date: "2026-11-22", title: "FH Academy Instructor Payout", amount: 62000, currency: "BDT" },
        { id: "DL-3", date: "2026-11-24", title: "Server & Domain (USD)", amount: 85, currency: "USD" },
        { id: "DL-4", date: "2026-11-27", title: "Electricity & Internet", amount: 8400, currency: "BDT" }
      ],
      rules: [
        { id: "RULE-1", name: "Bazaar keyword", enabled: true, field: "description", operator: "contains", value: "bazaar", addTags: ["bazaar_market"], groupName: "", noteTemplate: "" },
        { id: "RULE-2", name: "Cash-out charge", enabled: true, field: "description", operator: "contains", value: "cash-out", addTags: ["FEE_CHARGE"], groupName: "", noteTemplate: "Charge tracked separately from principal." },
        { id: "RULE-3", name: "Print Hub vendor", enabled: true, field: "party", operator: "contains", value: "Print Hub", addTags: ["bazaar_market"], groupName: "Vendor — Print Hub", noteTemplate: "Grouped under the Print Hub pass." }
      ],
      assets: [
        { id: "AS-1", name: "Training laptops", kind: "Equipment", value: 98000, currency: "BDT", note: "Approved card purchase is not liquid cash until it is posted.", status: "planned" }
      ],
      charities: [
        { id: "CH-1", beneficiary: "Community kitchen", principal: 5000, fee: 25, currency: "BDT", txId: "TX-1026", date: "2026-11-10", note: "Fee sits on the charge line, not inside the donation principal." }
      ],
      requests: [],
      audit: [
        {
          id: "AUD-1",
          at: "2026-11-20T08:00:00+06:00",
          actor: "Sourav",
          action: "seed",
          targetType: "ledger",
          targetId: "FIN-ROOT-001",
          summary: "Sample preview ledger loaded. Figures are demo numbers only.",
          before: null,
          after: null
        }
      ]
    };
  }

  function createFinanceStore(storage) {
    var listeners = [];
    var lastError = "";
    var state = load();

    function load() {
      try {
        var raw = storage.getItem(KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.schema === 1 && Array.isArray(parsed.transactions) && Array.isArray(parsed.audit)) {
            return parsed;
          }
        }
      } catch (err) {
        lastError = "Stored ledger could not be read. A fresh sample ledger is ready in this tab.";
      }
      var seeded = buildSeed();
      try {
        storage.setItem(KEY, JSON.stringify(seeded));
        storage.setItem(SUMMARY, JSON.stringify(summarize(seeded)));
      } catch (err2) {
        lastError = "This browser blocked local storage. The sample ledger stays in this tab only.";
      }
      return seeded;
    }

    function emit() {
      listeners.forEach(function (fn) {
        try { fn(state); } catch (err) { /* listener errors stay in the UI */ }
      });
    }

    function persist() {
      try {
        storage.setItem(KEY, JSON.stringify(state));
        storage.setItem(SUMMARY, JSON.stringify(summarize(state)));
        lastError = "";
      } catch (err) {
        lastError = "This browser blocked local storage. Changes stay in this tab only.";
      }
    }

    function actor() {
      var role = state.settings.role;
      if (role === "editor") return "Editor preview";
      if (role === "auditor") return "Auditor preview";
      if (role === "customer") return "Customer " + (state.settings.customerId || "");
      return "Sourav";
    }

    function nowStamp() {
      return FHFormat.todayISO() + "T" + FHFormat.dhakaTime() + ":00+06:00";
    }

    function nextId(prefix) {
      state.seq += 1;
      return prefix + "-" + state.seq;
    }

    function pushAudit(entry) {
      state.audit.push({
        id: nextId("AUD"),
        at: nowStamp(),
        actor: actor(),
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        summary: entry.summary,
        before: entry.before == null ? null : clone(entry.before),
        after: entry.after == null ? null : clone(entry.after)
      });
    }

    function can(action) {
      var role = state.settings.role;
      var allowed = {
        supreme: ["view", "create", "edit", "post", "reverse", "note", "export", "import", "toggle", "rules", "request"],
        editor: ["view", "create", "edit", "post", "reverse", "note", "export", "rules", "request"],
        auditor: ["view", "note", "export"],
        customer: ["view", "request"]
      };
      return (allowed[role] || []).indexOf(action) !== -1;
    }

    function deny(action) {
      if (can(action)) return null;
      return { ok: false, error: "This preview role cannot do that." };
    }

    function accountById(id) {
      for (var i = 0; i < state.accounts.length; i++) if (state.accounts[i].id === id) return state.accounts[i];
      return null;
    }

    function txById(id) {
      for (var i = 0; i < state.transactions.length; i++) if (state.transactions[i].id === id) return state.transactions[i];
      return null;
    }

    function groupById(id) {
      for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === id) return state.groups[i];
      return null;
    }

    function inRoleScope(tx) {
      if (state.settings.role !== "customer") return true;
      return !!(tx.customerId && tx.customerId === state.settings.customerId);
    }

    function lineBDT(line) {
      var sign = line.direction === "credit" ? 1 : -1;
      return sign * FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
    }

    function balancesAsOf(dateISO) {
      var byAccount = {};
      state.accounts.forEach(function (account) {
        byAccount[account.id] = account.openingBalance || 0;
      });
      state.transactions.forEach(function (tx) {
        if (tx.status !== "posted") return;
        if (dateISO && tx.date > dateISO) return;
        tx.lines.forEach(function (line) {
          if (!Object.prototype.hasOwnProperty.call(byAccount, line.accountId)) byAccount[line.accountId] = 0;
          byAccount[line.accountId] = FHFormat.round2(byAccount[line.accountId] + lineBDT(line));
        });
      });
      var roll = { bank: 0, mfs: 0, card: 0, cash: 0, liquid: 0, byAccount: byAccount };
      state.accounts.forEach(function (account) {
        var value = byAccount[account.id] || 0;
        roll[account.type] = FHFormat.round2((roll[account.type] || 0) + value);
        roll.liquid = FHFormat.round2(roll.liquid + value);
      });
      return roll;
    }

    function balances() {
      return balancesAsOf(null);
    }

    function todayKpis(dateISO, opts) {
      var day = dateISO || FHFormat.todayISO();
      var respectRole = !(opts && opts.all);
      var incoming = 0;
      var outgoing = 0;
      var entries = 0;
      var posted = 0;
      var pending = 0;
      state.transactions.forEach(function (tx) {
        if (respectRole && !inRoleScope(tx)) return;
        if (tx.date !== day || tx.status === "archived") return;
        entries += 1;
        if (tx.status === "posted") posted += 1;
        if (tx.status === "pending" || tx.status === "approved") pending += 1;
        if (tx.status !== "posted") return;
        var principal = FHFormat.toBDT(tx.amount, tx.currency, state.settings.usdRate);
        if (tx.direction === "credit") incoming += principal;
        if (tx.direction === "debit") outgoing += principal;
      });
      return {
        date: day,
        in: FHFormat.round2(incoming),
        out: FHFormat.round2(outgoing),
        net: FHFormat.round2(incoming - outgoing),
        entries: entries,
        posted: posted,
        pending: pending
      };
    }

    function monthKpis(iso) {
      var bounds = FHFormat.monthBounds(iso || FHFormat.todayISO());
      var income = 0;
      var expense = 0;
      var fees = 0;
      var count = 0;
      state.transactions.forEach(function (tx) {
        if (!inRoleScope(tx) || tx.status === "archived") return;
        if (tx.date < bounds.start || tx.date > bounds.end) return;
        count += 1;
        if (tx.status !== "posted") return;
        tx.lines.forEach(function (line) {
          var amt = FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
          if (line.head === "fee") fees += amt;
          else if (line.direction === "credit" && tx.direction !== "transfer") income += amt;
          else if (line.direction === "debit" && tx.direction !== "transfer") expense += amt;
        });
      });
      return {
        start: bounds.start,
        end: bounds.end,
        count: count,
        income: FHFormat.round2(income),
        expense: FHFormat.round2(expense),
        fees: FHFormat.round2(fees),
        net: FHFormat.round2(income - expense)
      };
    }

    function series(dayCount) {
      var end = FHFormat.todayISO();
      var count = dayCount || 30;
      var rows = [];
      for (var i = count - 1; i >= 0; i--) {
        var date = FHFormat.addDays(end, -i);
        var bal = balancesAsOf(date);
        rows.push({ date: date, liquid: bal.liquid, bank: bal.bank, mfs: bal.mfs });
      }
      return rows;
    }

    function deadlines(withinDays) {
      var windowDays = withinDays == null ? 7 : withinDays;
      var today = FHFormat.todayISO();
      var rows = [];
      state.deadlines.forEach(function (item) {
        var days = FHFormat.daysUntil(item.date, today);
        if (days >= 0 && days <= windowDays) {
          rows.push({ id: item.id, date: item.date, title: item.title, amount: item.amount, currency: item.currency, days: days, kind: "bill" });
        }
      });
      if (state.settings.modules.loans) {
        state.loans.forEach(function (loan) {
          if (state.settings.role === "customer" && loan.customerId !== state.settings.customerId) return;
          if (!loan.dueDate || loan.status === "closed") return;
          var days = FHFormat.daysUntil(loan.dueDate, today);
          if (days >= 0 && days <= windowDays) {
            var view = loanMath(loan);
            rows.push({
              id: loan.id,
              date: loan.dueDate,
              title: (loan.direction === "given" ? "Loan EMI — " : "Loan due — ") + loan.party,
              amount: view.remaining,
              currency: "BDT",
              days: days,
              kind: "loan"
            });
          }
        });
      }
      rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return rows;
    }

    function findTrx(trxId) {
      if (!trxId) return null;
      var key = String(trxId).trim().toLowerCase();
      for (var i = 0; i < state.transactions.length; i++) {
        var tx = state.transactions[i];
        if (tx.status === "archived") continue;
        if (tx.trxId && tx.trxId.toLowerCase() === key) return tx;
      }
      return null;
    }

    function normalizeTags(tags) {
      var out = [];
      var seen = {};
      (tags || []).forEach(function (tag) {
        var clean = String(tag || "").trim().replace(/^#/, "");
        if (!clean) return;
        var key = clean.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(clean);
      });
      return out;
    }

    function ruleMatches(rule, tx) {
      if (!rule.enabled) return false;
      var hay = String(tx[rule.field] || "").toLowerCase();
      var needle = String(rule.value || "").toLowerCase();
      if (!needle) return false;
      if (rule.operator === "equals") return hay === needle;
      return hay.indexOf(needle) !== -1;
    }

    function ensureGroupByName(name, referenceNo, adminRef) {
      var wanted = String(name || "").trim();
      if (!wanted) return "";
      for (var i = 0; i < state.groups.length; i++) {
        if (state.groups[i].name.toLowerCase() === wanted.toLowerCase()) return state.groups[i].id;
      }
      var id = nextId("GRP");
      state.groups.push({
        id: id,
        name: wanted,
        referenceNo: referenceNo || "",
        adminRef: adminRef || "",
        status: "open",
        tags: [],
        notes: [],
        createdAt: nowStamp(),
        createdBy: actor()
      });
      pushAudit({ action: "group-create", targetType: "group", targetId: id, summary: "Rule opened group " + wanted });
      return id;
    }

    function applyRulesTo(tx, auditEach) {
      var fired = [];
      state.rules.forEach(function (rule) {
        if (!ruleMatches(rule, tx)) return;
        fired.push(rule.name);
        if (rule.addTags && rule.addTags.length) tx.tags = normalizeTags(tx.tags.concat(rule.addTags));
        if (rule.groupName && !tx.groupId) tx.groupId = ensureGroupByName(rule.groupName, tx.referenceNo, tx.adminRef);
        if (rule.noteTemplate) {
          var exists = tx.notes.some(function (n) { return n.text === rule.noteTemplate; });
          if (!exists) {
            tx.notes.push({ id: nextId("NT"), text: rule.noteTemplate, at: nowStamp(), by: "Rule: " + rule.name, visibility: "internal" });
          }
        }
      });
      if (auditEach && fired.length) {
        pushAudit({ action: "rules-applied", targetType: "transaction", targetId: tx.id, summary: "Rules applied: " + fired.join(", ") });
      }
      return fired;
    }

    function validateMoney(input) {
      var direction = input.direction;
      if (["credit", "debit", "transfer"].indexOf(direction) === -1) return "Choose credit, debit, or transfer.";
      var amount = FHFormat.round2(FHFormat.parseAmount(input.amount));
      var fee = FHFormat.round2(FHFormat.parseAmount(input.fee || 0));
      if (!(amount > 0)) return "Amount must be greater than zero.";
      if (fee < 0) return "Fee cannot be negative.";
      var currency = input.currency === "USD" ? "USD" : "BDT";
      if (!accountById(input.accountId)) return "Choose an account.";
      if (direction === "transfer") {
        if (!accountById(input.counterAccountId)) return "Choose the destination account.";
        if (input.counterAccountId === input.accountId) return "Transfer needs two different accounts.";
      }
      return "";
    }

    function buildTx(input, id) {
      var direction = input.direction;
      var amount = FHFormat.round2(FHFormat.parseAmount(input.amount));
      var fee = FHFormat.round2(FHFormat.parseAmount(input.fee || 0));
      var currency = input.currency === "USD" ? "USD" : "BDT";
      var account = accountById(input.accountId);
      var tx = {
        id: id,
        createdAt: nowStamp(),
        date: input.date || FHFormat.todayISO(),
        time: input.time || FHFormat.dhakaTime(),
        direction: direction,
        amount: amount,
        fee: fee,
        currency: currency,
        accountId: input.accountId,
        counterAccountId: direction === "transfer" ? input.counterAccountId : "",
        channel: input.channel || (account ? account.type : ""),
        provider: input.provider || "",
        party: String(input.party || "").slice(0, 120),
        description: String(input.description || "").slice(0, 180),
        category: input.category || (direction === "credit" ? "Income" : direction === "transfer" ? "Transfer" : "Expense"),
        purpose: String(input.purpose || "").slice(0, 80),
        tags: normalizeTags(input.tags),
        groupId: input.groupId || "",
        referenceNo: String(input.referenceNo || "").slice(0, 40),
        adminRef: String(input.adminRef || "").slice(0, 40),
        trxId: String(input.trxId || "").trim(),
        merchantId: input.merchantId || "",
        customerId: input.customerId || "",
        school: input.school || (account ? account.school : ""),
        classroom: input.classroom || (direction === "credit" ? "Credit" : "Debit"),
        section: input.section || "",
        status: input.status || "draft",
        notes: [],
        reversalOf: input.reversalOf || null,
        reversedBy: null,
        adjustmentOf: input.adjustmentOf || null,
        source: input.source || "manual",
        lines: makeLines({
          direction: direction,
          amount: amount,
          fee: fee,
          currency: currency,
          accountId: input.accountId,
          counterAccountId: input.counterAccountId
        }),
        createdBy: actor(),
        postedAt: null
      };
      if (!tx.provider && account) {
        var inst = null;
        for (var i = 0; i < state.institutions.length; i++) if (state.institutions[i].id === account.institutionId) inst = state.institutions[i];
        tx.provider = inst ? inst.name : account.name;
      }
      if (!tx.description) tx.description = tx.category + " " + tx.direction;
      return tx;
    }

    function addTransaction(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var problem = validateMoney(input);
      if (problem) return { ok: false, error: problem };
      if (input.trxId && findTrx(input.trxId)) {
        return { ok: false, error: "TrxID " + input.trxId + " is already on the ledger.", duplicate: true };
      }
      var status = input.status || "draft";
      if (status === "posted" && !can("post")) status = "pending";
      if (["draft", "pending", "approved", "posted"].indexOf(status) === -1) status = "draft";
      var tx = buildTx(input, nextId("TX"));
      tx.status = status;
      if (status === "posted") tx.postedAt = nowStamp();
      var fired = applyRulesTo(tx, false);
      state.transactions.unshift(tx);
      pushAudit({
        action: status === "posted" ? "post" : "create",
        targetType: "transaction",
        targetId: tx.id,
        summary: (status === "posted" ? "Posted " : "Saved " + status + " ") + tx.description + (fired.length ? " · rules: " + fired.join(", ") : ""),
        after: { amount: tx.amount, fee: tx.fee, currency: tx.currency, direction: tx.direction, status: tx.status }
      });
      persist();
      emit();
      return { ok: true, id: tx.id, rules: fired };
    }

    function updateDraft(id, input) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var tx = txById(id);
      if (!tx) return { ok: false, error: "Transaction not found." };
      if (tx.status === "posted" || tx.status === "reversed" || tx.reversedBy) {
        return { ok: false, error: "Posted rows stay as they are. Use a reversal or an adjustment." };
      }
      var problem = validateMoney(input);
      if (problem) return { ok: false, error: problem };
      if (input.trxId && input.trxId !== tx.trxId && findTrx(input.trxId)) {
        return { ok: false, error: "That TrxID is already on the ledger.", duplicate: true };
      }
      var before = { amount: tx.amount, fee: tx.fee, description: tx.description, status: tx.status, accountId: tx.accountId };
      var rebuilt = buildTx(input, tx.id);
      rebuilt.createdAt = tx.createdAt;
      rebuilt.notes = tx.notes;
      rebuilt.source = tx.source;
      rebuilt.status = tx.status;
      rebuilt.createdBy = tx.createdBy;
      Object.keys(rebuilt).forEach(function (key) { tx[key] = rebuilt[key]; });
      pushAudit({ action: "edit-draft", targetType: "transaction", targetId: tx.id, summary: "Draft updated: " + tx.description, before: before, after: { amount: tx.amount, fee: tx.fee, description: tx.description, accountId: tx.accountId } });
      persist();
      emit();
      return { ok: true, id: tx.id };
    }

    function setStatus(id, status) {
      var tx = txById(id);
      if (!tx) return { ok: false, error: "Transaction not found." };
      if (tx.status === "posted") return { ok: false, error: "This row is already posted." };
      if (tx.status === "archived") return { ok: false, error: "Archived drafts stay in the audit history." };
      if (status === "posted") {
        var blocked = deny("post");
        if (blocked) return blocked;
        if (tx.trxId) {
          var other = findTrx(tx.trxId);
          if (other && other.id !== tx.id) return { ok: false, error: "TrxID " + tx.trxId + " is already on the ledger.", duplicate: true };
        }
        tx.status = "posted";
        tx.postedAt = nowStamp();
        pushAudit({ action: "post", targetType: "transaction", targetId: tx.id, summary: "Posted " + tx.description, after: { status: "posted", amount: tx.amount } });
      } else if (status === "pending" || status === "approved" || status === "draft") {
        var blockedEdit = deny("edit");
        if (blockedEdit) return blockedEdit;
        var prev = tx.status;
        tx.status = status;
        pushAudit({ action: "status", targetType: "transaction", targetId: tx.id, summary: "Status " + prev + " → " + status, before: { status: prev }, after: { status: status } });
      } else {
        return { ok: false, error: "Unknown status." };
      }
      persist();
      emit();
      return { ok: true, id: tx.id };
    }

    function archive(id) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var tx = txById(id);
      if (!tx) return { ok: false, error: "Transaction not found." };
      if (tx.status === "posted" || tx.postedAt) return { ok: false, error: "Posted transactions are never deleted. Reverse or adjust them." };
      var prev = tx.status;
      tx.status = "archived";
      pushAudit({ action: "archive-draft", targetType: "transaction", targetId: tx.id, summary: "Draft archived (not deleted): " + tx.description, before: { status: prev }, after: { status: "archived" } });
      persist();
      emit();
      return { ok: true };
    }

    function reverse(id, reason) {
      var blocked = deny("reverse");
      if (blocked) return blocked;
      var tx = txById(id);
      if (!tx) return { ok: false, error: "Transaction not found." };
      if (tx.status !== "posted") return { ok: false, error: "Only a posted row can be reversed." };
      if (tx.reversedBy) return { ok: false, error: "This row already has a reversal." };
      var why = String(reason || "").trim();
      if (why.length < 3) return { ok: false, error: "A short reason is required." };
      var opposite = tx.direction === "credit" ? "debit" : tx.direction === "debit" ? "credit" : "transfer";
      var rev = buildTx({
        direction: opposite,
        amount: tx.amount,
        fee: tx.fee,
        currency: tx.currency,
        accountId: tx.accountId,
        counterAccountId: tx.counterAccountId,
        channel: tx.channel,
        provider: tx.provider,
        party: tx.party,
        description: "Reversal of " + tx.id + " — " + tx.description,
        category: tx.category,
        purpose: "Reversal",
        tags: tx.tags.concat(["reversal"]),
        groupId: tx.groupId,
        referenceNo: tx.referenceNo,
        adminRef: tx.adminRef,
        customerId: tx.customerId,
        merchantId: tx.merchantId,
        school: tx.school,
        classroom: opposite === "credit" ? "Credit" : "Debit",
        section: tx.section,
        source: "reversal",
        reversalOf: tx.id,
        status: "posted",
        date: FHFormat.todayISO(),
        time: FHFormat.dhakaTime()
      }, nextId("TX"));
      rev.lines = tx.lines.map(function (line) {
        return {
          accountId: line.accountId,
          head: line.head,
          direction: line.direction === "credit" ? "debit" : "credit",
          amount: line.amount,
          currency: line.currency
        };
      });
      rev.status = "posted";
      rev.postedAt = nowStamp();
      tx.reversedBy = rev.id;
      state.transactions.unshift(rev);
      pushAudit({ action: "reversal", targetType: "transaction", targetId: tx.id, summary: "Reversal posted for " + tx.id + ". Reason: " + why, before: { status: "posted" }, after: { reversalId: rev.id, reason: why } });
      persist();
      emit();
      return { ok: true, id: rev.id };
    }

    function adjust(id, newAmount, reason) {
      var blocked = deny("reverse");
      if (blocked) return blocked;
      var tx = txById(id);
      if (!tx) return { ok: false, error: "Transaction not found." };
      if (tx.status !== "posted") return { ok: false, error: "Adjustments are posted against a posted row." };
      if (tx.direction === "transfer") return { ok: false, error: "Reverse the transfer and enter it again." };
      var nextAmount = FHFormat.round2(FHFormat.parseAmount(newAmount));
      if (!(nextAmount >= 0)) return { ok: false, error: "Enter the corrected amount." };
      var delta = FHFormat.round2(nextAmount - tx.amount);
      if (delta === 0) return { ok: false, error: "That amount matches the posted row." };
      var why = String(reason || "").trim();
      if (why.length < 3) return { ok: false, error: "A short reason is required." };
      var direction = delta > 0 ? tx.direction : (tx.direction === "credit" ? "debit" : "credit");
      var adj = buildTx({
        direction: direction,
        amount: Math.abs(delta),
        fee: 0,
        currency: tx.currency,
        accountId: tx.accountId,
        channel: tx.channel,
        provider: tx.provider,
        party: tx.party,
        description: "Adjustment of " + tx.id + " — " + tx.description,
        category: tx.category,
        purpose: "Adjustment",
        tags: tx.tags.concat(["adjustment"]),
        groupId: tx.groupId,
        referenceNo: tx.referenceNo,
        adminRef: tx.adminRef,
        customerId: tx.customerId,
        merchantId: tx.merchantId,
        school: tx.school,
        classroom: direction === "credit" ? "Credit" : "Debit",
        section: tx.section,
        source: "adjustment",
        adjustmentOf: tx.id,
        status: "posted",
        date: FHFormat.todayISO(),
        time: FHFormat.dhakaTime()
      }, nextId("TX"));
      adj.status = "posted";
      adj.postedAt = nowStamp();
      state.transactions.unshift(adj);
      pushAudit({
        action: "adjustment",
        targetType: "transaction",
        targetId: tx.id,
        summary: "Adjustment " + tx.amount + " → " + nextAmount + ". Reason: " + why,
        before: { amount: tx.amount },
        after: { adjustmentId: adj.id, correctedAmount: nextAmount, reason: why }
      });
      persist();
      emit();
      return { ok: true, id: adj.id };
    }

    function collection(kind) {
      if (kind === "transaction") return state.transactions;
      if (kind === "group") return state.groups;
      if (kind === "loan") return state.loans;
      return null;
    }

    function addNote(kind, id, text, visibility) {
      var blocked = deny("note");
      if (blocked) return blocked;
      var list = collection(kind);
      if (!list) return { ok: false, error: "Unknown record." };
      var row = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) row = list[i];
      if (!row) return { ok: false, error: "Record not found." };
      var body = String(text || "").trim();
      if (body.length < 1) return { ok: false, error: "Write a note first." };
      if (body.length > 2000) body = body.slice(0, 2000);
      var note = { id: nextId("NT"), text: body, at: nowStamp(), by: actor(), visibility: visibility === "customer" ? "customer" : "internal" };
      row.notes = row.notes || [];
      row.notes.push(note);
      pushAudit({ action: "note", targetType: kind, targetId: id, summary: "Note added on " + id, after: { visibility: note.visibility, text: body } });
      persist();
      emit();
      return { ok: true, id: note.id };
    }

    function setTags(kind, id, tags) {
      if (state.settings.role === "auditor" || state.settings.role === "customer") {
        return { ok: false, error: "Tags are changed by Editor or Admin/Supreme. Auditors can add notes." };
      }
      var blocked = deny("edit");
      if (blocked) return blocked;
      var list = collection(kind);
      if (!list) return { ok: false, error: "Unknown record." };
      var row = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) row = list[i];
      if (!row) return { ok: false, error: "Record not found." };
      var before = (row.tags || []).slice();
      row.tags = normalizeTags(tags);
      pushAudit({ action: "tags", targetType: kind, targetId: id, summary: "Tags updated on " + id, before: { tags: before }, after: { tags: row.tags } });
      persist();
      emit();
      return { ok: true, tags: row.tags };
    }

    function addGroup(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var name = String(input.name || "").trim();
      if (name.length < 2) return { ok: false, error: "Give the group a name." };
      var group = {
        id: nextId("GRP"),
        name: name.slice(0, 80),
        referenceNo: String(input.referenceNo || "").slice(0, 40),
        adminRef: String(input.adminRef || "").slice(0, 40),
        status: "open",
        tags: normalizeTags(input.tags),
        notes: [],
        createdAt: nowStamp(),
        createdBy: actor()
      };
      state.groups.unshift(group);
      if (input.note) {
        group.notes.push({ id: nextId("NT"), text: String(input.note).slice(0, 2000), at: nowStamp(), by: actor(), visibility: "internal" });
      }
      pushAudit({ action: "group-create", targetType: "group", targetId: group.id, summary: "Group created: " + group.name });
      persist();
      emit();
      return { ok: true, id: group.id };
    }

    function updateGroup(id, patch) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var group = groupById(id);
      if (!group) return { ok: false, error: "Group not found." };
      var before = { name: group.name, referenceNo: group.referenceNo, adminRef: group.adminRef, status: group.status };
      if (patch.name) group.name = String(patch.name).trim().slice(0, 80);
      if (patch.referenceNo != null) group.referenceNo = String(patch.referenceNo).slice(0, 40);
      if (patch.adminRef != null) group.adminRef = String(patch.adminRef).slice(0, 40);
      if (patch.status && ["open", "pending", "settled"].indexOf(patch.status) !== -1) group.status = patch.status;
      if (patch.tags) group.tags = normalizeTags(patch.tags);
      pushAudit({ action: "group-update", targetType: "group", targetId: id, summary: "Group updated: " + group.name, before: before, after: { name: group.name, referenceNo: group.referenceNo, adminRef: group.adminRef, status: group.status } });
      persist();
      emit();
      return { ok: true };
    }

    function linkTransactions(groupId, ids) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var group = groupById(groupId);
      if (!group) return { ok: false, error: "Group not found." };
      var linked = 0;
      (ids || []).forEach(function (id) {
        var tx = txById(id);
        if (!tx || tx.groupId === groupId) return;
        var prev = tx.groupId;
        tx.groupId = groupId;
        if (!tx.referenceNo && group.referenceNo) tx.referenceNo = group.referenceNo;
        if (!tx.adminRef && group.adminRef) tx.adminRef = group.adminRef;
        linked += 1;
        pushAudit({ action: "group-link", targetType: "transaction", targetId: tx.id, summary: "Linked " + tx.id + " to " + group.name, before: { groupId: prev }, after: { groupId: groupId } });
      });
      if (!linked) return { ok: false, error: "Select at least one transaction that is not already in this group." };
      persist();
      emit();
      return { ok: true, linked: linked };
    }

    function unlinkTransaction(txId) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var tx = txById(txId);
      if (!tx || !tx.groupId) return { ok: false, error: "This row is not in a group." };
      var prev = tx.groupId;
      tx.groupId = "";
      pushAudit({ action: "group-unlink", targetType: "transaction", targetId: tx.id, summary: "Unlinked " + tx.id + " from " + prev, before: { groupId: prev }, after: { groupId: "" } });
      persist();
      emit();
      return { ok: true };
    }

    function addRule(input) {
      var blocked = deny("rules");
      if (blocked) return blocked;
      var name = String(input.name || "").trim();
      var value = String(input.value || "").trim();
      if (name.length < 2 || value.length < 2) return { ok: false, error: "A rule needs a name and a match value." };
      var rule = {
        id: nextId("RULE"),
        name: name.slice(0, 60),
        enabled: true,
        field: ["description", "party", "channel", "provider", "category", "purpose"].indexOf(input.field) === -1 ? "description" : input.field,
        operator: input.operator === "equals" ? "equals" : "contains",
        value: value.slice(0, 80),
        addTags: normalizeTags(input.addTags),
        groupName: String(input.groupName || "").trim().slice(0, 80),
        noteTemplate: String(input.noteTemplate || "").trim().slice(0, 240)
      };
      state.rules.push(rule);
      pushAudit({ action: "rule-create", targetType: "rule", targetId: rule.id, summary: "Rule created: " + rule.name, after: { field: rule.field, value: rule.value } });
      persist();
      emit();
      return { ok: true, id: rule.id };
    }

    function updateRule(id, patch) {
      var blocked = deny("rules");
      if (blocked) return blocked;
      var rule = null;
      for (var i = 0; i < state.rules.length; i++) if (state.rules[i].id === id) rule = state.rules[i];
      if (!rule) return { ok: false, error: "Rule not found." };
      if (patch.enabled != null) rule.enabled = !!patch.enabled;
      if (patch.value) rule.value = String(patch.value).slice(0, 80);
      if (patch.noteTemplate != null) rule.noteTemplate = String(patch.noteTemplate).slice(0, 240);
      pushAudit({ action: "rule-update", targetType: "rule", targetId: id, summary: (rule.enabled ? "Updated" : "Turned off") + " rule " + rule.name });
      persist();
      emit();
      return { ok: true };
    }

    function deleteRule(id) {
      var blocked = deny("rules");
      if (blocked) return blocked;
      var rule = null;
      state.rules = state.rules.filter(function (item) {
        if (item.id === id) { rule = item; return false; }
        return true;
      });
      if (!rule) return { ok: false, error: "Rule not found." };
      pushAudit({ action: "rule-remove", targetType: "rule", targetId: id, summary: "Rule removed from the active list: " + rule.name, before: rule });
      persist();
      emit();
      return { ok: true };
    }

    function runRules(ids) {
      var blocked = deny("rules");
      if (blocked) return blocked;
      var count = 0;
      state.transactions.forEach(function (tx) {
        if (tx.status === "archived") return;
        if (ids && ids.length && ids.indexOf(tx.id) === -1) return;
        var before = tx.tags.slice();
        var groupBefore = tx.groupId;
        var notesBefore = tx.notes.length;
        var fired = applyRulesTo(tx, false);
        if (before.join("|") !== tx.tags.join("|") || groupBefore !== tx.groupId || tx.notes.length !== notesBefore) {
          count += 1;
          pushAudit({ action: "rules-applied", targetType: "transaction", targetId: tx.id, summary: "Rules re-applied: " + fired.join(", "), before: { tags: before, groupId: groupBefore }, after: { tags: tx.tags, groupId: tx.groupId } });
        }
      });
      persist();
      emit();
      return { ok: true, count: count };
    }

    function loanMath(loan) {
      var paid = 0;
      (loan.repaymentTxIds || []).forEach(function (id) {
        var tx = txById(id);
        if (tx && tx.status === "posted") paid += FHFormat.toBDT(tx.amount, tx.currency, state.settings.usdRate);
      });
      paid = FHFormat.round2(paid);
      var remaining = FHFormat.round2((Number(loan.principal) || 0) + (Number(loan.charge) || 0) - paid);
      return { paid: paid, charge: Number(loan.charge) || 0, principal: Number(loan.principal) || 0, remaining: remaining };
    }

    function addLoan(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      if (!state.settings.modules.loans) return { ok: false, error: "Loan Khata is turned off." };
      var party = String(input.party || "").trim();
      var principal = FHFormat.round2(FHFormat.parseAmount(input.principal));
      if (party.length < 2 || !(principal > 0)) return { ok: false, error: "A loan needs a person and a principal." };
      var direction = input.direction === "received" ? "received" : "given";
      var charge = FHFormat.round2(FHFormat.parseAmount(input.charge || 0));
      if (charge < 0) return { ok: false, error: "Charge cannot be negative." };
      var loan = {
        id: nextId("LN"),
        party: party.slice(0, 80),
        contact: String(input.contact || "").slice(0, 40),
        direction: direction,
        principal: principal,
        charge: charge,
        dueDate: input.dueDate || "",
        customerId: input.customerId || "",
        disbursementTxId: "",
        repaymentTxIds: [],
        groupId: input.groupId || "",
        status: "open",
        notes: [],
        createdAt: nowStamp()
      };
      if (input.disburse) {
        var cash = accountById(input.accountId) ? input.accountId : "acc-cash";
        var txRes = addTransaction({
          direction: direction === "given" ? "debit" : "credit",
          amount: principal,
          fee: 0,
          currency: "BDT",
          accountId: cash,
          party: party,
          description: (direction === "given" ? "Loan given — " : "Loan received — ") + party,
          category: "Loan",
          purpose: direction === "given" ? "Disbursement" : "Receipt",
          customerId: loan.customerId,
          groupId: loan.groupId,
          status: "posted",
          date: input.date || FHFormat.todayISO(),
          school: "Cash",
          classroom: direction === "given" ? "Debit" : "Credit",
          section: direction === "given" ? "Cash-out" : "Cash-in"
        });
        if (!txRes.ok) return txRes;
        loan.disbursementTxId = txRes.id;
      }
      if (input.note) loan.notes.push({ id: nextId("NT"), text: String(input.note).slice(0, 2000), at: nowStamp(), by: actor(), visibility: "internal" });
      state.loans.unshift(loan);
      pushAudit({ action: "loan-create", targetType: "loan", targetId: loan.id, summary: "Khata opened for " + party + " (" + direction + "). Charge recorded once: " + charge });
      persist();
      emit();
      return { ok: true, id: loan.id };
    }

    function addRepayment(loanId, input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var loan = null;
      for (var i = 0; i < state.loans.length; i++) if (state.loans[i].id === loanId) loan = state.loans[i];
      if (!loan) return { ok: false, error: "Loan not found." };
      var amount = FHFormat.round2(FHFormat.parseAmount(input.amount));
      if (!(amount > 0)) return { ok: false, error: "Enter the amount received or paid." };
      var txRes = addTransaction({
        direction: loan.direction === "given" ? "credit" : "debit",
        amount: amount,
        accountId: input.accountId || "acc-cash",
        party: loan.party,
        description: "Loan repayment — " + loan.party,
        category: "Loan",
        purpose: "Repayment",
        customerId: loan.customerId,
        groupId: loan.groupId,
        status: "posted",
        date: input.date || FHFormat.todayISO(),
        note: ""
      });
      if (!txRes.ok) return txRes;
      loan.repaymentTxIds.push(txRes.id);
      var math = loanMath(loan);
      if (math.remaining <= 0) loan.status = "closed";
      pushAudit({ action: "loan-repay", targetType: "loan", targetId: loan.id, summary: "Repayment " + amount + " linked to " + txRes.id + ". Remaining " + math.remaining });
      persist();
      emit();
      return { ok: true, id: txRes.id, remaining: math.remaining };
    }

    function addPlan(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var name = String(input.name || "").trim();
      var limit = FHFormat.round2(FHFormat.parseAmount(input.limit));
      if (name.length < 2 || !(limit > 0)) return { ok: false, error: "A plan needs a name and a limit." };
      var scopeType = input.scopeType === "group" ? "group" : "tag";
      var scopeId = String(input.scopeId || "").trim().replace(/^#/, "");
      if (!scopeId) return { ok: false, error: "Choose a tag or a group." };
      var start = input.start || FHFormat.monthBounds().start;
      var end = input.end || FHFormat.monthBounds().end;
      if (end < start) return { ok: false, error: "The end date is before the start date." };
      var plan = {
        id: nextId("PLN"),
        name: name.slice(0, 80),
        scopeType: scopeType,
        scopeId: scopeId,
        timeframe: input.timeframe === "custom" ? "custom" : "monthly",
        start: start,
        end: end,
        limit: limit,
        currency: input.currency === "USD" ? "USD" : "BDT",
        thresholdPct: Math.min(100, Math.max(1, Number(input.thresholdPct) || 80)),
        status: "active"
      };
      state.plans.unshift(plan);
      pushAudit({ action: "plan-create", targetType: "plan", targetId: plan.id, summary: "Budget plan created: " + plan.name });
      persist();
      emit();
      return { ok: true, id: plan.id };
    }

    function planProgress(plan) {
      var actual = 0;
      state.transactions.forEach(function (tx) {
        if (tx.status !== "posted" || tx.direction === "credit" || tx.direction === "transfer") return;
        if (tx.date < plan.start || tx.date > plan.end) return;
        var match = false;
        if (plan.scopeType === "tag") {
          match = (tx.tags || []).some(function (tag) { return tag.toLowerCase() === plan.scopeId.toLowerCase(); });
        } else {
          match = tx.groupId === plan.scopeId;
        }
        if (!match) return;
        tx.lines.forEach(function (line) {
          if (line.head === "principal" && line.direction === "debit") {
            actual += FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
          }
        });
      });
      actual = FHFormat.round2(actual);
      var limitBDT = plan.currency === "USD" ? FHFormat.toBDT(plan.limit, "USD", state.settings.usdRate) : plan.limit;
      var pct = limitBDT ? Math.round((actual / limitBDT) * 100) : 0;
      var level = "ok";
      if (pct >= 100) level = "over";
      else if (pct >= plan.thresholdPct) level = "warn";
      return { actual: actual, limit: limitBDT, pct: pct, level: level };
    }

    function alerts() {
      var rows = [];
      state.plans.forEach(function (plan) {
        if (plan.status !== "active") return;
        var progress = planProgress(plan);
        if (progress.level === "ok") return;
        rows.push({
          id: plan.id,
          level: progress.level,
          message: plan.name + (progress.level === "over" ? " is over the limit" : " crossed " + plan.thresholdPct + "%") + " · " + FHFormat.money(progress.actual) + " of " + FHFormat.money(progress.limit)
        });
      });
      var liquid = balances().liquid;
      if (liquid < 50000) rows.push({ id: "low-liquid", level: "warn", message: "Liquid cash is under ৳50,000." });
      return rows;
    }

    function addMerchant(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var name = String(input.name || "").trim();
      if (name.length < 2) return { ok: false, error: "Name the merchant." };
      var merchant = { id: nextId("MER"), name: name.slice(0, 80), category: String(input.category || "General").slice(0, 40), status: "active" };
      state.merchants.unshift(merchant);
      pushAudit({ action: "merchant-create", targetType: "merchant", targetId: merchant.id, summary: "Merchant added: " + merchant.name });
      persist();
      emit();
      return { ok: true, id: merchant.id };
    }

    function addAsset(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var name = String(input.name || "").trim();
      var value = FHFormat.round2(FHFormat.parseAmount(input.value));
      if (name.length < 2 || !(value >= 0)) return { ok: false, error: "An asset needs a name and a value." };
      var asset = { id: nextId("AS"), name: name.slice(0, 80), kind: String(input.kind || "Equipment").slice(0, 40), value: value, currency: input.currency === "USD" ? "USD" : "BDT", note: String(input.note || "").slice(0, 240), status: "held" };
      state.assets.unshift(asset);
      pushAudit({ action: "asset-create", targetType: "asset", targetId: asset.id, summary: "Asset noted (not added to liquid cash): " + asset.name });
      persist();
      emit();
      return { ok: true, id: asset.id };
    }

    function addCharity(input) {
      var blocked = deny("create");
      if (blocked) return blocked;
      var beneficiary = String(input.beneficiary || "").trim();
      var principal = FHFormat.round2(FHFormat.parseAmount(input.principal));
      var fee = FHFormat.round2(FHFormat.parseAmount(input.fee || 0));
      if (beneficiary.length < 2 || !(principal > 0)) return { ok: false, error: "Charity needs a beneficiary and a principal." };
      var txRes = addTransaction({
        direction: "debit",
        amount: principal,
        fee: fee,
        accountId: input.accountId || "acc-cash",
        party: beneficiary,
        description: "Charity — " + beneficiary,
        category: "Charity",
        purpose: "Donation",
        status: "posted",
        date: input.date || FHFormat.todayISO()
      });
      if (!txRes.ok) return txRes;
      var row = { id: nextId("CH"), beneficiary: beneficiary, principal: principal, fee: fee, currency: "BDT", txId: txRes.id, date: input.date || FHFormat.todayISO(), note: String(input.note || "").slice(0, 240) };
      state.charities.unshift(row);
      pushAudit({ action: "charity-create", targetType: "charity", targetId: row.id, summary: "Charity principal " + principal + " with fee " + fee + " kept off the principal." });
      persist();
      emit();
      return { ok: true, id: row.id };
    }

    function addRequest(input) {
      var blocked = deny("request");
      if (blocked) return blocked;
      var purpose = String(input.purpose || "").trim();
      var amount = FHFormat.round2(FHFormat.parseAmount(input.amount));
      if (purpose.length < 2 || !(amount > 0)) return { ok: false, error: "A request needs a purpose and an amount." };
      var customerId = state.settings.role === "customer" ? state.settings.customerId : (input.customerId || "");
      var txRes = addTransaction({
        direction: input.direction === "credit" ? "credit" : "debit",
        amount: amount,
        accountId: input.accountId || "acc-cash",
        party: String(input.party || "External request").slice(0, 80),
        description: "Request — " + purpose,
        category: input.direction === "credit" ? "Income" : "Expense",
        purpose: purpose,
        customerId: customerId,
        status: "pending",
        source: "request",
        tags: ["request"]
      });
      if (!txRes.ok) return txRes;
      var req = { id: nextId("REQ"), name: String(input.party || "").slice(0, 80), customerId: customerId, purpose: purpose, amount: amount, note: String(input.note || "").slice(0, 500), createdAt: nowStamp(), txId: txRes.id };
      state.requests.unshift(req);
      pushAudit({ action: "request", targetType: "request", targetId: req.id, summary: "Payment request recorded as pending. Nothing was paid." });
      persist();
      emit();
      return { ok: true, id: req.id, txId: txRes.id };
    }

    function ackRecon(accountId) {
      var blocked = deny("edit");
      if (blocked) return blocked;
      var account = accountById(accountId);
      if (!account) return { ok: false, error: "Account not found." };
      account.reconAck = true;
      pushAudit({ action: "recon-hold", targetType: "account", targetId: accountId, summary: "Gap left in Unallocated for " + account.name + ". Balance was not forced." });
      persist();
      emit();
      return { ok: true };
    }

    function filteredTransactions(filters) {
      var f = filters || {};
      var q = String(f.q || "").trim().toLowerCase();
      return state.transactions.filter(function (tx) {
        if (!inRoleScope(tx)) return false;
        if (f.status && f.status !== "all") {
          if (tx.status !== f.status) return false;
        } else if (tx.status === "archived") return false;
        if (f.channel && f.channel !== "all" && tx.channel !== f.channel) return false;
        if (f.direction && f.direction !== "all" && tx.direction !== f.direction) return false;
        if (f.account && f.account !== "all" && tx.accountId !== f.account && tx.counterAccountId !== f.account) return false;
        if (f.tag && f.tag !== "all") {
          var has = (tx.tags || []).some(function (tag) { return tag.toLowerCase() === f.tag.toLowerCase(); });
          if (!has) return false;
        }
        if (f.from && tx.date < f.from) return false;
        if (f.to && tx.date > f.to) return false;
        if (q) {
          var group = groupById(tx.groupId);
          var blob = [tx.description, tx.party, tx.trxId, tx.referenceNo, tx.adminRef, (tx.tags || []).join(" "), tx.category, tx.purpose, tx.provider, tx.id, group && group.name, group && group.referenceNo, group && group.adminRef].join(" ").toLowerCase();
          if (blob.indexOf(q) === -1) return false;
        }
        return true;
      }).sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        if ((a.time || "") !== (b.time || "")) return (a.time || "") < (b.time || "") ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
    }

    function groupTotals(groupId) {
      var credit = 0;
      var debit = 0;
      var fees = 0;
      var counts = { all: 0, posted: 0, draft: 0, pending: 0 };
      state.transactions.forEach(function (tx) {
        if (tx.groupId !== groupId || tx.status === "archived") return;
        if (!inRoleScope(tx)) return;
        counts.all += 1;
        if (tx.status === "posted") counts.posted += 1;
        if (tx.status === "draft") counts.draft += 1;
        if (tx.status === "pending" || tx.status === "approved") counts.pending += 1;
        if (tx.status !== "posted") return;
        tx.lines.forEach(function (line) {
          var amt = FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
          if (line.head === "fee") fees += amt;
          else if (line.direction === "credit") credit += amt;
          else debit += amt;
        });
      });
      return { credit: FHFormat.round2(credit), debit: FHFormat.round2(debit), fees: FHFormat.round2(fees), net: FHFormat.round2(credit - debit), counts: counts };
    }

    function visibleNotes(notes) {
      var list = notes || [];
      if (state.settings.role !== "customer") return list;
      return list.filter(function (note) { return note.visibility === "customer"; });
    }

    function floatRollup() {
      var schools = {};
      var current = balances();
      function bucket(school) {
        if (!schools[school]) {
          schools[school] = { school: school, balance: 0, credit: 0, debit: 0, sections: {} };
        }
        return schools[school];
      }
      state.accounts.forEach(function (account) {
        var bal = current.byAccount[account.id] || 0;
        bucket(account.school).balance = FHFormat.round2(bucket(account.school).balance + bal);
      });
      state.transactions.forEach(function (tx) {
        if (tx.status !== "posted") return;
        tx.lines.forEach(function (line) {
          if (line.head !== "principal") return;
          var account = accountById(line.accountId);
          var school = account ? account.school : tx.school;
          if (!school) return;
          var node = bucket(school);
          var amt = FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
          var room = line.direction === "credit" ? "Credit" : "Debit";
          if (room === "Credit") node.credit += amt;
          else node.debit += amt;
          var section = line.accountId === tx.accountId ? (tx.section || "Other") : "Transfer";
          var key = room + "|" + section;
          node.sections[key] = FHFormat.round2((node.sections[key] || 0) + amt);
        });
      });
      Object.keys(schools).forEach(function (name) {
        schools[name].credit = FHFormat.round2(schools[name].credit);
        schools[name].debit = FHFormat.round2(schools[name].debit);
      });
      return schools;
    }

    function merchantRollup() {
      return state.merchants.map(function (merchant) {
        var income = 0;
        var expense = 0;
        state.transactions.forEach(function (tx) {
          if (tx.merchantId !== merchant.id || tx.status !== "posted") return;
          var amt = FHFormat.toBDT(tx.amount, tx.currency, state.settings.usdRate);
          if (tx.direction === "credit") income += amt;
          if (tx.direction === "debit") expense += amt;
        });
        return { merchant: merchant, income: FHFormat.round2(income), expense: FHFormat.round2(expense), net: FHFormat.round2(income - expense) };
      });
    }

    function setRole(role) {
      var next = ["supreme", "editor", "auditor", "customer"].indexOf(role) === -1 ? "supreme" : role;
      if (next === "customer" && !state.settings.modules.customerPortal) {
        return { ok: false, error: "Customer portal is turned off." };
      }
      state.settings.role = next;
      pushAudit({ action: "role-preview", targetType: "settings", targetId: next, summary: "Role preview switched to " + next });
      persist();
      emit();
      return { ok: true };
    }

    function setCustomer(id) {
      state.settings.customerId = id;
      pushAudit({ action: "customer-preview", targetType: "settings", targetId: id, summary: "Customer preview id set to " + id });
      persist();
      emit();
      return { ok: true };
    }

    function setModule(key, on) {
      var blocked = deny("toggle");
      if (blocked) return blocked;
      if (!Object.prototype.hasOwnProperty.call(state.settings.modules, key)) return { ok: false, error: "Unknown module." };
      state.settings.modules[key] = !!on;
      if (key === "customerPortal" && !on && state.settings.role === "customer") state.settings.role = "supreme";
      pushAudit({ action: "module-toggle", targetType: "module", targetId: key, summary: key + (on ? " turned on" : " turned off") });
      persist();
      emit();
      return { ok: true };
    }

    function setUsdRate(rate) {
      var blocked = deny("toggle");
      if (blocked) return blocked;
      var n = Number(rate);
      if (!(n > 0)) return { ok: false, error: "The USD rate must be a positive number of taka." };
      var before = state.settings.usdRate;
      state.settings.usdRate = FHFormat.round2(n);
      pushAudit({ action: "fx-rate", targetType: "settings", targetId: "usd", summary: "Display rate updated. Ledger amounts were not rewritten.", before: { usdRate: before }, after: { usdRate: state.settings.usdRate } });
      persist();
      emit();
      return { ok: true };
    }

    function csvCell(value) {
      var s = value == null ? "" : String(value);
      if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    function toCSV(rows) {
      return rows.map(function (row) { return row.map(csvCell).join(","); }).join("\n");
    }

    function exportCSV(kind) {
      var blocked = deny("export");
      if (blocked) return blocked;
      var rows;
      if (kind === "groups") {
        rows = [["group_id", "name", "reference_no", "admin_reference", "status", "tags", "credit_bdt", "debit_bdt", "net_bdt"]];
        state.groups.forEach(function (group) {
          var totals = groupTotals(group.id);
          if (state.settings.role === "customer" && totals.counts.all === 0) return;
          rows.push([group.id, group.name, group.referenceNo, group.adminRef, group.status, (group.tags || []).join("|"), totals.credit, totals.debit, totals.net]);
        });
      } else if (kind === "loans") {
        rows = [["loan_id", "party", "direction", "principal", "charge", "paid", "remaining", "due_date", "customer_id", "status"]];
        state.loans.forEach(function (loan) {
          if (state.settings.role === "customer" && loan.customerId !== state.settings.customerId) return;
          var math = loanMath(loan);
          rows.push([loan.id, loan.party, loan.direction, math.principal, math.charge, math.paid, math.remaining, loan.dueDate, loan.customerId, loan.status]);
        });
      } else {
        rows = [["tx_id", "date", "time", "direction", "amount", "fee", "currency", "status", "account", "party", "description", "category", "purpose", "tags", "group_id", "reference_no", "admin_reference", "trx_id", "customer_id"]];
        state.transactions.forEach(function (tx) {
          if (!inRoleScope(tx)) return;
          var account = accountById(tx.accountId);
          rows.push([tx.id, tx.date, tx.time, tx.direction, tx.amount, tx.fee, tx.currency, tx.status, account ? account.name : tx.accountId, tx.party, tx.description, tx.category, tx.purpose, (tx.tags || []).join("|"), tx.groupId, tx.referenceNo, tx.adminRef, tx.trxId, tx.customerId]);
        });
      }
      pushAudit({ action: "export", targetType: "export", targetId: kind || "transactions", summary: "CSV export (" + (kind || "transactions") + ")" });
      persist();
      emit();
      return { ok: true, filename: "fh-planet-" + (kind || "transactions") + ".csv", csv: toCSV(rows) };
    }

    function exportJSON() {
      var blocked = deny("export");
      if (blocked) return blocked;
      var payload = state;
      if (state.settings.role === "customer") {
        payload = {
          schema: 1,
          customerId: state.settings.customerId,
          transactions: state.transactions.filter(inRoleScope).map(function (tx) {
            var copy = clone(tx);
            copy.notes = visibleNotes(copy.notes);
            return copy;
          }),
          loans: state.loans.filter(function (loan) { return loan.customerId === state.settings.customerId; })
        };
      }
      pushAudit({ action: "export", targetType: "export", targetId: "json", summary: "JSON backup downloaded" });
      persist();
      emit();
      return { ok: true, filename: "fh-planet-finance-backup.json", json: JSON.stringify(payload, null, 2) };
    }

    function importJSON(obj) {
      var blocked = deny("import");
      if (blocked) return blocked;
      var restored;
      try {
        restored = JSON.parse(JSON.stringify(obj));
      } catch (err) {
        return { ok: false, error: "That file could not be read." };
      }
      if (!restored || restored.schema !== 1 || !Array.isArray(restored.transactions) || !Array.isArray(restored.accounts) || !Array.isArray(restored.audit)) {
        return { ok: false, error: "This file is not an FH Planet Finance backup (schema 1)." };
      }
      state = restored;
      if (!state.seq) state.seq = 8000;
      pushAudit({ action: "restore", targetType: "backup", targetId: "json", summary: "JSON backup restored." });
      persist();
      emit();
      return { ok: true };
    }

    function resetDemo() {
      var blocked = deny("import");
      if (blocked) return blocked;
      state = buildSeed();
      pushAudit({ action: "restore-sample", targetType: "ledger", targetId: "sample", summary: "Sample preview ledger restored." });
      persist();
      emit();
      return { ok: true };
    }

    function summarize(source) {
      var previous = state;
      state = source;
      var bal = balances();
      var kpi = todayKpis(FHFormat.todayISO(), { all: true });
      var postedCount = source.transactions.filter(function (tx) { return tx.status === "posted"; }).length;
      var activeGroups = source.groups.filter(function (group) { return group.status !== "settled"; }).length;
      state = previous;
      return {
        totalLiquidBDT: bal.liquid,
        bankBDT: bal.bank,
        mfsBDT: bal.mfs,
        cardBDT: bal.card,
        cashBDT: bal.cash,
        todayInBDT: kpi["in"],
        todayOutBDT: kpi.out,
        todayNetBDT: kpi.net,
        txCount: source.transactions.length,
        postedCount: postedCount,
        openGroups: activeGroups,
        updatedAt: new Date().toISOString()
      };
    }

    function feeReport() {
      var fees = 0;
      state.transactions.forEach(function (tx) {
        if (tx.status !== "posted") return;
        tx.lines.forEach(function (line) {
          if (line.head === "fee") fees += FHFormat.toBDT(line.amount, line.currency, state.settings.usdRate);
        });
      });
      return FHFormat.round2(fees);
    }

    return {
      getState: function () { return state; },
      subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (item) { return item !== fn; }); }; },
      can: can,
      lastError: function () { return lastError; },
      setRole: setRole,
      setCustomer: setCustomer,
      setModule: setModule,
      setUsdRate: setUsdRate,
      balances: balances,
      balancesAsOf: balancesAsOf,
      todayKpis: todayKpis,
      monthKpis: monthKpis,
      series: series,
      deadlines: deadlines,
      alerts: alerts,
      findTrx: findTrx,
      addTransaction: addTransaction,
      updateDraft: updateDraft,
      setStatus: setStatus,
      archive: archive,
      reverse: reverse,
      adjust: adjust,
      addNote: addNote,
      setTags: setTags,
      visibleNotes: visibleNotes,
      addGroup: addGroup,
      updateGroup: updateGroup,
      linkTransactions: linkTransactions,
      unlinkTransaction: unlinkTransaction,
      groupTotals: groupTotals,
      addRule: addRule,
      updateRule: updateRule,
      deleteRule: deleteRule,
      runRules: runRules,
      addLoan: addLoan,
      addRepayment: addRepayment,
      loanMath: loanMath,
      addPlan: addPlan,
      planProgress: planProgress,
      addMerchant: addMerchant,
      addAsset: addAsset,
      addCharity: addCharity,
      addRequest: addRequest,
      ackRecon: ackRecon,
      filteredTransactions: filteredTransactions,
      floatRollup: floatRollup,
      merchantRollup: merchantRollup,
      inRoleScope: inRoleScope,
      exportCSV: exportCSV,
      exportJSON: exportJSON,
      importJSON: importJSON,
      resetDemo: resetDemo,
      feeReport: feeReport,
      accountById: accountById,
      txById: txById,
      groupById: groupById,
      parseSms: FHSms.parseSms
    };
  }

  return { createFinanceStore: createFinanceStore, buildSeed: buildSeed, KEY: KEY, SUMMARY: SUMMARY };
});
