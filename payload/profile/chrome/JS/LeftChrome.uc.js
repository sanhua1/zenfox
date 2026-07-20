// ==UserScript==
// @name            LeftChrome
// @description     PLAN.md v0.5.24 — four-row native chrome + resizable synced sidebar
// @version         0.5.24
// @author          local
// ==/UserScript==

/**
 * Layout strategy:
 *   Row1 XUL hbox: lights + account + hamburger + forward + back + reload
 *   Quick row XUL hbox: extensions + downloads + bookmarks + history +
 *                       logins + developer tools + settings
 *   Row2 XUL hbox: REAL #urlbar-container (identity lock, Places autocomplete,
 *                  star, page actions) — constrained to left chrome width
 *   Row3 XUL hbox: extension toolbar buttons only
 *
 * History:
 *   v0.4.x parked native urlbar and used #uc-fake-url (no cert UI / no suggest).
 *   v0.5.0 restores native urlbar into row2.
 *   v0.5.1 tried to clamp breakout geometry with CSS + rAF.
 *   v0.5.2 blocks Firefox's popover/top-layer breakout through the native
 *           incrementBreakoutBlockerCount() API. The native UrlbarView still
 *           opens, but CSS lays it out inside row2 instead of the viewport.
 *   v0.5.3 leaves sidebar sizing to Firefox's native splitter and mirrors its
 *           measured width to the three-row chrome without a second clamp.
 *   v0.5.4 removes the redundant native sidebar toggle from row1.
 *   v0.5.5 optically aligns Firefox 152's trust/certificate button in row2.
 *   v0.5.6 restores the native unified-extensions puzzle icon in the XUL row.
 *   v0.5.7 uses Firefox's solid native puzzle asset to avoid the hollow-mask look.
 *   v0.5.8 excludes the Firefox Profiler toolbar widget from the extension row.
 *   v0.5.9 gives the four row1 navigation controls equal compact button slots.
 *   v0.5.10 tightens those equal slots from 40px to 24px without moving the
 *            hamburger icon's accepted centre position.
 *   v0.5.11 moves the Firefox account avatar from row3 into the same compact
 *            row1 group, immediately before the hamburger button.
 *   v0.5.12 moves downloads from row3 into the same compact row1 group,
 *            immediately after reload.
 *   v0.5.13 normalizes row3 extensions to equal 38px wrapping slots with
 *            centered 18px icon canvases.
 *   v0.5.14 tightens row3 to 32×32px slots and removes extra row padding.
 *   v0.5.15 moves unified extensions into row1 after reload, before downloads.
 *   v0.5.16 excludes Firefox 152's invisible #ai-window-toggle from row3.
 *   v0.5.17 removes the bottom divider and gap between row3 and Sidebery.
 *   v0.5.18 makes row3 extension-only and excludes #smartwindow-ask-button.
 *   v0.5.19 maps the custom chrome background/foreground/border to Firefox's
 *            active theme variables while retaining dark fallbacks.
 *   v0.5.22 opens Sidebery on clean profiles after its sidebar command is
 *            registered, without adding a persistent observer or polling loop.
 *   v0.5.24 adds a native quick-actions row and shifts the original URL and
 *            extension rows down without changing their internal behavior.
 *
 * SAFE: no style MutationObserver loops.
 */

