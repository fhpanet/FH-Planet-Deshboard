/* FH Planet local command bar. Never sends off-device in this build. */
(function (global) {
  "use strict";

  /**
   * Single config spot for a future Hermes connection.
   * Leave endpoint null on the public site. This script never reads a token
   * and never calls Telegram, a server, or any network endpoint — even if
   * endpoint is later filled in, this build still keeps messages local.
   */
  var FH_PLANET_COMMAND = global.FH_PLANET_COMMAND || { endpoint: null };
  global.FH_PLANET_COMMAND = FH_PLANET_COMMAND;

  var LOG_KEY = "fhplanet.command.log";
  var COMMANDS = [
    { cmd: "/status", hint: "স্থানীয় অবস্থা" },
    { cmd: "/todo", hint: "To Do উইন্ডো খুলুন" },
    { cmd: "/finance", hint: "Finance উইন্ডো খুলুন" },
    { cmd: "/planning", hint: "Planning উইন্ডো খুলুন" },
    { cmd: "/dashboard", hint: "Dashboard উইন্ডো খুলুন" },
    { cmd: "/help", hint: "কমান্ড তালিকা" }
  ];
  var suggestIndex = 0;

  function connected() {
    return false;
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (err) { return []; }
  }

  function saveLog(entries) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-80))); } catch (err) {}
  }

  function nowStamp() {
    try {
      return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    } catch (err) {
      return "";
    }
  }

  function addEntry(kind, text) {
    var entries = loadLog();
    entries.push({ kind: kind, text: text, at: nowStamp() });
    saveLog(entries);
    renderLog();
  }

  function statusText() {
    return "Hermes সংযুক্ত নয় — not connected";
  }

  function helpText() {
    return "স্থানীয় কমান্ড: /status, /todo, /finance, /planning, /dashboard, /help। এই সাইট থেকে কোনো বার্তা পাঠানো হয় না।";
  }

  function windowStatus() {
    var shell = global.FHPlanetShell;
    if (!shell || !shell.getState) return "উইন্ডো ম্যানেজার প্রস্তুত নয়।";
    var ids = (global.FH_PLANET_NAV || []).map(function (i) { return i.id; });
    if (!ids.length) ids = ["dashboard", "todo", "finance", "planning"];
    return ids.map(function (id) {
      var s = shell.getState(id);
      var label = s.active ? "সক্রিয়" : s.minimized ? "মিনিমাইজড" : s.state === "normal" || s.state === "maximized" ? "খোলা" : "বন্ধ";
      return id + ": " + label;
    }).join(" · ");
  }

  function openWin(id) {
    if (global.FHPlanetShell && typeof global.FHPlanetShell.open === "function") {
      global.FHPlanetShell.open(id);
      return true;
    }
    return false;
  }

  function runCommand(raw) {
    var text = String(raw || "").trim();
    if (!text) return;
    addEntry("out", text);
    var low = text.toLowerCase();
    var name = low.split(/\s+/)[0];
    if (name === "/help") {
      addEntry("sys", helpText());
      return;
    }
    if (name === "/status") {
      addEntry("sys", statusText() + " · " + windowStatus());
      return;
    }
    if (name === "/todo" || name === "/finance" || name === "/planning" || name === "/dashboard") {
      var id = name.slice(1);
      if (openWin(id)) addEntry("in", id + " উইন্ডো খোলা হয়েছে (স্থানীয়)।");
      else addEntry("sys", "উইন্ডো খোলা যায়নি।");
      return;
    }
    addEntry("sys", statusText() + "। বার্তা শুধু এই ডিভাইসের লগে রাখা হয়েছে; কোথাও পাঠানো হয়নি।");
  }

  function renderLog() {
    var log = document.getElementById("fh-cmd-log");
    if (!log) return;
    var entries = loadLog();
    log.textContent = "";
    entries.slice(-40).forEach(function (e) {
      var div = document.createElement("div");
      div.className = "entry " + (e.kind || "sys");
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = e.at || "";
      var body = document.createElement("div");
      body.textContent = e.text || "";
      div.appendChild(meta);
      div.appendChild(body);
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  }

  function filtered(q) {
    q = (q || "").toLowerCase();
    if (q.charAt(0) !== "/") return [];
    return COMMANDS.filter(function (c) { return c.cmd.indexOf(q) === 0; });
  }

  function renderSuggest(input) {
    var box = document.getElementById("fh-cmd-suggest");
    if (!box) return;
    var items = filtered(input.value);
    box.textContent = "";
    if (!items.length) {
      box.classList.remove("is-open");
      return;
    }
    box.classList.add("is-open");
    if (suggestIndex >= items.length) suggestIndex = 0;
    items.forEach(function (item, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = item.cmd + " — " + item.hint;
      if (i === suggestIndex) b.className = "is-on";
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () {
        input.value = item.cmd + " ";
        input.focus();
        box.classList.remove("is-open");
      });
      box.appendChild(b);
    });
  }

  function mount() {
    if (document.getElementById("fh-cmd")) return;
    var wrap = document.createElement("section");
    wrap.id = "fh-cmd";
    wrap.className = "fh-cmd";
    wrap.setAttribute("aria-label", "FH Planet command bar");
    wrap.innerHTML =
      '<div class="fh-cmd-inner">' +
        '<div class="fh-cmd-status"><span id="fh-cmd-status">' + statusText() + "</span>" +
        '<button type="button" class="fh-cmd-log-btn" id="fh-cmd-toggle" aria-expanded="false" aria-controls="fh-cmd-log">লগ</button></div>' +
        '<ul class="fh-cmd-suggest" id="fh-cmd-suggest" hidden></ul>' +
        '<div class="fh-cmd-log" id="fh-cmd-log" hidden></div>' +
        '<form class="fh-cmd-row" id="fh-cmd-form" action="#" method="get">' +
          '<input id="fh-cmd-input" type="text" autocomplete="off" spellcheck="false" maxlength="400" placeholder="কমান্ড লিখুন…  /help" aria-label="Command">' +
          '<button class="fh-cmd-send" type="submit">Send</button>' +
        "</form></div>";
    document.body.appendChild(wrap);
    document.documentElement.style.setProperty("--fh-cmd-h", "56px");
    document.body.classList.add("fh-has-cmd");
    var input = document.getElementById("fh-cmd-input");
    var form = document.getElementById("fh-cmd-form");
    var suggest = document.getElementById("fh-cmd-suggest");
    var log = document.getElementById("fh-cmd-log");
    var toggle = document.getElementById("fh-cmd-toggle");
    suggest.removeAttribute("hidden");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var items = filtered(input.value);
      if (suggest.classList.contains("is-open") && items[suggestIndex] && input.value.indexOf(" ") === -1) {
        input.value = items[suggestIndex].cmd;
      }
      runCommand(input.value);
      input.value = "";
      suggest.classList.remove("is-open");
    });
    input.addEventListener("input", function () {
      suggestIndex = 0;
      renderSuggest(input);
    });
    input.addEventListener("keydown", function (event) {
      var items = filtered(input.value);
      if (!items.length) return;
      if (event.key === "ArrowDown") { event.preventDefault(); suggestIndex = (suggestIndex + 1) % items.length; renderSuggest(input); }
      if (event.key === "ArrowUp") { event.preventDefault(); suggestIndex = (suggestIndex - 1 + items.length) % items.length; renderSuggest(input); }
      if (event.key === "Tab" && suggest.classList.contains("is-open")) {
        event.preventDefault();
        input.value = items[suggestIndex].cmd + " ";
        suggest.classList.remove("is-open");
      }
      if (event.key === "Escape") suggest.classList.remove("is-open");
    });
    toggle.addEventListener("click", function () {
      var open = !log.classList.contains("is-open");
      log.classList.toggle("is-open", open);
      if (open) log.removeAttribute("hidden");
      else log.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) renderLog();
    });
    renderLog();
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  onReady(mount);

  global.FHPlanetCommand = {
    run: runCommand,
    openLog: function () {
      var log = document.getElementById("fh-cmd-log");
      var toggle = document.getElementById("fh-cmd-toggle");
      if (log) { log.classList.add("is-open"); log.removeAttribute("hidden"); renderLog(); }
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    },
    config: FH_PLANET_COMMAND
  };
})(window);
