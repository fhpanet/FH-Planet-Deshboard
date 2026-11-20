/* Node checks for the FH Planet Finance ledger and SMS parser. */
var assert = require("assert");
var FHSms = require("../finance/js/sms");
var FHFormat = require("../finance/js/format");
var api = require("../finance/js/store");

function memoryStorage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; }
  };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.02, (label || "value") + " " + actual + " !== " + expected);
}

var blocked = FHSms.parseSms("Your bKash OTP is 482193. Do not share this verification code.");
assert.strictEqual(blocked.blocked, true);

var pin = FHSms.parseSms("Your PIN is 1234 for the card portal.");
assert.strictEqual(pin.blocked, true);

var receive = FHSms.parseSms("bKash: You have received Tk 1,500.00 from 01711000000. Fee Tk 5.00. Balance Tk 12,340.50. TrxID 8AB2CDEFGH at 20/11/2026 09:02");
assert.strictEqual(receive.ok, true);
assert.strictEqual(receive.direction, "credit");
assert.strictEqual(receive.provider, "bKash");
near(receive.amount, 1500, "receive amount");
near(receive.fee, 5, "receive fee");
near(receive.balance, 12340.5, "receive balance");
assert.strictEqual(receive.trxId, "8AB2CDEFGH");
assert.strictEqual(receive.counterparty, "01711000000");
assert.strictEqual(receive.date, "2026-11-20");
assert.strictEqual(receive.time, "09:02");

var cashOut = FHSms.parseSms("Cash Out Tk 2,000.00 from Agent 01811000000 is successful. Fee Tk 18.50. Balance Tk 5,000.00. TrxID CO12345678. bKash");
assert.strictEqual(cashOut.direction, "debit");
near(cashOut.amount, 2000, "cashout");
near(cashOut.fee, 18.5, "cashout fee");
assert.strictEqual(cashOut.provider, "bKash");

var nagad = FHSms.parseSms("Nagad\nMoney Received.\nAmount: Tk 2,500.00\nSender: 01611000000\nTxnID: 73ABCDEF\nFee: Tk 0.00\nBalance: Tk 8,000.00");
assert.strictEqual(nagad.direction, "credit");
assert.strictEqual(nagad.provider, "Nagad");
near(nagad.amount, 2500, "nagad");
assert.strictEqual(nagad.trxId, "73ABCDEF");

var bank = FHSms.parseSms("BDT 55,000.00 credited to A/C ****1234. Ref: INV-2211. Available Balance: BDT 642,300.00");
assert.strictEqual(bank.direction, "credit");
assert.strictEqual(bank.provider, "Bank");
near(bank.amount, 55000, "bank amount");
near(bank.balance, 642300, "bank balance");
assert.strictEqual(bank.referenceNo, "INV-2211");
assert.strictEqual(bank.accountMask, "****1234");

var upay = FHSms.parseSms("You have received BDT 750.00 from 01511000000. TrxID UPAY998877. Fee BDT 0.00. Balance BDT 2,200.00 Upay");
assert.strictEqual(upay.provider, "Upay");
near(upay.amount, 750, "upay");

assert.strictEqual(FHFormat.money(1842650), "৳18,42,650");
assert.strictEqual(FHFormat.money(1120400), "৳11,20,400");
assert.strictEqual(FHFormat.money(386250), "৳3,86,250");

var store = api.createFinanceStore(memoryStorage());
var bal = store.balances();
near(bal.liquid, 1842650, "liquid");
near(bal.bank, 1120400, "bank");
near(bal.mfs, 386250, "mfs");
near(bal.card, 175000, "card");
near(bal.cash, 161000, "cash");

var kpi = store.todayKpis("2026-11-20");
near(kpi["in"], 84500, "today in");
near(kpi.out, 37280, "today out");
assert.ok(kpi.entries >= 8);
assert.ok(kpi.posted >= 6);

var fresh = api.createFinanceStore(memoryStorage());
var holder = memoryStorage();
var live = api.createFinanceStore(holder);
var summaryObj = JSON.parse(holder.getItem(api.SUMMARY));
near(summaryObj.totalLiquidBDT, 1842650, "summary liquid");
near(summaryObj.todayInBDT, live.todayKpis("2026-11-20", { all: true })["in"], "summary uses ledger today when the clock matches");
assert.strictEqual(summaryObj.bankBDT, live.balances().bank);

var beforeAudit = live.getState().audit.length;
var posted = live.addTransaction({
  direction: "debit",
  amount: 100,
  fee: 5,
  accountId: "acc-rocket",
  party: "Demo",
  description: "Fee check",
  category: "Expense",
  status: "posted"
});
assert.strictEqual(posted.ok, true);
near(live.balances().byAccount["acc-rocket"], 22000 - 105, "fee once");
near(live.feeReport(), live.getState().transactions.filter(function (tx) { return tx.id === "TX-1026"; })[0].fee + 5, "fee report");

var draft = live.addTransaction({
  direction: "debit",
  amount: 50,
  accountId: "acc-rocket",
  description: "Draft only",
  status: "draft"
});
assert.strictEqual(draft.ok, true);
near(live.balances().byAccount["acc-rocket"], 22000 - 105, "draft ignored");
var archived = live.archive(posted.id);
assert.ok(!archived.ok);
assert.strictEqual(live.txById(posted.id).status, "posted");
assert.ok(live.archive(draft.id).ok);
assert.strictEqual(live.txById(draft.id).status, "archived");

