/* FH Planet Finance — display helpers. No secrets, no network. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FHFormat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function dhakaParts(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    var parts = {};
    fmt.formatToParts(date || new Date()).forEach(function (p) {
      parts[p.type] = p.value;
    });
    return parts;
  }

  function todayISO(date) {
    var p = dhakaParts(date);
    return p.year + "-" + p.month + "-" + p.day;
  }

  function dhakaTime(date) {
    var p = dhakaParts(date);
    return p.hour + ":" + p.minute;
  }

  function addDays(iso, n) {
    var bits = String(iso).slice(0, 10).split("-").map(Number);
    var dt = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2]));
    dt.setUTCDate(dt.getUTCDate() + n);
    var mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(dt.getUTCDate()).padStart(2, "0");
    return dt.getUTCFullYear() + "-" + mm + "-" + dd;
  }

  function daysUntil(iso, fromISO) {
    var from = fromISO || todayISO();
    var a = Date.parse(from.slice(0, 10) + "T00:00:00Z");
    var b = Date.parse(String(iso).slice(0, 10) + "T00:00:00Z");
    return Math.round((b - a) / 86400000);
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var bits = String(iso).slice(0, 10).split("-").map(Number);
    if (!bits[0] || !bits[1] || !bits[2]) return "—";
    return bits[2] + " " + MONTHS[bits[1] - 1] + " " + bits[0];
  }

  function formatShort(iso) {
    if (!iso) return "—";
    var bits = String(iso).slice(0, 10).split("-").map(Number);
    if (!bits[1] || !bits[2]) return "—";
    return bits[2] + " " + MONTHS[bits[1] - 1];
  }

  function groupInt(intStr) {
    var neg = intStr.charAt(0) === "-";
    var s = neg ? intStr.slice(1) : intStr;
    if (s.length <= 3) return (neg ? "-" : "") + s;
    var last = s.slice(-3);
    var rest = s.slice(0, -3);
    var chunks = [];
    while (rest.length > 2) {
      chunks.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) chunks.unshift(rest);
    return (neg ? "-" : "") + chunks.join(",") + "," + last;
  }

  function formatPlain(amount, digits) {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    var fixed = Math.abs(n).toFixed(digits == null ? 2 : digits);
    var bits = fixed.split(".");
    var body = bits[1] === "00" ? groupInt(bits[0]) : groupInt(bits[0]) + "." + bits[1];
    return (neg ? "-" : "") + body;
  }

  function money(amount, currency) {
    var body = formatPlain(Math.abs(Number(amount) || 0));
    var sign = Number(amount) < 0 ? "-" : "";
    if (currency === "USD") return sign + "$" + body;
    return sign + "৳" + body;
  }

  function compactBDT(amount) {
    var n = Number(amount) || 0;
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (abs >= 10000000) return sign + "৳" + (abs / 10000000).toFixed(2) + " Cr";
    if (abs >= 100000) return sign + "৳" + (abs / 100000).toFixed(1) + "L";
    return money(n, "BDT");
  }

  function parseAmount(value) {
    if (typeof value === "number") return isFinite(value) ? value : 0;
    var s = String(value == null ? "" : value).replace(/[৳$,\s]/g, "").trim();
    if (!s) return 0;
    var n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function monthBounds(iso) {
    var bits = String(iso || todayISO()).slice(0, 10).split("-");
    var y = Number(bits[0]);
    var m = Number(bits[1]);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var mm = String(m).padStart(2, "0");
    return { start: y + "-" + mm + "-01", end: y + "-" + mm + "-" + String(last).padStart(2, "0") };
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function toBDT(amount, currency, usdRate) {
    var n = Number(amount) || 0;
    if (currency === "USD") return round2(n * (Number(usdRate) || 0));
    return round2(n);
  }

  return {
    todayISO: todayISO,
    dhakaTime: dhakaTime,
    addDays: addDays,
    daysUntil: daysUntil,
    formatDate: formatDate,
    formatShort: formatShort,
    money: money,
    compactBDT: compactBDT,
    parseAmount: parseAmount,
    escapeHtml: escapeHtml,
    monthBounds: monthBounds,
    round2: round2,
    toBDT: toBDT,
    formatPlain: formatPlain
  };
});