(function () {
  const win = window;
  const doc = document;
  if (win !== win.top || !doc) return;

  const root = doc.documentElement;
  const $ = (id) => doc.getElementById(id);
  const SIDEBERY_ID = "{3c078156-979c-498b-8990-85f7987dd929}";

  const CFG = {
    defaultWidth: 307,
    pad: 4,
  };

  const QUICK_ACTION_IDS = [
    "unified-extensions-button",
    "downloads-button",
    "bookmarks-menu-button",
    "history-panelmenu",
    "logins-button",
    "developer-button",
    "preferences-button",
  ];

  const SKIP_IDS = new Set([
    "urlbar-container",
    "back-button",
    "forward-button",
    "stop-reload-button",
    "reload-button",
    "stop-button",
    "fxa-toolbar-menu-button",
    "downloads-button",
    "unified-extensions-button",
    "bookmarks-menu-button",
    "history-panelmenu",
    "logins-button",
    "developer-button",
    "preferences-button",
    "sidebar-button",
    "vertical-spacer",
  ]);

  // 设为 true 可排查布局；日常保持 false，减少控制台噪音
  const DEBUG = false;

  function log(...a) {
    if (!DEBUG) return;
    try {
      console.log("[LeftChrome]", ...a);
    } catch (_) {}
  }

  function logAlways(...a) {
    try {
      console.log("[LeftChrome]", ...a);
    } catch (_) {}
  }

  function isBrowser() {
    return !!( $("navigator-toolbox") || $("nav-bar") || $("main-window") );
  }

  function setWidth(px) {
    // The native sidebar splitter owns its min/max constraints. Mirror the
    // measured width exactly so the chrome never fights or lags behind it.
    const n = Number(px);
    const w = Math.round(Number.isFinite(n) && n > 0 ? n : CFG.defaultWidth);
    root.style.setProperty("--uc-left-width", w + "px");
    return w;
  }

  function measureSidebar() {
    for (const id of ["sidebar-box"]) {
      const box = $(id);
      if (!box) continue;
      const r = box.getBoundingClientRect();
      if (r.width >= 40) return r.width;
    }
    return null;
  }

  function syncWidth() {
    const m = measureSidebar();
    if (m) setWidth(m);
    else if (!root.style.getPropertyValue("--uc-left-width")) setWidth(CFG.defaultWidth);
  }

  function measureChromeHeight() {
    const nav = $("nav-bar");
    if (!nav) return;
    // #nav-bar is position:fixed; top:0 — its bottom edge is exactly where Sidebery should start
    const r = nav.getBoundingClientRect();
    const h = Math.ceil(r.bottom); // viewport Y of bottom edge
    if (h > 40 && h < 280) {
      root.style.setProperty("--uc-chrome-height", h + "px");
    }
  }

  function setImp(el, map) {
    if (!el) return;
    for (const [k, v] of Object.entries(map)) {
      el.style.setProperty(k, v, "important");
    }
  }

  function makeBox(id, row) {
    // Prefer XUL boxes — HTML div + toolbarbutton causes icon/hit-target mismatch
    let node = null;
    try {
      if (doc.createXULElement) {
        node = doc.createXULElement(row ? "hbox" : "vbox");
      }
    } catch (_) {}
    if (!node) {
      node = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    }
    node.id = id;
    if (row) node.classList.add("uc-left-row");
    try {
      if (row) {
        node.setAttribute("align", "center");
        node.setAttribute("flex", "0");
      }
    } catch (_) {}
    return node;
  }

  /** Reset geometry so click target matches painted icon */
  function resetToolbarGeom(node) {
    if (!node) return;
    setImp(node, {
      position: "relative",
      top: "auto",
      left: "auto",
      right: "auto",
      bottom: "auto",
      inset: "auto",
      transform: "none",
      margin: "0",
      "margin-inline": "0",
      "margin-block": "0",
    });
    // Clear overflow bookkeeping attrs that pin widgets to the chevron panel
    try {
      node.removeAttribute("overflowedItem");
      if (node.getAttribute("cui-anchorid") === "nav-bar-overflow-button") {
        node.removeAttribute("cui-anchorid");
      }
    } catch (_) {}
  }

  function move(parent, node) {
    if (!parent || !node) return false;
    if (node.parentNode === parent) return true;
    try {
      parent.appendChild(node);
      return true;
    } catch (e) {
      log("move fail", node?.id, e);
      return false;
    }
  }

  /**
   * Left chrome is always narrow → Firefox packs almost every extension into
   * the overflow panel, leaving only downloads + unified-extensions on row3
   * and a stray ">>" chevron as a fake first row. Kill overflow permanently
   * and pull widgets back into #nav-bar-customization-target.
   */
  function disableOverflowAndRestore() {
    const nav = $("nav-bar");
    if (!nav) return;

    const overflowBtn = $("nav-bar-overflow-button");
    if (overflowBtn) {
      setImp(overflowBtn, {
        display: "none",
        visibility: "collapse",
        width: "0",
        "min-width": "0",
        "max-width": "0",
        margin: "0",
        padding: "0",
        flex: "0 0 0",
        order: "99",
      });
    }

    // Prefer official teardown so items return from #widget-overflow-list.
    // Only uninit once — re-running every layout() can thrash CustomizableUI.
    if (!nav.__ucOverflowKilled) {
      try {
        if (nav.overflowable && typeof nav.overflowable.uninit === "function") {
          nav.overflowable.uninit();
        }
      } catch (e) {
        log("overflow uninit", e);
      }
      try {
        // Some builds keep a dead object; null it so resize cannot re-overflow
        nav.overflowable = null;
      } catch (_) {}
      try {
        delete nav.overflowable;
      } catch (_) {}
      nav.__ucOverflowKilled = true;
    } else if (nav.overflowable) {
      // Something re-created overflowable — kill again
      try {
        if (typeof nav.overflowable.uninit === "function") {
          nav.overflowable.uninit();
        }
      } catch (_) {}
      try {
        nav.overflowable = null;
      } catch (_) {}
    }

    try {
      nav.removeAttribute("overflowable");
      nav.removeAttribute("overflowing");
    } catch (_) {}

    const target = $("nav-bar-customization-target");
    if (!target) return;

    // Manual rescue: anything still parked in the overflow list / panel
    const rescueRoots = [];
    for (const id of ["widget-overflow-list", "widget-overflow-fixed-list"]) {
      const el = $(id);
      if (el) rescueRoots.push(el);
    }
    try {
      const body = doc.querySelector("#widget-overflow .panel-subview-body");
      if (body) rescueRoots.push(body);
    } catch (_) {}

    const isToolbarWidget = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const ln = node.localName;
      return ln === "toolbarbutton" || ln === "toolbaritem";
    };

    const shouldSkip = (id) =>
      !id ||
      SKIP_IDS.has(id) ||
      id === "urlbar-container" ||
      id === "PanelUI-button" ||
      id === "PanelUI-menu-button" ||
      id === "nav-bar-overflow-button" ||
      id === "uc-left-host" ||
      id === "uc-left-row1" ||
      id === "uc-left-quick-actions" ||
      id === "uc-left-row2" ||
      id === "uc-fake-url";

    for (const root of rescueRoots) {
      for (const child of Array.from(root.children || [])) {
        let widget = child;
        if (child.localName === "toolbarpaletteitem") {
          widget = child.firstElementChild;
        }
        if (!isToolbarWidget(widget)) continue;
        const id = widget.id || "";
        if (shouldSkip(id)) continue;
        try {
          if (widget.parentNode && widget.parentNode.localName === "toolbarpaletteitem") {
            const wrap = widget.parentNode;
            target.appendChild(widget);
            try {
              wrap.remove();
            } catch (_) {}
          } else if (widget.parentNode !== target) {
            target.appendChild(widget);
          }
          resetToolbarGeom(widget);
        } catch (e) {
          log("rescue fail", id, e);
        }
      }
    }

    // Clear overflowedItem on anything already in target
    try {
      for (const child of Array.from(target.children)) {
        resetToolbarGeom(child);
      }
    } catch (_) {}
  }

  function findLights(nav) {
    return (
      nav.querySelector(".titlebar-buttonbox-container") ||
      doc.querySelector("#nav-bar .titlebar-buttonbox-container") ||
      doc.querySelector("#titlebar .titlebar-buttonbox-container") ||
      doc.querySelector(".titlebar-buttonbox-container")
    );
  }

  /** Resolve a CUI widget node even if it is not under #nav-bar yet. */
  function findWidgetNode(id) {
    let node = $(id);
    if (node) return node;
    try {
      const w = win.CustomizableUI?.getWidget?.(id);
      const inst = w?.forWindow?.(win);
      if (inst?.node) return inst.node;
    } catch (_) {}
    try {
      return (
        doc.querySelector("#" + id) ||
        doc.querySelector(`toolbarpaletteitem[id*="${id}"] > *`) ||
        null
      );
    } catch (_) {
      return null;
    }
  }

  /** Materialize every fixed quick action in this window's nav-bar area. */
  function ensureQuickActionsPlaced() {
    const CUI = win.CustomizableUI;
    if (!CUI) return;

    // Firefox 延迟注册开发者按钮；启动阶段的定时布局会在注册后再次收纳。
    for (const id of QUICK_ACTION_IDS) {
      try {
        const placement = CUI.getPlacementOfWidget?.(id);
        if (!placement || placement.area !== "nav-bar") {
          CUI.addWidgetToArea(id, CUI.AREA_NAVBAR || "nav-bar");
        }
        CUI.ensureWidgetPlacedInWindow?.(id, win);
      } catch (error) {
        log("place quick action", id, error);
      }
    }
  }

  /**
   * Light touch only — do NOT set display/width/height on XUL toolbarbuttons.
   * Fixed boxes + flex badge-stack desync painted icon vs click target.
   */
  function lightGeom(node) {
    if (!node) return;
    resetToolbarGeom(node);
    try {
      node.removeAttribute("hidden");
      node.removeAttribute("collapsed");
      node.hidden = false;
    } catch (_) {}
    try {
      node.style?.removeProperty("display");
      node.style?.removeProperty("width");
      node.style?.removeProperty("height");
      node.style?.removeProperty("min-width");
      node.style?.removeProperty("max-width");
      node.style?.removeProperty("min-height");
      node.style?.removeProperty("flex");
    } catch (_) {}
    setImp(node, {
      visibility: "visible",
      opacity: "1",
      overflow: "visible",
      margin: "0",
      "margin-inline": "0",
    });
  }

  function isAiJunk(node) {
    if (!node) return false;
    const id = (node.id || "").toLowerCase();
    const label = (
      node.getAttribute?.("label") ||
      node.getAttribute?.("tooltiptext") ||
      ""
    ).toLowerCase();
    return (
      /chatbot|genai|aichat|ai[-_]?window|smart[-_]?window|smart-assist|ask-chat/.test(id) ||
      label === "ask" ||
      label.includes("ask chatbot") ||
      label.includes("ai window")
    );
  }

  function isExtensionAction(node) {
    return /-browser-action$/i.test(node?.id || "");
  }

  const ROW1_IDS = new Set([
    "back-button",
    "forward-button",
    "stop-reload-button",
    "reload-button",
    "stop-button",
    "fxa-toolbar-menu-button",
    "downloads-button",
    "unified-extensions-button",
    "bookmarks-menu-button",
    "history-panelmenu",
    "logins-button",
    "developer-button",
    "preferences-button",
    "sidebar-button",
    "PanelUI-button",
    "PanelUI-menu-button",
    "urlbar-container",
    "vertical-spacer",
    "nav-bar-overflow-button",
  ]);

  const HIDDEN_TOOLBAR_IDS = new Set([
    "profiler-button",
    "profiler-button-button",
    "ai-window-toggle",
    "ai-window-toggle-button",
    "smartwindow-ask-button",
    "smart-window-ask-button",
  ]);

  /**
   * The fourth visual row uses the original row3 XUL hbox. Moving toolbarbuttons into an
   * HTML div breaks hit-testing; XUL→XUL is fine. Pull extension widgets
   * into #uc-left-row3; collapse the empty CUI target.
   */
  function fillExtRow(row3) {
    if (!row3) return;

    // Clean nodes already captured by an earlier layout pass. Otherwise the
    // iconless AI Window toggle can retain a clickable wrapping-grid slot.
    for (const node of Array.from(row3.children)) {
      const id = node.id || "";
      if (
        HIDDEN_TOOLBAR_IDS.has(id) ||
        isAiJunk(node) ||
        !isExtensionAction(node)
      ) {
        setImp(node, {
          display: "none",
          visibility: "collapse",
          flex: "0 0 0",
          width: "0",
          "min-width": "0",
          "max-width": "0",
          height: "0",
          margin: "0",
          padding: "0",
          "pointer-events": "none",
        });
      }
    }

    const target = $("nav-bar-customization-target");
    const nav = $("nav-bar");

    // Collect candidates from CUI target + direct nav-bar children
    const candidates = [];
    const seen = new Set();
    const push = (node) => {
      if (!node || seen.has(node)) return;
      const id = node.id || "";
      if (HIDDEN_TOOLBAR_IDS.has(id)) {
        setImp(node, {
          display: "none",
          visibility: "collapse",
          flex: "0 0 0",
          width: "0",
          "min-width": "0",
          "max-width": "0",
          height: "0",
          margin: "0",
          padding: "0",
          "pointer-events": "none",
        });
        return;
      }
      if (ROW1_IDS.has(id) || SKIP_IDS.has(id)) return;
      if (id.startsWith("uc-")) return;
      if (id === "customizableui-special-spring1" || id === "customizableui-special-spring2")
        return;
      if (node.localName === "toolbarspring") return;
      if (isAiJunk(node)) {
        setImp(node, { display: "none" });
        return;
      }
      if (
        node.localName !== "toolbarbutton" &&
        node.localName !== "toolbaritem"
      ) {
        return;
      }
      // Row3 is an extension launcher grid, not a catch-all for Firefox's
      // dynamically added native toolbar controls.
      if (!isExtensionAction(node)) return;
      seen.add(node);
      candidates.push(node);
    };

    if (target) {
      for (const child of Array.from(target.children)) push(child);
    }
    if (nav) {
      for (const child of Array.from(nav.children)) {
        if (child === target) continue;
        if (child.id === "uc-left-host") continue;
        push(child);
      }
    }

    // Always try these by id (may live outside the lists above)
    for (const id of [
      "downloads-button",
      "unified-extensions-button",
      "fxa-toolbar-menu-button",
    ]) {
      push(findWidgetNode(id));
    }

    // Move the remaining extension widgets into XUL row3 in their CUI order.
    for (const node of candidates) {
      try {
        if (
          node.parentNode &&
          node.parentNode.localName === "toolbarpaletteitem"
        ) {
          const wrap = node.parentNode;
          row3.appendChild(node);
          try {
            wrap.remove();
          } catch (_) {}
        } else {
          move(row3, node);
        }
        lightGeom(node);
      } catch (e) {
        log("fillExtRow move", node?.id, e);
      }
    }

    // Hide empty/leftover customization-target so it doesn't take a flex slot
    if (target) {
      // Leave springs/urlbar leftovers cleaned
      for (const child of Array.from(target.children)) {
        if (child.localName === "toolbarspring" || child.id === "vertical-spacer") {
          setImp(child, { display: "none", width: "0" });
        }
      }
      setImp(target, {
        display: "none",
        width: "0",
        height: "0",
        "min-height": "0",
        "max-height": "0",
        overflow: "hidden",
        order: "9",
      });
    }

    const list = Array.from(row3.children)
      .map((c) => c.id || c.localName)
      .join(", ");
    log("row3 widgets:", list);
    // One-shot summary so user can verify downloads is present
    if (!row3.__ucLogged) {
      row3.__ucLogged = true;
      logAlways("row3 widgets:", list || "(empty)");
    }
  }

  /** Clear inline park styles left by older LeftChrome versions */
  function clearUrlbarParkStyles(el) {
    if (!el?.style) return;
    for (const p of [
      "position",
      "top",
      "left",
      "right",
      "bottom",
      "width",
      "height",
      "max-width",
      "max-height",
      "min-width",
      "min-height",
      "margin",
      "padding",
      "overflow",
      "opacity",
      "pointer-events",
      "z-index",
      "transform",
      "visibility",
    ]) {
      try {
        el.style.removeProperty(p);
      } catch (_) {}
    }
  }

  /**
   * Firefox 152 makes moz-urlbar a manual popover. showPopover() promotes it
   * to the top layer, where percentage widths are viewport-relative even after
   * reparenting. Use Firefox's public blocker API to keep the real urlbar and
   * UrlbarView in row2 without ever entering that top layer.
   */
  function disableUrlbarBreakout(urlbar) {
    if (!urlbar || urlbar.__ucBreakoutBlocked) return;
    try {
      if (typeof urlbar.incrementBreakoutBlockerCount === "function") {
        urlbar.incrementBreakoutBlockerCount();
        urlbar.__ucBreakoutBlocked = true;
      } else {
        // Defensive fallback for older Firefox builds.
        urlbar.removeAttribute("breakout");
        urlbar.parentNode?.removeAttribute?.("breakout");
        try {
          urlbar.hidePopover?.();
        } catch (_) {}
      }
    } catch (e) {
      log("disableUrlbarBreakout", e);
    }
  }

  /**
   * Mount the REAL #urlbar-container into row2.
   * Gives native identity/cert UI, Places autocomplete, star, page actions.
   * Firefox's top-layer breakout is blocked; native results render in row2.
   */
  function mountNativeUrlbar(row2) {
    if (!row2) return false;
    const container = $("urlbar-container");
    const urlbar = $("urlbar");
    if (!container) return false;

    // Drop legacy fake bar if present
    const fake = $("uc-fake-url");
    if (fake) {
      try {
        fake.remove();
      } catch (_) {
        setImp(fake, { display: "none" });
      }
    }

    move(row2, container);
    clearUrlbarParkStyles(container);
    clearUrlbarParkStyles(urlbar);
    disableUrlbarBreakout(urlbar);
    try {
      container.removeAttribute("hidden");
      container.hidden = false;
    } catch (_) {}

    setImp(container, {
      position: "relative",
      top: "auto",
      left: "auto",
      flex: "1 1 auto",
      width: "100%",
      "max-width": "100%",
      "min-width": "0",
      height: "var(--uc-urlbar-height)",
      "min-height": "var(--uc-urlbar-height)",
      margin: "0",
      padding: "0",
      opacity: "1",
      visibility: "visible",
      "pointer-events": "auto",
      overflow: "visible",
      "z-index": "20",
    });

    if (urlbar) {
      // With breakout blocked, the native bar always belongs to row2.
      if (!urlbar.hasAttribute("open")) {
        clearUrlbarParkStyles(urlbar);
        setImp(urlbar, {
          position: "relative",
          top: "auto",
          left: "auto",
          width: "100%",
          "max-width": "100%",
          "min-width": "0",
          opacity: "1",
          visibility: "visible",
          "pointer-events": "auto",
          overflow: "visible",
        });
      }
    }

    return true;
  }

  function focusUrlbar() {
    try {
      if (win.gURLBar) {
        win.gURLBar.focus();
        try {
          win.gURLBar.select();
        } catch (_) {}
        return;
      }
    } catch (_) {}
    try {
      const input =
        $("urlbar-input") ||
        doc.querySelector("#urlbar-input, .urlbar-input-box > input");
      if (input) {
        input.focus();
        input.select?.();
      }
    } catch (_) {}
  }

  // Legacy no-ops so older bind sites don't throw if any remain
  function syncFakeFromTab() {}
  function parkNativeUrlbar() {
    /* v0.5: native bar is mounted, not parked */
  }

  function ensureRows() {
    const nav = $("nav-bar");
    if (!nav) return false;

    // 1) Kill overflow FIRST so widgets return to customization-target.
    //    (Must happen before row1 moves; uninit restores native placements.)
    disableOverflowAndRestore();

    let host = $("uc-left-host");
    if (!host) {
      host = makeBox("uc-left-host", false);
      nav.insertBefore(host, nav.firstChild);
    }

    // All four visual rows are XUL boxes under host (row = hbox).
    let row1 = $("uc-left-row1");
    let quickRow = $("uc-left-quick-actions");
    let row2 = $("uc-left-row2");
    let row3 = $("uc-left-row3");
    if (!row1) {
      row1 = makeBox("uc-left-row1", true);
      host.appendChild(row1);
    }
    if (!quickRow) {
      quickRow = makeBox("uc-left-quick-actions", true);
      host.appendChild(quickRow);
    }
    if (!row2) {
      row2 = makeBox("uc-left-row2", true);
      host.appendChild(row2);
    }
    if (!row3) {
      row3 = makeBox("uc-left-row3", true);
      host.appendChild(row3);
    } else if (row3.parentNode !== host) {
      host.appendChild(row3);
    }
    // If an older HTML div row3 somehow exists, replace with XUL
    if (row3.namespaceURI === "http://www.w3.org/1999/xhtml") {
      const neu = makeBox("uc-left-row3", true);
      try {
        while (row3.firstChild) neu.appendChild(row3.firstChild);
        row3.replaceWith(neu);
      } catch (_) {
        try {
          row3.remove();
        } catch (_) {}
        host.appendChild(neu);
      }
      row3 = neu;
    }

    // 2) Row1 — window and navigation controls only.
    const r1nodes = [
      findLights(nav),
      findWidgetNode("fxa-toolbar-menu-button"),
      $("PanelUI-button"),
      $("forward-button"),
      $("back-button"),
      $("stop-reload-button") || $("reload-button"),
    ];
    for (const n of r1nodes) {
      if (move(row1, n)) {
        resetToolbarGeom(n);
      }
    }

    // 3) Quick row — fixed native actions in the requested order.
    ensureQuickActionsPlaced();
    for (const id of QUICK_ACTION_IDS) {
      const node = findWidgetNode(id);
      if (!move(quickRow, node)) continue;
      lightGeom(node);
    }

    // 4) Original row2: REAL native urlbar (identity + autocomplete + star)
    mountNativeUrlbar(row2);

    // 5) Original row3: extension widgets in XUL hbox (hit-test safe)
    fillExtRow(row3);

    // Hide any leftover overflow button after layout
    const overflowBtn = $("nav-bar-overflow-button");
    if (overflowBtn) {
      setImp(overflowBtn, {
        display: "none",
        visibility: "collapse",
        width: "0",
        order: "99",
      });
    }

    // Hide AI Ask / callouts under nav-bar
    try {
      for (const el of nav.querySelectorAll(
        "[id*='chatbot' i], [id*='genai' i], [id*='aichat' i], " +
          "[id*='ai-window' i], [id*='aiwindow' i], " +
          "[id*='smart-window' i], [id*='smartwindow' i], " +
          "toolbarbutton[label='Ask'], .browser-callout, .feature-callout, " +
          "#selection-shortcut-action-panel"
      )) {
        el.style?.setProperty("display", "none", "important");
      }
    } catch (_) {}

    measureChromeHeight();
    win.requestAnimationFrame(() => measureChromeHeight());
    return true;
  }

  function watchSidebar() {
    for (const id of ["sidebar-box"]) {
      const node = $(id);
      if (!node || node.__ucRO) continue;
      try {
        const ro = new win.ResizeObserver(() => {
          syncWidth();
          measureChromeHeight();
        });
        ro.observe(node);
        node.__ucRO = ro;
      } catch (_) {}
    }
  }

  /**
   * A newly-created Firefox profile knows that Sidebery is installed, but it
   * does not necessarily select its sidebar action. Wait briefly for the
   * WebExtension to register, then open its native sidebar command once.
   */
  function ensureSideberySidebar(attempt = 0) {
    try {
      const controller = win.SidebarController;
      const extension = controller
        ?.getExtensions?.()
        ?.find((item) => item?.extensionId === SIDEBERY_ID);

      if (extension?.commandID) {
        if (!controller.isOpen || controller.currentID !== extension.commandID) {
          Promise.resolve(controller.show(extension.commandID))
            .then(() => {
              syncWidth();
              measureChromeHeight();
            })
            .catch((error) => log("open Sidebery", error));
        } else {
          syncWidth();
        }
        return;
      }
    } catch (error) {
      log("find Sidebery", error);
    }

    // Finite startup retry only: 40 × 250ms = at most 10 seconds.
    if (attempt < 39) {
      win.setTimeout(() => ensureSideberySidebar(attempt + 1), 250);
    }
  }

  function bindTabSync() {
    if (win.__ucTabSync) return;
    win.__ucTabSync = true;

    // Cmd+L / Ctrl+L → native urlbar (do not steal if already handled)
    win.addEventListener(
      "keydown",
      (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && !e.altKey && !e.shiftKey && (e.key === "l" || e.key === "L")) {
          // Ensure bar is mounted, then focus native
          const row2 = $("uc-left-row2");
          if (row2) mountNativeUrlbar(row2);
          // Let default run too if gURLBar handles it; still force focus after
          win.setTimeout(focusUrlbar, 0);
        }
      },
      true
    );

  }

  function layout(reason) {
    try {
      syncWidth();
      ensureRows();
      measureChromeHeight();
      log("layout", reason, "w=", root.style.getPropertyValue("--uc-left-width"));
    } catch (e) {
      if (DEBUG) console.error("[LeftChrome] layout error", e);
    }
  }

  function init() {
    if (!isBrowser()) return;
    if (root.getAttribute("uc-left-chrome") === "ready") return;

    root.setAttribute("uc-left-chrome", "init");
    setWidth(CFG.defaultWidth);

    const boot = () => {
      layout("boot");
      watchSidebar();
      bindTabSync();
      ensureSideberySidebar();
      root.setAttribute("uc-left-chrome", "ready");
      logAlways("ready v0.5.24 (four-row chrome; Sidebery selected)");
    };

    if ($("nav-bar")) boot();
    else {
      const mo = new win.MutationObserver(() => {
        if ($("nav-bar")) {
          mo.disconnect();
          boot();
        }
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      win.setTimeout(() => {
        mo.disconnect();
        if (root.getAttribute("uc-left-chrome") !== "ready") boot();
      }, 4000);
    }

    [700, 2000, 4000].forEach((ms) => {
      win.setTimeout(() => {
        layout("t+" + ms);
        watchSidebar();
      }, ms);
    });

    win.addEventListener("resize", () => measureChromeHeight());

    try {
      if (win.CustomizableUI?.addListener) {
        win.CustomizableUI.addListener({
          onCustomizeEnd() {
            win.setTimeout(() => layout("customizeEnd"), 150);
          },
          onWidgetAfterDOMChange(aNode, aNextNode, aContainer, aWasRemoval) {
            // AI/Smart Window controls can arrive after boot. Run cleanup
            // instead of ignoring them, or their iconless grid slot survives.
            if (!$("uc-left-host")) return;
            const id = aNode?.id || "";
            if (/chatbot|genai|aichat|ai[-_]?window|smart[-_]?window|callout|smart-assist/i.test(id)) {
              win.setTimeout(() => layout("nativeAiWidgetChange"), 0);
              return;
            }
            win.setTimeout(() => layout("widgetChange"), 300);
          },
        });
      }
    } catch (_) {}
  }

  if (doc.readyState === "complete") win.setTimeout(init, 0);
  else win.addEventListener("load", () => win.setTimeout(init, 0), { once: true });
})();