var cashBefore = live.balances().byAccount["acc-cash"];
var spend = live.addTransaction({
  direction: "debit",
  amount: 80,
  fee: 0,
  accountId: "acc-cash",
  description: "Reverse me",
  status: "posted"
});
near(live.balances().byAccount["acc-cash"], cashBefore - 80, "spend");
var rev = live.reverse(spend.id, "Wrong stall");
assert.strictEqual(rev.ok, true);
near(live.balances().byAccount["acc-cash"], cashBefore, "reversal nets");
assert.ok(live.txById(spend.id).reversedBy);
assert.strictEqual(live.txById(spend.id).status, "posted");

var adj = live.adjust(posted.id, 80, "Corrected principal");
assert.strictEqual(adj.ok, true);
near(live.balances().byAccount["acc-rocket"], 22000 - 85, "adjusted 100 to 80 plus fee 5");

var bazaar = live.addTransaction({
  direction: "debit",
  amount: 10,
  accountId: "acc-cash",
  description: "Rice bazaar run",
  party: "Market",
  status: "draft"
});
assert.ok(live.txById(bazaar.id).tags.indexOf("bazaar_market") !== -1);

var print = live.addTransaction({
  direction: "debit",
  amount: 10,
  accountId: "acc-cash",
  description: "Extra bill",
  party: "Print Hub Express",
  status: "draft"
});
assert.strictEqual(live.txById(print.id).groupId, "GRP-1138");
assert.ok(live.txById(print.id).notes.some(function (note) { return /Print Hub pass/.test(note.text); }));

var dup = live.addTransaction({
  direction: "credit",
  amount: 10,
  accountId: "acc-bkash",
  description: "Duplicate sms",
  trxId: "8BKASHDEMO1",
  status: "pending",
  source: "sms"
});
assert.strictEqual(dup.ok, false);
assert.strictEqual(dup.duplicate, true);

var group = live.groupTotals("GRP-1142");
near(group.credit, 27000, "group credit");

var note = live.addNote("transaction", "TX-1001", "Batch checked at the desk.", "internal");
assert.strictEqual(note.ok, true);
var gnote = live.addNote("group", "GRP-1142", "Pass number confirmed.", "internal");
assert.strictEqual(gnote.ok, true);
assert.ok(live.getState().audit.length > beforeAudit);

var loan = live.addLoan({ party: "Test Person", direction: "received", principal: 1000, charge: 500, disburse: false });
assert.strictEqual(loan.ok, true);
var math = live.loanMath(live.getState().loans.filter(function (row) { return row.id === loan.id; })[0]);
near(math.remaining, 1500, "charge once");
near(math.charge, 500, "charge field");
var repay = live.addRepayment(loan.id, { amount: 200, accountId: "acc-cash" });
assert.strictEqual(repay.ok, true);
near(repay.remaining, 1300, "after repayment");

var charity = live.getState().charities[0];
var charityTx = live.txById(charity.txId);
near(charity.principal, 5000, "charity principal");
near(charityTx.amount, 5000, "charity tx principal");
near(charityTx.fee, 25, "charity fee separate");

live.setRole("auditor");
assert.ok(!live.addTransaction({ direction: "debit", amount: 10, accountId: "acc-cash", description: "nope", status: "posted" }).ok);
assert.ok(live.addNote("transaction", "TX-1001", "Auditor review note.", "internal").ok);
live.setRole("editor");
assert.ok(live.addTransaction({ direction: "debit", amount: 12, accountId: "acc-cash", description: "editor entry", status: "posted" }).ok);
assert.ok(!live.setModule("loans", false).ok);
live.setRole("customer");
live.setCustomer("CUS-1042");
var visible = live.filteredTransactions({});
assert.ok(visible.every(function (tx) { return tx.customerId === "CUS-1042"; }));
assert.ok(visible.some(function (tx) { return tx.id === "TX-1024"; }));
assert.ok(!visible.some(function (tx) { return tx.id === "TX-1001"; }));
var notes = live.visibleNotes(live.txById("TX-1024").notes);
assert.strictEqual(notes.length, 1);
assert.strictEqual(notes[0].visibility, "customer");
live.setRole("supreme");

var odd = live.addTransaction({
  direction: "debit",
  amount: 3,
  accountId: "acc-cash",
  description: "=1+1",
  party: "Formula",
  status: "draft"
});
assert.strictEqual(odd.ok, true);
var csv = live.exportCSV("transactions");
assert.ok(csv.csv.indexOf("'=1+1") !== -1, "csv formula injection guarded");
assert.ok(csv.csv.split("\n")[0].indexOf("tx_id") === 0);

var backup = JSON.parse(live.exportJSON().json);
var bad = live.importJSON({ schema: 2 });
assert.strictEqual(bad.ok, false);
assert.ok(live.txById("TX-1001"));
assert.ok(live.importJSON(backup).ok);

var usdBefore = live.balances().liquid;
var usd = live.addTransaction({
  direction: "debit",
  amount: 10,
  currency: "USD",
  accountId: "acc-card",
  description: "Domain renewal",
  status: "posted"
});
assert.strictEqual(usd.ok, true);
near(live.balances().liquid, usdBefore - 1220, "usd at 122");
live.setUsdRate(100);
near(live.balances().byAccount["acc-card"] - (175000), -1000, "rate change is display only");

var auditLen = live.getState().audit.length;
assert.ok(auditLen > 5);
assert.ok(!live.getState().audit.some(function (row) { return row == null; }));

assert.ok(fresh.balances().liquid > 0);
console.log("selfcheck ok");
