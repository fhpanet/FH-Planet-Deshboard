(function (global) {
  "use strict";

  /**
   * FH Planet category navigation, project taskbar, and slide-in sidebar.
   *
   * To add a new category/project, append one object to FH_PLANET_NAV below, then
   * create the page, anchor, or window it points at. Example:
   *   { id: "reports", label: "Reports", short: "Reports", labelBn: "রিপোর্ট", href: "/reports/", icon: "📊" }
   * The top bar, taskbar, and sidebar all read this single list.
   */
  var FH_PLANET_NAV = [
    { id: "dashboard", label: "Dashboard", short: "Dashboard", labelBn: "ড্যাশবোর্ড", href: "/", icon: "🪐" },
    { id: "todo", label: "To Do", short: "To Do", labelBn: "টড়ো", href: "/#view-todo", icon: "📋" },
    { id: "finance", label: "Finance Department", short: "Finance", labelBn: "ফাইন্যান্স", href: "/finance/", icon: "💸", window: true },
    { id: "planning", label: "FH Organization Planning", short: "Planning", labelBn: "পরিকল্পনা", href: "/#view-planning", icon: "🗺️" }
  ];

  global.FH_PLANET_NAV = FH_PLANET_NAV;

  function normalizePath(pathname) {
    var p = String(pathname || "/");
    if (/\/index\.html$/i.test(p)) p = p.replace(/\/index\.html$/i, "/");
    if (p === "") p = "/";
    return p;
  }

  function isFinancePath(path) {
    path = path || normalizePath(location.pathname);
    return path === "/finance" || path.indexOf("/finance/") === 0;
  }

  function isFinanceStandalone() {
    return isFinancePath();
  }

  function winState(id) {
    if (global.FHPlanetShell && typeof global.FHPlanetShell.getState === "function") {
      return global.FHPlanetShell.getState(id);
    }
    return { state: "closed", active: false, open: false, minimized: false };
  }

  function itemIsActive(item) {
    var st = winState(item.id);
    if (st.active) return true;
    if (isFinanceStandalone() && item.id === "finance" && !st.open) return true;
    return false;
  }

  function textSpan(className, text) {
    var el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  function fillList(list, mode) {
    if (!list) return;
    list.textContent = "";
    FH_PLANET_NAV.forEach(function (item) {
      var a = document.createElement("a");
      a.className = mode === "taskbar" ? "fh-taskbar-link" : "fh-catnav-link";
      a.href = item.href;
      a.setAttribute("data-nav-id", item.id);
      a.setAttribute("role", "listitem");
      var st = winState(item.id);
      if (st.active || itemIsActive(item)) {
        a.classList.add("is-active");
        a.setAttribute("aria-current", "page");
      }
      if (st.minimized) a.classList.add("is-min");
      if (st.open && !st.minimized) a.classList.add("is-open");
      if (mode === "taskbar") {
        a.appendChild(textSpan("fh-taskbar-icon", item.icon || ""));
        a.appendChild(textSpan("fh-taskbar-label", item.short || item.label || ""));
        var mark = textSpan("fh-taskbar-state", st.minimized ? "min" : st.active ? "on" : st.open ? "open" : "");
        a.appendChild(mark);
      } else {
        a.appendChild(textSpan("fh-catnav-icon", item.icon || ""));
        var text = document.createElement("span");
        text.className = "fh-catnav-text";
        text.appendChild(textSpan("fh-catnav-label", item.short || item.label || ""));
        if (item.labelBn) text.appendChild(textSpan("fh-catnav-bn", item.labelBn));
        a.appendChild(text);
      }
      list.appendChild(a);
    });
  }

  function render() {
    var nav = document.getElementById("fh-catnav");
    if (nav) fillList(nav.querySelector(".fh-catnav-list"), "top");
    var bar = document.getElementById("fh-taskbar");
    if (bar) fillList(bar.querySelector(".fh-taskbar-inner"), "taskbar");
    syncSideProjects();
  }

  function openProject(id, event) {
    if (event) event.preventDefault();
    if (isFinanceStandalone() && id !== "finance") {
      var href = id === "todo" ? "/#view-todo" : id === "planning" ? "/#view-planning" : "/#dashboard";
      location.href = href;
      return;
    }
    if (global.FHPlanetShell && typeof global.FHPlanetShell.open === "function") {
      global.FHPlanetShell.open(id);
      return;
    }
    var item = FH_PLANET_NAV.filter(function (p) { return p.id === id; })[0];
    if (item) location.href = item.href;
  }

  function onNavClick(event) {
    var link = event.target.closest("[data-nav-id]");
    if (link) {
      openProject(link.getAttribute("data-nav-id"), event);
      closeSidebar();
      return;
    }
    var financeHit = event.target.closest('a[href="/finance/"], a[href="/finance"], a.modlink, a.mod-open, a.mod-tile');
    if (financeHit && /\/finance\/?$/.test((financeHit.getAttribute("href") || "").replace(location.origin, ""))) {
      if (!isFinanceStandalone()) {
        event.preventDefault();
        openProject("finance", event);
        closeSidebar();
      }
    }
  }

  /* ---- slide-in sidebar ---- */
  var lastFocus = null;
  var sideOpenedAt = 0;

  function drawerEl() {
    return document.getElementById("fh-side-drawer") || document.querySelector("body.fh-hub #app > .sidebar");
  }

  function isOpen() {
    return document.body.classList.contains("fh-side-open");
  }

  function openSidebar() {
    var drawer = drawerEl();
    var btn = document.getElementById("fh-side-toggle");
    if (!drawer || !btn) return;
    lastFocus = document.activeElement;
    sideOpenedAt = Date.now();
    document.body.classList.add("fh-side-open");
    drawer.removeAttribute("aria-hidden");
    btn.setAttribute("aria-expanded", "true");
    var first = drawer.querySelector("a, button");
    if (first) first.focus();
  }

  function closeSidebar() {
    if (!isOpen()) return;
    var drawer = drawerEl();
    var btn = document.getElementById("fh-side-toggle");
    document.body.classList.remove("fh-side-open");
    if (drawer) drawer.setAttribute("aria-hidden", "true");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    else if (btn) btn.focus();
  }

  function toggleSidebar() {
    if (isOpen()) closeSidebar();
    else openSidebar();
  }

  function syncSideProjects() {
    var drawer = drawerEl();
    if (!drawer) return;
    var nav = drawer.querySelector(".nav") || drawer;
    if (nav.querySelector("[data-nav-id]")) return;
    if (drawer.getAttribute("data-fh-built") === "1") return;
    if (document.querySelector("body.fh-hub #app > .sidebar")) return;
    drawer.setAttribute("data-fh-built", "1");
  }

  function ensureSidebar() {
    var existing = document.querySelector("#app > .sidebar");
    var drawer;
    if (existing) {
      existing.id = existing.id || "fh-side-drawer";
      existing.classList.add("fh-side-drawer");
      if (existing.parentNode !== document.body) document.body.appendChild(existing);
      drawer = existing;
      var nav = drawer.querySelector(".nav") || drawer;
      var attachAt = nav.firstChild;
      FH_PLANET_NAV.forEach(function (item) {
        if (drawer.querySelector('[data-nav-id="' + item.id + '"]') || drawer.querySelector('a[href="/finance/"], a[href="/finance"]') && item.id === "finance") return;
        if (item.id !== "finance" && drawer.querySelector('[data-tab="' + item.id + '"]')) return;
        var a = document.createElement("a");
        a.href = item.href;
        a.setAttribute("data-nav-id", item.id);
        a.innerHTML = '<span class="icon">' + (item.icon || "") + "</span> " + (item.labelBn || item.label);
        nav.insertBefore(a, attachAt);
      });
    } else {
      drawer = document.createElement("aside");
      drawer.id = "fh-side-drawer";
      drawer.className = "fh-side-drawer sidebar";
      var logo = document.createElement("div");
      logo.className = "logo";
      logo.innerHTML = '<span class="lamp">🪐</span> FH Planet';
      var nav = document.createElement("div");
      nav.className = "nav";
      FH_PLANET_NAV.forEach(function (item) {
        var a = document.createElement("a");
        a.href = item.href;
        a.setAttribute("data-nav-id", item.id);
        a.innerHTML = '<span class="icon">' + (item.icon || "") + "</span> " + (item.labelBn || item.label);
        nav.appendChild(a);
      });
      drawer.appendChild(logo);
      drawer.appendChild(nav);
      document.body.appendChild(drawer);
    }
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("role", "navigation");
    drawer.setAttribute("aria-label", "FH Planet menu");

    if (!document.getElementById("fh-side-toggle")) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.id = "fh-side-toggle";
      btn.className = "fh-side-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", drawer.id);
      btn.setAttribute("aria-label", "Open menu");
      btn.textContent = "⋮";
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleSidebar();
      });
      document.body.appendChild(btn);
    }
    if (!document.getElementById("fh-side-scrim")) {
      var scrim = document.createElement("button");
      scrim.type = "button";
      scrim.id = "fh-side-scrim";
      scrim.className = "fh-side-scrim";
      scrim.setAttribute("aria-label", "Close menu");
      scrim.addEventListener("click", closeSidebar);
      document.body.appendChild(scrim);
    }
  }

  function bindSidebarLinks() {
    var drawer = drawerEl();
    if (!drawer || drawer.getAttribute("data-fh-side-bound")) return;
    drawer.setAttribute("data-fh-side-bound", "1");
    drawer.addEventListener("click", function (event) {
      var tabBtn = event.target.closest("[data-tab]");
      if (tabBtn) {
        var tab = tabBtn.getAttribute("data-tab");
        var id = tab === "todo" ? "todo" : tab === "planning" ? "planning" : "dashboard";
        openProject(id, event);
        closeSidebar();
        setTimeout(function () {
          var el = document.getElementById("view-" + tab);
          if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" });
        }, 60);
        return;
      }
      var navId = event.target.closest("[data-nav-id]");
      if (navId) {
        openProject(navId.getAttribute("data-nav-id"), event);
        closeSidebar();
      }
    });
  }

  function bindDismiss() {
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (isOpen()) {
        event.preventDefault();
        closeSidebar();
      }
    });
    document.addEventListener("pointerdown", function (event) {
      if (!isOpen()) return;
      if (Date.now() - sideOpenedAt < 250) return;
      var drawer = drawerEl();
      var btn = document.getElementById("fh-side-toggle");
      if (drawer && drawer.contains(event.target)) return;
      if (btn && btn.contains(event.target)) return;
      closeSidebar();
    }, true);
    function onMainScroll(event) {
      if (!isOpen()) return;
      if (Date.now() - sideOpenedAt < 250) return;
      var drawer = drawerEl();
      var btn = document.getElementById("fh-side-toggle");
      if (drawer && drawer.contains(event.target)) return;
      if (btn && btn.contains(event.target)) return;
      closeSidebar();
    }
    document.addEventListener("wheel", onMainScroll, true);
    document.addEventListener("touchmove", onMainScroll, true);
    document.addEventListener("keydown", function (event) {
      if (!isOpen() || event.key !== "Tab") return;
      var drawer = drawerEl();
      var btn = document.getElementById("fh-side-toggle");
      if (!drawer) return;
      var nodes = [btn].concat(Array.prototype.slice.call(drawer.querySelectorAll("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])")));
      nodes = nodes.filter(Boolean);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function mount() {
    if (document.getElementById("view-todo") || document.getElementById("view-planning") || document.getElementById("app")) {
      if (document.querySelector(".sidebar .logo, .sidebar .nav [data-tab]")) {
        document.body.classList.add("fh-hub");
      }
    }
    if (!document.getElementById("fh-catnav")) {
      var nav = document.createElement("nav");
      nav.id = "fh-catnav";
      nav.className = "fh-catnav";
      nav.setAttribute("aria-label", "FH Planet categories");
      var inner = document.createElement("div");
      inner.className = "fh-catnav-inner";
      var brand = document.createElement("a");
      brand.className = "fh-catnav-brand";
      brand.href = "/";
      brand.appendChild(document.createTextNode("🪐 "));
      var brandText = document.createElement("span");
      brandText.className = "fh-catnav-brand-text";
      brandText.textContent = "FH Planet";
      brand.appendChild(brandText);
      var list = document.createElement("div");
      list.className = "fh-catnav-list";
      list.setAttribute("role", "list");
      inner.appendChild(brand);
      inner.appendChild(list);
      nav.appendChild(inner);
      document.body.insertBefore(nav, document.body.firstChild);
    }
    if (!document.getElementById("fh-taskbar")) {
      var bar = document.createElement("nav");
      bar.id = "fh-taskbar";
      bar.className = "fh-taskbar";
      bar.setAttribute("aria-label", "FH Planet projects");
      var dock = document.createElement("div");
      dock.className = "fh-taskbar-inner";
      dock.setAttribute("role", "list");
      bar.appendChild(dock);
      document.body.appendChild(bar);
    }
    document.documentElement.classList.add("fh-has-catnav", "fh-has-taskbar");
    document.body.classList.add("fh-has-catnav", "fh-has-taskbar");
    ensureSidebar();
    bindSidebarLinks();
    bindDismiss();
    render();
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  onReady(function () {
    mount();
    document.addEventListener("click", onNavClick);
  });
  document.addEventListener("fh-windows-change", render);
  global.FHPlanetNav = { render: render, items: FH_PLANET_NAV, open: openProject, closeSidebar: closeSidebar, openSidebar: openSidebar };
})(window);
