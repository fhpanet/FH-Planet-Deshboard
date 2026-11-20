(function (global) {
  "use strict";

  var loading = null;
  var mounted = false;
  var drag = null;

  function $(id) { return document.getElementById(id); }

  function isFinancePage() {
    var p = String(location.pathname || "/").replace(/\/index\.html$/i, "/");
    return p === "/finance" || p.indexOf("/finance/") === 0;
  }

  function loadStyle(href) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('link[data-fh-href="' + href + '"]')) {
        resolve();
        return;
      }
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-fh-href", href);
      link.onload = function () { resolve(); };
      link.onerror = function () { reject(new Error("Failed to load " + href)); };
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-fh-src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute("data-fh-src", src);
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureFinanceLibs() {
    if (global.FHFinance && global.FHStore && global.FHFormat) {
      return Promise.resolve();
    }
    if (loading) return loading;
    loading = loadStyle("/finance/css/app.css")
      .then(function () { return loadScript("/finance/js/format.js"); })
      .then(function () { return loadScript("/finance/js/sms.js"); })
      .then(function () { return loadScript("/finance/js/store.js"); })
      .then(function () { return loadScript("/finance/js/app.js"); });
    return loading;
  }

  function ensureWindow() {
    var win = $("fh-win-finance");
    if (win) return win;
    win = document.createElement("div");
    win.id = "fh-win-finance";
    win.className = "fh-win";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", "Finance Department");
    win.hidden = true;
    win.innerHTML =
      '<div class="fh-win-titlebar" data-win-drag="1">' +
        '<div class="fh-win-title">💸 Finance Department</div>' +
        '<div class="fh-win-actions">' +
          '<a href="/finance/" title="Open standalone page" aria-label="Open standalone Finance page">↗</a>' +
          '<button type="button" data-win="max" aria-label="Maximize Finance window" title="Maximize">⛶</button>' +
          '<button type="button" data-win="close" aria-label="Close Finance window" title="Close">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="fh-win-body" id="fh-win-finance-body"></div>';
    document.body.appendChild(win);
    win.querySelector('[data-win="close"]').addEventListener("click", closeFinance);
    win.querySelector('[data-win="max"]').addEventListener("click", function () {
      win.classList.toggle("is-max");
    });
    bindDrag(win);
    return win;
  }

  function bindDrag(win) {
    var bar = win.querySelector("[data-win-drag]");
    if (!bar) return;
    bar.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (event.target.closest(".fh-win-actions")) return;
      if (win.classList.contains("is-max")) return;
      if (window.matchMedia && window.matchMedia("(max-width: 859px)").matches) return;
      var rect = win.getBoundingClientRect();
      drag = { win: win, x: event.clientX - rect.left, y: event.clientY - rect.top };
      win.style.left = rect.left + "px";
      win.style.top = rect.top + "px";
      win.style.right = "auto";
      win.style.bottom = "auto";
      win.style.width = rect.width + "px";
      win.style.height = rect.height + "px";
      try { bar.setPointerCapture(event.pointerId); } catch (err) {}
    });
    bar.addEventListener("pointermove", function (event) {
      if (!drag || drag.win !== win) return;
      var left = event.clientX - drag.x;
      var top = event.clientY - drag.y;
      var maxL = Math.max(8, window.innerWidth - 80);
      var maxT = Math.max(8, window.innerHeight - 80);
      win.style.left = Math.max(8, Math.min(left, maxL)) + "px";
      win.style.top = Math.max(8, Math.min(top, maxT)) + "px";
    });
    function endDrag() { drag = null; }
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);
  }

  function setOpen(open) {
    var win = ensureWindow();
    win.hidden = !open;
    document.body.classList.toggle("fh-win-finance-open", !!open);
    if (global.FHPlanetNav && typeof global.FHPlanetNav.render === "function") {
      global.FHPlanetNav.render();
    }
  }

  function openFinance() {
    if (isFinancePage()) return Promise.resolve();
    var win = ensureWindow();
    var body = $("fh-win-finance-body");
    setOpen(true);
    if (location.hash !== "#finance") {
      if (history && history.replaceState) {
        history.replaceState(null, "", "#finance");
      } else {
        location.hash = "finance";
      }
    }
    if (mounted && global.FHFinance) return Promise.resolve();
    body.innerHTML = '<p class="fh-win-msg">Finance Department লোড হচ্ছে…</p>';
    return ensureFinanceLibs().then(function () {
      body.innerHTML = "";
      body.classList.add("fh-finance");
      global.FHFinance.mount(body);
      mounted = true;
    }).catch(function (err) {
      body.innerHTML = '<p class="fh-win-msg">Finance window could not load. <a href="/finance/">Open the standalone page</a>.</p>';
      throw err;
    });
  }

  function closeFinance() {
    var win = $("fh-win-finance");
    if (win) win.hidden = true;
    document.body.classList.remove("fh-win-finance-open");
    if ((location.hash || "") === "#finance" || (location.hash || "") === "#view-finance") {
      if (history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
      else location.hash = "";
    }
    if (global.FHPlanetNav && typeof global.FHPlanetNav.render === "function") {
      global.FHPlanetNav.render();
    }
  }

  global.FHPlanetShell = {
    openFinance: openFinance,
    closeFinance: closeFinance,
    isFinanceOpen: function () { return document.body.classList.contains("fh-win-finance-open"); }
  };
})(window);
