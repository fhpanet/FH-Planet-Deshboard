/* FH Planet Finance — Bangladesh MFS / bank SMS parser.
   OTP, PIN, CVV, and verification codes are rejected and never stored. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FHSms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function num(raw) {
    var n = Number(String(raw || "").replace(/,/g, ""));
    return isFinite(n) ? n : null;
  }

  function firstMatch(text, regex) {
    var m = regex.exec(text);
    if (!m) return null;
    return { value: m[1], index: m.index, end: m.index + m[0].length };
  }

  function overlaps(span, blocked) {
    if (!span) return false;
    for (var i = 0; i < blocked.length; i++) {
      var b = blocked[i];
      if (!b) continue;
      if (span.index < b.end && b.index < span.end) return true;
    }
    return false;
  }

  function parseDate(text) {
    var m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/.exec(text);
    if (!m) return { date: "", time: "" };
    var a = Number(m[1]);
    var b = Number(m[2]);
    var year = m[3];
    var day = a;
    var month = b;
    if (a <= 12 && b > 12) {
      day = b;
      month = a;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return { date: "", time: "" };
    var time = m[4] ? String(m[4]).padStart(2, "0") + ":" + m[5] : "";
    return {
      date: year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
      time: time
    };
  }

  function detectProvider(text) {
    if (/bkash/i.test(text)) return { provider: "bKash", channel: "mfs" };
    if (/nagad/i.test(text)) return { provider: "Nagad", channel: "mfs" };
    if (/rocket/i.test(text)) return { provider: "Rocket", channel: "mfs" };
    if (/upay/i.test(text)) return { provider: "Upay", channel: "mfs" };
    if (/\b(a\/c|account|bank)\b/i.test(text)) return { provider: "Bank", channel: "bank" };
    return { provider: "", channel: "" };
  }

  function detectDirection(text) {
    if (/cash\s*out/i.test(text)) return "debit";
    if (/cash\s*in/i.test(text)) return "credit";
    if (/send\s*money|sent\s*money/i.test(text)) return "debit";
    if (/money\s*received|\breceived\b/i.test(text)) return "credit";
    if (/\bdebited\b/i.test(text)) return "debit";
    if (/\bcredited\b/i.test(text)) return "credit";
    if (/\bpayment\b|\bpaid\s+to\b|\bpurchase\b/i.test(text)) return "debit";
    if (/\bdeposit\b/i.test(text)) return "credit";
    return "";
  }

  function detectCounterparty(text) {
    var phone = /(?:from|to|sender|receiver|recipient)\s*[:.]?\s*(?:agent\s+)?([0-9*+]{8,14})/i.exec(text);
    if (phone) return phone[1];
    var name = /(?:from|to|sender|receiver|recipient)\s*[:.]?\s*([A-Za-z][A-Za-z0-9 .'-]{1,40})/i.exec(text);
    if (!name) return "";
    return name[1].replace(/[.\s]+$/, "").trim();
  }

  function hasSecret(text) {
    if (/\b(otp|one[-\s]?time password|verification code|cvv)\b/i.test(text)) return true;
    if (/\bpin\b\s*(is|code|:)?\s*\d{3,8}/i.test(text)) return true;
    return false;
  }

  function parseSms(raw) {
    var text = String(raw || "").replace(/\u00a0/g, " ").trim();
    if (!text) {
      return { ok: false, blocked: false, error: "Paste an SMS first." };
    }
    if (hasSecret(text)) {
      return {
        ok: false,
        blocked: true,
        error: "OTP, PIN, CVV, and verification messages are never imported."
      };
    }

    var blockedSpans = [];
    var feeHit = firstMatch(text, /fee\s*(?:tk\.?|bdt|৳)?\s*[:.]?\s*(?:tk\.?|bdt|৳)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    var balHit = firstMatch(text, /(?:available\s*)?bal(?:ance)?\.?\s*(?:is|:)?\s*(?:tk\.?|bdt|৳)?\s*[:.]?\s*(?:tk\.?|bdt|৳)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    if (feeHit) blockedSpans.push(feeHit);
    if (balHit) blockedSpans.push(balHit);

    var amountPatterns = [
      /(?:amount|cash\s*out|cash\s*in|send\s*money|received|debited(?:\s*by)?|credited(?:\s*by)?|payment(?:\s*of)?)\s*[:.]?\s*(?:of\s*)?(?:tk\.?|bdt|৳)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
      /(?:tk\.?|bdt|৳)\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:has been\s*)?(?:received|debited|credited)/i
    ];
    var amountHit = null;
    for (var i = 0; i < amountPatterns.length && !amountHit; i++) {
      var re = new RegExp(amountPatterns[i].source, "ig");
      var m;
      while ((m = re.exec(text))) {
        var span = { value: m[1], index: m.index, end: m.index + m[0].length };
        if (!overlaps(span, blockedSpans)) {
          amountHit = span;
          break;
        }
      }
    }
    if (!amountHit) {
      var any = /(?:tk\.?|bdt|৳)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/ig;
      var hit;
      while ((hit = any.exec(text))) {
        var span2 = { value: hit[1], index: hit.index, end: hit.index + hit[0].length };
        if (!overlaps(span2, blockedSpans)) {
          amountHit = span2;
          break;
        }
      }
    }

    var trx = /(?:trx\s*id|txn\s*id|transaction\s*id)\s*[:#]?\s*([A-Z0-9]+)/i.exec(text);
    var ref = /\bref(?:erence)?\s*[:#]?\s*([A-Z0-9-]+)/i.exec(text);
    var mask = /(?:a\/c|account|card)?\s*(\*{2,}\d{2,6})/i.exec(text);
    var when = parseDate(text);
    var who = detectProvider(text);
    var direction = detectDirection(text);
    var amount = amountHit ? num(amountHit.value) : null;

    if (amount == null) {
      return {
        ok: false,
        blocked: false,
        error: "No amount found. Keep this SMS in Pending review — it was not posted.",
        provider: who.provider,
        direction: direction
      };
    }

    return {
      ok: true,
      blocked: false,
      provider: who.provider,
      channel: who.channel,
      direction: direction,
      amount: amount,
      fee: feeHit ? num(feeHit.value) || 0 : 0,
      balance: balHit ? num(balHit.value) : null,
      trxId: trx ? trx[1] : "",
      referenceNo: ref ? ref[1] : "",
      accountMask: mask ? mask[1] : "",
      counterparty: detectCounterparty(text),
      date: when.date,
      time: when.time
    };
  }

  return { parseSms: parseSms };
});
