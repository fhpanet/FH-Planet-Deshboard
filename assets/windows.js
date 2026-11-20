/* FH Planet window manager: Dashboard, To Do, Finance, Planning. No iframe. */
(function (global) {
  "use strict";

  var STORAGE = "fhplanet.windows.v1";
  var MIN_W = 320;
  var MIN_H = 260;
  var BASE_Z = 3500;
  var MAX_Z = 3890;
  var zTop = BASE_Z;
  var model = {};
  var nodes = {};
  var activeId = null;
  var financeMounted = false;
  var financeLoading = null;
  var drag = null;
  var resize = null;
  var ready = false;

  var TITLES = {
    dashboard: { title: "Dashboard", icon: "🪐" },
    todo: { title: "To Do", icon: "📋" },
    finance: { title: "Finance Department", icon: "💸" },
    planning: { title: "FH Organization Planning", icon: "🗺️" }
  };

  var ADOPT = {
    dashboard: [".topbar", "#modules-bar", "#view-routine", "#view-reminders", "#view-projects", "#view-modes"],
    todo: ["#view-todo"],
    planning: ["#view-planning"],
    finance: []
  };

  function projects() {
    var list = (global.FH_PLANET_NAV || []).map(function (item) { return item.id; });
    if (!list.length) list = ["dashboard", "todo", "finance", "planning"];
    return list;
  }

  function isFinancePage() {
    var p = String(location.pathname || "/").replace(/\/index\.html$/i, "/");
    return p === "/finance" || p.indexOf("/finance/") === 0;
  }

  function isHubPage() {
    var p = String(location.pathname || "/").replace(/\/index\.html$/i, "/");
    return p === "/" || p === "" || /\/dash(?:\.html)?$/.test(p);
  }

  function isPhone() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 767px)").matches);
  }

  function cssPx(name, fallback) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var n = parseFloat(raw);
    return isFinite(n) ? n : fallback;
  }

  function safeBottom() {
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);
    var n = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    return n;
  }

  function workArea() {
    var top = cssPx("--fh-catnav-h", 56) + 8;
    var bottomGap = cssPx("--fh-taskbar-h", 64) + cssPx("--fh-cmd-h", 52) + safeBottom() + 8;
    var left = 8;
    var right = Math.max(left + MIN_W, window.innerWidth - 8);
    var bottom = Math.max(top + MIN_H, window.innerHeight - bottomGap);
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  function defaults(id, index) {
    var area = workArea();
    var ox = 28 * (index || 0);
    var oy = 28 * (index || 0);
    var w = id === "finance" ? Math.min(960, area.width) : Math.min(id === "planning" ? 620 : 640, area.width);
    var h = id === "finance" ? Math.min(560, area.height) : Math.min(520, area.height);
    var x = area.left + 24 + ox;
    var y = area.top + 16 + oy;
    if (x + w > area.right) x = Math.max(area.left, area.right - w);
    if (y + h > area.bottom) y = Math.max(area.top, area.bottom - h);
    return { state: "closed", x: x, y: y, w: w, h: h, z: BASE_Z, nx: x, ny: y, nw: w, nh: h };
  }

  function loadStore() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE) || "null"); } catch (err) { data = null; }
    var ids = projects();
    ids.forEach(function (id, i) {
      var d = defaults(id, i);
      var s = data && data.windows && data.windows[id];
      model[id] = s ? {
        state: s.state === "maximized" || s.state === "minimized" || s.state === "normal" ? s.state : "closed",
        x: num(s.x, d.x), y: num(s.y, d.y), w: num(s.w, d.w), h: num(s.h, d.h),
        z: num(s.z, d.z),
        nx: num(s.nx, s.x != null ? s.x : d.x),
        ny: num(s.ny, s.y != null ? s.y : d.y),
        nw: num(s.nw, s.w != null ? s.w : d.w),
        nh: num(s.nh, s.h != null ? s.h : d.h)
      } : d;
      if (model[id].z > MAX_Z) model[id].z = BASE_Z + i;
      if (model[id].z > zTop) zTop = model[id].z;
    });
    if (zTop > MAX_Z) zTop = MAX_Z;
    if (data && data.active && model[data.active]) activeId = data.active;
    if (data && data.zTop) zTop = Math.max(zTop, data.zTop);
  }

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  function saveStore() {
    var windows = {};
    projects().forEach(function (id) { if (model[id]) windows[id] = model[id]; });
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, active: activeId, zTop: zTop, windows: windows }));
    } catch (err) {}
  }

  function emit() {
    if (global.FHPlanetNav && typeof global.FHPlanetNav.render === "function") global.FHPlanetNav.render();
    document.body.classList.toggle("fh-win-finance-open", !!(model.finance && model.finance.state !== "closed" && model.finance.state !== "minimized"));
    document.dispatchEvent(new CustomEvent("fh-windows-change"));
  }

  function loadStyle(href) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('link[data-fh-href="' + href + '"]')) { resolve(); return; }
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
      if (document.querySelector('script[data-fh-src="' + src + '"]')) { resolve(); return; }
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
    if (global.FHFinance && global.FHStore && global.FHFormat) return Promise.resolve();
    if (financeLoading) return financeLoading;
    financeLoading = loadStyle("/finance/css/app.css")
      .then(function () { return loadScript("/finance/js/format.js"); })
      .then(function () { return loadScript("/finance/js/sms.js"); })
      .then(function () { return loadScript("/finance/js/store.js"); })
      .then(function () { return loadScript("/finance/js/app.js"); });
    return financeLoading;
  }

  function adopt(id) {
    var body = document.getElementById("fh-win-" + id + "-body");
    if (!body) return false;
    var found = false;
    (ADOPT[id] || []).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.parentNode !== body) {
        body.appendChild(el);
        found = true;
      } else if (el) {
        found = true;
      }
    });
    return found;
  }

  function fillPlaceholder(id) {
    var body = document.getElementById("fh-win-" + id + "-body");
    if (!body || body.querySelector(".fh-win-msg, .card, .modules-bar, .fh-finance, .topbar, #view-todo, #view-planning")) return;
    var href = id === "finance" ? "/finance/" : id === "todo" ? "/#view-todo" : id === "planning" ? "/#view-planning" : "/";
    var label = (TITLES[id] || {}).title || id;
    body.innerHTML = '<p class="fh-win-msg">' + label + ' এই পাতায় নেই। <a href="' + href + '">FH Planet হাবে খুলুন</a>.</p>';
  }

  function mountFinance() {
    var body = document.getElementById("fh-win-finance-body");
    if (!body) return Promise.resolve();
    if (financeMounted && global.FHFinance) return Promise.resolve();
    body.innerHTML = '<p class="fh-win-msg">Finance Department লোড হচ্ছে…</p>';
    return ensureFinanceLibs().then(function () {
      body.innerHTML = "";
      body.classList.add("fh-finance");
      global.FHFinance.mount(body);
      financeMounted = true;
    }).catch(function () {
      body.innerHTML = '<p class="fh-win-msg">Finance window could not load. <a href="/finance/">Open the standalone page</a>.</p>';
    });
  }

  function handlesHtml() {
    return '<div class="fh-win-handles" aria-hidden="true">' +
      '<span data-resize="n"></span><span data-resize="s"></span>' +
      '<span data-resize="e"></span><span data-resize="w"></span>' +
      '<span data-resize="ne"></span><span data-resize="nw"></span>' +
      '<span data-resize="se"></span><span data-resize="sw"></span>' +
      "</div>";
  }

  function ensure(id) {
    if (nodes[id]) return nodes[id];
    var meta = TITLES[id] || { title: id, icon: "" };
    var win = document.createElement("div");
    win.id = "fh-win-" + id;
    win.className = "fh-win";
    win.setAttribute("data-win-id", id);
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", meta.title);
    win.hidden = true;
    var extra = id === "finance"
      ? '<a href="/finance/" title="Open standalone page" aria-label="Open standalone Finance page">↗</a>'
      : "";
    win.innerHTML =
      '<div class="fh-win-titlebar" data-win-drag="1">' +
        '<span class="fh-win-icon">' + meta.icon + "</span>" +
        '<div class="fh-win-title">' + meta.title + "</div>" +
        '<div class="fh-win-actions">' + extra +
          '<button type="button" data-win="min" aria-label="Minimize" title="Minimize">–</button>' +
          '<button type="button" data-win="max" aria-label="Maximize" title="Maximize">⛶</button>' +
          '<button type="button" data-win="restore" aria-label="Restore" title="Restore">❐</button>' +
          '<button type="button" data-win="close" aria-label="Close" title="Close">✕</button>' +
        "</div></div>" +
      '<div class="fh-win-body" id="fh-win-' + id + '-body"></div>' +
      handlesHtml();
    document.body.appendChild(win);
    bindWindow(win, id);
    nodes[id] = win;
    if (!model[id]) model[id] = defaults(id, projects().indexOf(id));
    adopt(id);
    if (id !== "finance") fillPlaceholder(id);
    return win;
  }

  function bindWindow(win, id) {
    win.addEventListener("pointerdown", function () { focus(id, false); }, true);
    win.querySelector("[data-win=min]").addEventListener("click", function (e) { e.stopPropagation(); minimize(id); });
    win.querySelector("[data-win=max]").addEventListener("click", function (e) { e.stopPropagation(); maximize(id); });
    win.querySelector("[data-win=restore]").addEventListener("click", function (e) { e.stopPropagation(); restore(id); });
    win.querySelector("[data-win=close]").addEventListener("click", function (e) { e.stopPropagation(); close(id); });
    var bar = win.querySelector("[data-win-drag]");
    bar.addEventListener("pointerdown", function (event) { onDragStart(event, id); });
    bar.addEventListener("pointermove", onDragMove);
    bar.addEventListener("pointerup", onDragEnd);
    bar.addEventListener("pointercancel", onDragEnd);
    bar.addEventListener("dblclick", function (event) {
      if (event.target.closest(".fh-win-actions")) return;
      if (isPhone()) return;
      if (model[id] && model[id].state === "maximized") restore(id);
      else maximize(id);
    });
    Array.prototype.forEach.call(win.querySelectorAll("[data-resize]"), function (h) {
      h.addEventListener("pointerdown", function (event) { onResizeStart(event, id, h.getAttribute("data-resize")); });
      h.addEventListener("pointermove", onResizeMove);
      h.addEventListener("pointerup", onResizeEnd);
      h.addEventListener("pointercancel", onResizeEnd);
    });
  }

  function apply(id) {
    var win = nodes[id] || ensure(id);
    var st = model[id];
    if (!st) return;
    var phone = isPhone();
    var hidden = st.state === "closed" || st.state === "minimized";
    win.hidden = hidden;
    win.classList.toggle("is-min", st.state === "minimized");
    win.classList.toggle("is-max", st.state === "maximized" || (phone && st.state === "normal"));
    win.classList.toggle("is-active", !hidden && activeId === id);
    win.setAttribute("aria-hidden", hidden ? "true" : "false");
    var maxBtn = win.querySelector("[data-win=max]");
    var restBtn = win.querySelector("[data-win=restore]");
    var showRestore = st.state === "maximized" && !phone;
    if (maxBtn) maxBtn.hidden = !!showRestore;
    if (restBtn) restBtn.hidden = !showRestore;
    if (hidden) return;
    var area = workArea();
    if (phone || st.state === "maximized") {
      win.style.left = area.left + "px";
      win.style.top = area.top + "px";
      win.style.width = area.width + "px";
      win.style.height = area.height + "px";
    } else {
      clamp(st, area);
      win.style.left = st.x + "px";
      win.style.top = st.y + "px";
      win.style.width = st.w + "px";
      win.style.height = st.h + "px";
    }
    win.style.right = "auto";
    win.style.bottom = "auto";
    win.style.zIndex = String(st.z || BASE_Z);
  }

  function clamp(st, area) {
    area = area || workArea();
    st.w = Math.max(MIN_W, Math.min(st.w, area.width));
    st.h = Math.max(MIN_H, Math.min(st.h, area.height));
    st.x = Math.min(Math.max(st.x, area.left), area.right - st.w);
    st.y = Math.min(Math.max(st.y, area.top), area.bottom - st.h);
  }

  function snapshotNormal(id) {
    var st = model[id];
    if (!st || st.state === "maximized") return;
    st.nx = st.x; st.ny = st.y; st.nw = st.w; st.nh = st.h;
  }

  function focus(id, applyAll) {
    if (!model[id] || model[id].state === "closed" || model[id].state === "minimized") return;
    zTop += 1;
    if (zTop > MAX_Z) {
      var ordered = projects().filter(function (pid) { return model[pid]; }).sort(function (a, b) {
        return (model[a].z || BASE_Z) - (model[b].z || BASE_Z);
      });
      ordered.forEach(function (pid, i) { model[pid].z = BASE_Z + i; });
      zTop = BASE_Z + Math.max(1, ordered.length);
    }
    model[id].z = zTop;
    activeId = id;
    if (nodes[id]) nodes[id].style.zIndex = String(zTop);
    document.body.setAttribute("data-fh-active-win", id);
    apply(id);
    if (applyAll) projects().forEach(apply);
    emit();
    saveStore();
  }

  function minimizeOthers(exceptId) {
    projects().forEach(function (id) {
      if (id === exceptId) return;
      if (model[id] && (model[id].state === "normal" || model[id].state === "maximized")) {
        model[id].state = "minimized";
        apply(id);
      }
    });
  }

  function open(id) {
    if (!TITLES[id] && projects().indexOf(id) === -1) return Promise.resolve();
    if (isFinancePage()) {
      if (id === "finance") return Promise.resolve();
      var href = id === "todo" ? "/#view-todo" : id === "planning" ? "/#view-planning" : "/#dashboard";
      location.href = href;
      return Promise.resolve();
    }
    ensure(id);
    if (!model[id]) model[id] = defaults(id, projects().indexOf(id));
    var st = model[id];
    var phone = isPhone();
    if (phone) minimizeOthers(id);
    if (st.state === "closed" || st.state === "minimized") {
      st.state = phone ? "maximized" : (st.nw ? "normal" : "normal");
      if (!phone) {
        st.x = st.nx != null ? st.nx : st.x;
        st.y = st.ny != null ? st.ny : st.y;
        st.w = st.nw != null ? st.nw : st.w;
        st.h = st.nh != null ? st.nh : st.h;
      }
    }
    if (phone) st.state = "maximized";
    adopt(id);
    var done = (id === "finance" && !isFinancePage()) ? mountFinance() : Promise.resolve();
    return done.then(function () {
      if (id !== "finance") fillPlaceholder(id);
      focus(id, true);
    });
  }

  function minimize(id) {
    if (!model[id] || model[id].state === "closed") {
      ensure(id);
      if (!model[id]) return;
    }
    if (model[id].state === "normal") snapshotNormal(id);
    model[id].state = "minimized";
    apply(id);
    if (activeId === id) {
      activeId = null;
      var top = null, z = -1;
      projects().forEach(function (other) {
        var s = model[other];
        if (s && (s.state === "normal" || s.state === "maximized") && s.z > z) {
          z = s.z; top = other;
        }
      });
      if (top) focus(top, false);
      else {
        document.body.removeAttribute("data-fh-active-win");
        emit();
        saveStore();
      }
    } else {
      emit();
      saveStore();
    }
  }

  function maximize(id) {
    ensure(id);
    if (!model[id]) return;
    if (model[id].state === "minimized" || model[id].state === "closed" || model[id].state === "normal") {
      if (model[id].state === "normal") snapshotNormal(id);
    }
    if (isPhone()) minimizeOthers(id);
    model[id].state = "maximized";
    focus(id, true);
  }

  function restore(id) {
    ensure(id);
    if (!model[id]) return;
    if (isPhone()) {
      open(id);
      return;
    }
    var st = model[id];
    st.state = "normal";
    st.x = st.nx != null ? st.nx : st.x;
    st.y = st.ny != null ? st.ny : st.y;
    st.w = st.nw != null ? st.nw : st.w;
    st.h = st.nh != null ? st.nh : st.h;
    clamp(st);
    focus(id, true);
  }

  function close(id) {
    minimize(id);
  }

  function onDragStart(event, id) {
    if (event.button !== 0) return;
    if (event.target.closest(".fh-win-actions")) return;
    if (isPhone()) return;
    var st = model[id];
    if (!st || st.state === "maximized") return;
    focus(id, false);
    var win = nodes[id];
    var rect = win.getBoundingClientRect();
    drag = { id: id, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (err) {}
    event.preventDefault();
  }

  function onDragMove(event) {
    if (!drag) return;
    var st = model[drag.id];
    if (!st) return;
    var area = workArea();
    st.x = event.clientX - drag.dx;
    st.y = event.clientY - drag.dy;
    clamp(st, area);
    var win = nodes[drag.id];
    win.style.left = st.x + "px";
    win.style.top = st.y + "px";
  }

  function onDragEnd() {
    if (!drag) return;
    snapshotNormal(drag.id);
    drag = null;
    saveStore();
  }

  function onResizeStart(event, id, edge) {
    if (event.button !== 0) return;
    if (isPhone()) return;
    var st = model[id];
    if (!st || st.state === "maximized") return;
    focus(id, false);
    resize = { id: id, edge: edge, x: event.clientX, y: event.clientY, ox: st.x, oy: st.y, ow: st.w, oh: st.h };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (err) {}
    event.preventDefault();
    event.stopPropagation();
  }

  function onResizeMove(event) {
    if (!resize) return;
    var st = model[resize.id];
    var edge = resize.edge;
    var dx = event.clientX - resize.x;
    var dy = event.clientY - resize.y;
    var area = workArea();
    var x = resize.ox, y = resize.oy, w = resize.ow, h = resize.oh;
    if (edge.indexOf("e") !== -1) w = resize.ow + dx;
    if (edge.indexOf("s") !== -1) h = resize.oh + dy;
    if (edge.indexOf("w") !== -1) { w = resize.ow - dx; x = resize.ox + dx; }
    if (edge.indexOf("n") !== -1) { h = resize.oh - dy; y = resize.oy + dy; }
    if (w < MIN_W) { if (edge.indexOf("w") !== -1) x = resize.ox + (resize.ow - MIN_W); w = MIN_W; }
    if (h < MIN_H) { if (edge.indexOf("n") !== -1) y = resize.oy + (resize.oh - MIN_H); h = MIN_H; }
    st.x = x; st.y = y; st.w = w; st.h = h;
    clamp(st, area);
    apply(resize.id);
  }

  function onResizeEnd() {
    if (!resize) return;
    snapshotNormal(resize.id);
    resize = null;
    saveStore();
  }

  function getState(id) {
    var st = model[id];
    return {
      state: st ? st.state : "closed",
      active: activeId === id && st && st.state !== "minimized" && st.state !== "closed",
      open: !!(st && st.state !== "closed"),
      minimized: !!(st && st.state === "minimized"),
      maximized: !!(st && st.state === "maximized")
    };
  }

  function hashTarget() {
    var h = String(location.hash || "").replace(/^#\/?/, "");
    if (h === "view-todo" || h === "todo") return "todo";
    if (h === "view-planning" || h === "planning") return "planning";
    if (h === "finance" || h === "view-finance") return "finance";
    if (h === "dashboard" || h === "view-dashboard") return "dashboard";
    return null;
  }

  function applyAll() {
    projects().forEach(function (id) { if (nodes[id] || (model[id] && model[id].state !== "closed")) ensure(id); apply(id); });
  }

  function init() {
    if (ready) return;
    ready = true;
    loadStore();
    if (isFinancePage()) {
      emit();
      return;
    }
    projects().forEach(function (id) { ensure(id); });
    var hasSavedOpen = projects().some(function (id) { return model[id] && model[id].state !== "closed"; });
    var target = hashTarget();
    if (!hasSavedOpen) {
      model.dashboard.state = isPhone() ? "maximized" : "normal";
      if (target && target !== "dashboard") {
        if (isPhone()) model.dashboard.state = "minimized";
        if (model[target]) model[target].state = isPhone() ? "maximized" : "normal";
        activeId = target;
      } else {
        activeId = "dashboard";
      }
    } else if (target) {
      open(target);
    }
    if (isPhone()) {
      var visible = projects().filter(function (id) {
        return model[id] && (model[id].state === "normal" || model[id].state === "maximized");
      });
      if (visible.length > 1) {
        var keep = activeId && visible.indexOf(activeId) !== -1 ? activeId : visible[visible.length - 1];
        visible.forEach(function (id) {
          if (id !== keep) model[id].state = "minimized";
        });
        model[keep].state = "maximized";
        activeId = keep;
      } else if (visible.length === 1) {
        model[visible[0]].state = "maximized";
        activeId = visible[0];
      }
    }
    applyAll();
    if (model.finance && (model.finance.state === "normal" || model.finance.state === "maximized") && !isFinancePage()) {
      mountFinance();
    }
    emit();
    saveStore();
  }

  window.addEventListener("resize", function () {
    if (!ready) return;
    if (isPhone()) {
      var visible = projects().filter(function (id) {
        return model[id] && (model[id].state === "normal" || model[id].state === "maximized");
      });
      if (visible.length > 1) {
        var keep = activeId && visible.indexOf(activeId) !== -1 ? activeId : visible[0];
        minimizeOthers(keep);
        model[keep].state = "maximized";
      }
    }
    applyAll();
    saveStore();
  });

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  onReady(init);

  global.FHPlanetShell = {
    open: open,
    focus: function (id) { open(id); },
    minimize: minimize,
    maximize: maximize,
    restore: restore,
    close: close,
    getState: getState,
    isPhone: isPhone,
    openFinance: function () { return open("finance"); },
    closeFinance: function () { minimize("finance"); },
    isFinanceOpen: function () {
      var s = getState("finance");
      return s.state === "normal" || s.state === "maximized";
    }
  };
})(window);
