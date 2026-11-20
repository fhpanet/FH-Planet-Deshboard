(function (global) {
  "use strict";

  /**
   * FH Planet category navigation and project taskbar (shared by every page).
   *
   * To add a new category/project, append one object to FH_PLANET_NAV below, then
   * create the page, anchor, or window it points at. Example:
   *   { id: "reports", label: "Reports", short: "Reports", labelBn: "রিপোর্ট", href: "/reports/", icon: "📊" }
   * Both the top bar and the bottom taskbar read this single list.
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

  function isHubPath(path) {
    return path === "/" || path === "";
  }

  function isFinancePath(path) {
    return path === "/finance" || path.indexOf("/finance/") === 0;
  }

  function hashId() {
    return String(global.location.hash || "").replace(/^#/, "");
  }

  function isTodoHash(h) {
    return h === "view-todo" || h === "todo";
  }

  function isPlanningHash(h) {
    return h === "view-planning" || h === "planning";
  }

  function isFinanceHash(h) {
    return h === "finance" || h === "view-finance";
  }

  function financeWindowOpen() {
    return !!(document.body && document.body.classList.contains("fh-win-finance-open"));
  }

  function itemIsActive(item) {
    var path = normalizePath(global.location.pathname);
    var hash = hashId();
    var href = item.href || "";
    if (item.id === "finance" || item.window) {
      return isFinancePath(path) || isFinanceHash(hash) || financeWindowOpen();
    }
    if (item.id === "todo" || /#view-todo\b|#todo\b/.test(href)) {
      return isHubPath(path) && isTodoHash(hash) && !financeWindowOpen();
    }
    if (item.id === "planning" || /#view-planning\b|#planning\b/.test(href)) {
      return isHubPath(path) && isPlanningHash(hash) && !financeWindowOpen();
    }
    if (item.id === "dashboard" || href === "/") {
      return isHubPath(path) && !isTodoHash(hash) && !isPlanningHash(hash) && !isFinanceHash(hash) && !financeWindowOpen();
    }
    var parts = href.split("#");
    var hrefPath = normalizePath(parts[0] || "/");
    var hrefHash = parts[1] || "";
    if (hrefHash) return path === hrefPath && hash === hrefHash;
    if (hrefPath === "/") return isHubPath(path);
    return path === hrefPath || path.indexOf(hrefPath.replace(/\/?$/, "/")) === 0;
  }

  function scrollToHash() {
    var h = hashId();
    if (isFinanceHash(h)) return;
    var main = document.getElementById("main") || document.querySelector("main.main");
    if (!h) {
      if (main) main.scrollTop = 0;
      return;
    }
    var el = document.getElementById(h) || document.getElementById("view-" + h);
    if (!el) return;
    if (main && main !== document.body && main.scrollHeight > main.clientHeight) {
      var top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 10;
      if (typeof main.scrollTo === "function") {
        main.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        main.scrollTop = Math.max(0, top);
      }
    } else if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function markSidebar() {
    var h = hashId().replace(/^view-/, "");
    var buttons = document.querySelectorAll(".sidebar .nav [data-tab]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === h);
    });
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
      if (item.window) a.setAttribute("data-nav-window", "finance");
      if (itemIsActive(item)) {
        a.classList.add("is-active");
        a.setAttribute("aria-current", "page");
      }
      if (mode === "taskbar") {
        a.appendChild(textSpan("fh-taskbar-icon", item.icon || ""));
        a.appendChild(textSpan("fh-taskbar-label", item.short || item.label || ""));
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
  }

  function isFinanceStandalone() {
    return isFinancePath(normalizePath(global.location.pathname));
  }

  function openFinanceFromHub(event) {
    if (event) event.preventDefault();
    if (isFinanceStandalone()) {
      if (global.FHFinance && global.FHFinance.mount) {
        /* already mounted in place */
        return;
      }
      return;
    }
    if (global.FHPlanetShell && typeof global.FHPlanetShell.openFinance === "function") {
      global.FHPlanetShell.openFinance();
    } else {
      global.location.href = "/finance/";
    }
  }

  function onNavClick(event) {
    var link = event.target.closest("[data-nav-id]");
    if (!link) {
      var financeHit = event.target.closest('a[href="/finance/"], a[href="/finance"], a.modlink, a.mod-open, a.mod-tile');
      if (financeHit && /\/finance\/?$/.test((financeHit.getAttribute("href") || "").replace(global.location.origin, ""))) {
        if (!isFinanceStandalone()) {
          event.preventDefault();
          openFinanceFromHub(event);
        }
      }
      return;
    }
    var id = link.getAttribute("data-nav-id");
    if (id === "finance" || link.getAttribute("data-nav-window") === "finance") {
      if (!isFinanceStandalone()) {
        event.preventDefault();
        openFinanceFromHub(event);
      }
    }
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
    render();
    markSidebar();
    if (isFinanceHash(hashId()) && !isFinanceStandalone()) {
      openFinanceFromHub();
    } else {
      scrollToHash();
    }
  }

  function bindSidebar() {
    var buttons = document.querySelectorAll(".sidebar .nav [data-tab]");
    Array.prototype.forEach.call(buttons, function (btn) {
      if (btn.getAttribute("data-fh-cat-bound")) return;
      btn.setAttribute("data-fh-cat-bound", "1");
      btn.addEventListener("click", function () {
        var id = "view-" + btn.getAttribute("data-tab");
        if (!document.getElementById(id)) return;
        if (global.FHPlanetShell && global.FHPlanetShell.closeFinance) global.FHPlanetShell.closeFinance();
        if (global.location.hash !== "#" + id) {
          global.location.hash = id;
        } else {
          render();
          markSidebar();
          scrollToHash();
        }
      });
    });
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  onReady(function () {
    mount();
    bindSidebar();
    document.addEventListener("click", onNavClick);
  });
  global.addEventListener("hashchange", function () {
    render();
    markSidebar();
    if (isFinanceHash(hashId()) && !isFinanceStandalone()) openFinanceFromHub();
    else scrollToHash();
  });
  global.addEventListener("popstate", function () {
    render();
    markSidebar();
    scrollToHash();
  });
  global.FHPlanetNav = { render: render, items: FH_PLANET_NAV };
})(window);
