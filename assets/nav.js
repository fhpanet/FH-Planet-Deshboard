(function (global) {
  "use strict";

  /**
   * FH Planet category navigation (shared by every page).
   *
   * To add a new category, append one object to FH_PLANET_NAV below, then
   * create the page or anchor it points at. Example:
   *   { id: "reports", label: "Reports", labelBn: "রিপোর্ট", href: "/reports/", icon: "📊" }
   * No other files need restructuring. The bar is injected at runtime from
   * this list; active state is derived from the current path and hash.
   */
  var FH_PLANET_NAV = [
    { id: "dashboard", label: "Dashboard", labelBn: "ড্যাশবোর্ড", href: "/", icon: "🪐" },
    { id: "todo", label: "To Do", labelBn: "টড়ো", href: "/#view-todo", icon: "📋" },
    { id: "finance", label: "Finance Department", labelBn: "ফাইন্যান্স", href: "/finance/", icon: "💸" }
  ];

  global.FH_PLANET_NAV = FH_PLANET_NAV;

  function normalizePath(pathname) {
    var p = String(pathname || "/");
    if (/\/index\.html$/i.test(p)) p = p.replace(/\/index\.html$/i, "/");
    if (p === "/index.html") p = "/";
    if (p === "") p = "/";
    return p;
  }

  function isHubPath(path) {
    return path === "/" || path === "";
  }

  function hashId() {
    return String(global.location.hash || "").replace(/^#/, "");
  }

  function isTodoHash(h) {
    return h === "view-todo" || h === "todo";
  }

  function itemIsActive(item) {
    var path = normalizePath(global.location.pathname);
    var hash = hashId();
    var href = item.href || "";
    if (item.id === "todo" || /#view-todo\b|#todo\b/.test(href)) {
      return isHubPath(path) && isTodoHash(hash);
    }
    if (item.id === "finance" || href.indexOf("/finance") === 0) {
      return path === "/finance" || path.indexOf("/finance/") === 0;
    }
    if (item.id === "dashboard" || href === "/") {
      return isHubPath(path) && !isTodoHash(hash);
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
    var tab = hashId().replace(/^view-/, "");
    var buttons = document.querySelectorAll(".sidebar .nav [data-tab]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
  }

  function textSpan(className, text) {
    var el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  function render() {
    var nav = document.getElementById("fh-catnav");
    if (!nav) return;
    var list = nav.querySelector(".fh-catnav-list");
    if (!list) return;
    list.textContent = "";
    FH_PLANET_NAV.forEach(function (item) {
      var a = document.createElement("a");
      a.className = "fh-catnav-link";
      a.href = item.href;
      a.setAttribute("data-nav-id", item.id);
      a.setAttribute("role", "listitem");
      if (itemIsActive(item)) {
        a.classList.add("is-active");
        a.setAttribute("aria-current", "page");
      }
      a.appendChild(textSpan("fh-catnav-icon", item.icon || ""));
      var text = document.createElement("span");
      text.className = "fh-catnav-text";
      text.appendChild(textSpan("fh-catnav-label", item.label || ""));
      if (item.labelBn) text.appendChild(textSpan("fh-catnav-bn", item.labelBn));
      a.appendChild(text);
      list.appendChild(a);
    });
  }

  function mount() {
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
      brand.textContent = "🪐 FH Planet";
      var list = document.createElement("div");
      list.className = "fh-catnav-list";
      list.setAttribute("role", "list");
      inner.appendChild(brand);
      inner.appendChild(list);
      nav.appendChild(inner);
      document.body.insertBefore(nav, document.body.firstChild);
    }
    document.documentElement.classList.add("fh-has-catnav");
    document.body.classList.add("fh-has-catnav");
    render();
    markSidebar();
    scrollToHash();
  }

  function bindSidebar() {
    var buttons = document.querySelectorAll(".sidebar .nav [data-tab]");
    Array.prototype.forEach.call(buttons, function (btn) {
      if (btn.getAttribute("data-fh-cat-bound")) return;
      btn.setAttribute("data-fh-cat-bound", "1");
      btn.addEventListener("click", function () {
        var id = "view-" + btn.getAttribute("data-tab");
        if (!document.getElementById(id)) return;
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
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    mount();
    bindSidebar();
  });
  global.addEventListener("hashchange", function () {
    render();
    markSidebar();
    scrollToHash();
  });
  global.addEventListener("popstate", function () {
    render();
    markSidebar();
    scrollToHash();
  });
})(window);
