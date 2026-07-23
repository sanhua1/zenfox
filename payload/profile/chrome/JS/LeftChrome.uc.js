// ==UserScript==
// @name            LeftChrome
// @description     PLAN.md v0.5.33 — bridged tab-based ZenFox settings
// @version         0.5.33
// @author          local
// ==/UserScript==

/**
 * Layout strategy:
 *   Row1 XUL hbox: lights + account + hamburger + back + forward + reload
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
 *   v0.5.25 matches the quick-actions row to row1's compact control sizing.
 *   v0.5.26 renders Windows and Linux caption controls as CSS traffic lights.
 *   v0.5.27 normalizes native quick-action hover and active backgrounds.
 *   v0.5.28 applies the same bounded state layer to row1 controls.
 *   v0.5.29 lets blank space in the quick-actions row drag the window.
 *   v0.5.30 adds a persisted, sortable settings panel for native quick actions.
 *   v0.5.31 supports fresh Sidebery defaults and restores back/forward order.
 *   v0.5.32 opens ZenFox settings in a dedicated privileged browser tab.
 *   v0.5.33 bridges the settings tab through browser chrome without page privileges.
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
  const PREF_QUICK_ACTIONS = "zenfox.quickActions.v1";
  const PREF_SIDEBERY_APPEARANCE_BACKUP = "zenfox.sideberyAppearanceBackup.v1";
  const PREF_SIDEBERY_CSS_BACKUP = "zenfox.sideberyCssBackup.v1";
  const SETTINGS_URL = "chrome://zenfox/content/settings.html";
  const ServicesApi = (() => {
    if (win.Services) return win.Services;
    if (typeof Services !== "undefined") return Services;
    try {
      return ChromeUtils.importESModule(
        "resource://gre/modules/Services.sys.mjs"
      ).Services;
    } catch (_) {
      return null;
    }
  })();

  const IS_ZH = (() => {
    const locale =
      ServicesApi?.locale?.appLocaleAsBCP47 ||
      ServicesApi?.locale?.requestedLocale ||
      win.navigator?.language ||
      "en";
    return String(locale).toLowerCase().startsWith("zh");
  })();

  const TEXT = IS_ZH
    ? {
        settings: "ZenFox 设置",
        quickActions: "第二行按钮",
        appearance: "外观设置",
        subtitle: "配置第二行按钮和 Sidebery 外观。",
        enabled: "已显示",
        available: "可添加",
        dragSort: "拖拽排序",
        canAdd: "可添加",
        moveUp: "上移",
        moveDown: "下移",
        hide: "隐藏",
        add: "添加",
        emptyEnabled: "第二行当前为空。",
        emptyAvailable: "没有其他可添加的原生单按钮。",
        reset: "恢复默认",
        cancel: "取消",
        apply: "应用",
        close: "关闭",
        sidebery: "Sidebery",
        fontSize: "字体大小",
        density: "排列方式",
        densityCompact: "紧凑",
        densityDefault: "默认",
        densityLoose: "宽松",
        activatedForeground: "激活项前景色",
        activatedBackground: "激活项背景色",
        enabled: "打开",
        disabled: "关闭",
        sideberyLoading: "正在读取 Sidebery 配置…",
        sideberyUnavailable: "无法读取 Sidebery 配置。请确认 Sidebery 已启用。",
        sideberySaved: "Sidebery 外观已应用。",
      }
    : {
        settings: "ZenFox Settings",
        quickActions: "Quick Actions",
        appearance: "Appearance",
        subtitle: "Configure second-row buttons and Sidebery appearance.",
        enabled: "Shown",
        available: "Available",
        dragSort: "Drag to reorder",
        canAdd: "Available to add",
        moveUp: "Move up",
        moveDown: "Move down",
        hide: "Hide",
        add: "Add",
        emptyEnabled: "The second row is empty.",
        emptyAvailable: "No other native single-button widgets are available.",
        reset: "Restore defaults",
        cancel: "Cancel",
        apply: "Apply",
        close: "Close",
        sidebery: "Sidebery",
        fontSize: "Font size",
        density: "Density",
        densityCompact: "Compact",
        densityDefault: "Default",
        densityLoose: "Relaxed",
        activatedForeground: "Activated foreground",
        activatedBackground: "Activated background",
        enabled: "On",
        disabled: "Off",
        sideberyLoading: "Loading Sidebery settings…",
        sideberyUnavailable: "Unable to read Sidebery settings. Make sure Sidebery is enabled.",
        sideberySaved: "Sidebery appearance applied.",
      };

  const SIDEBERY_FONT_SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"];
  const SIDEBERY_DENSITIES = ["compact", "default", "loose"];
  const SIDEBERY_COLOR_RULES = {
    activeForeground: "--tabs-activated-fg",
    activeBackground: "--tabs-activated-bg",
  };

  const CFG = {
    defaultWidth: 307,
    pad: 4,
  };

  const DEFAULT_QUICK_ACTION_IDS = [
    "unified-extensions-button",
    "downloads-button",
    "bookmarks-menu-button",
    "history-panelmenu",
    "logins-button",
    "developer-button",
    "preferences-button",
  ];

  const KNOWN_NATIVE_QUICK_ACTION_IDS = [
    ...DEFAULT_QUICK_ACTION_IDS,
    "save-page-button",
    "print-button",
    "find-button",
    "open-file-button",
    "characterencoding-button",
    "email-link-button",
    "share-tab-button",
    "sync-button",
    "send-tab-button",
    "panic-button",
    "privatebrowsing-button",
    "tab-groups-button",
  ];

  const QUICK_ACTION_LABELS = IS_ZH
    ? {
        "unified-extensions-button": "扩展",
        "downloads-button": "下载",
        "bookmarks-menu-button": "书签",
        "history-panelmenu": "历史记录",
        "logins-button": "密码",
        "developer-button": "开发者工具",
        "preferences-button": "设置",
        "save-page-button": "保存页面",
        "print-button": "打印",
        "find-button": "查找",
        "open-file-button": "打开文件",
        "characterencoding-button": "文本编码",
        "email-link-button": "发送链接",
        "share-tab-button": "分享标签页",
        "sync-button": "同步标签页",
        "send-tab-button": "发送标签页",
        "panic-button": "清除近期历史",
        "privatebrowsing-button": "新建隐私窗口",
        "tab-groups-button": "标签页组",
      }
    : {
        "unified-extensions-button": "Extensions",
        "downloads-button": "Downloads",
        "bookmarks-menu-button": "Bookmarks",
        "history-panelmenu": "History",
        "logins-button": "Passwords",
        "developer-button": "Developer Tools",
        "preferences-button": "Settings",
        "save-page-button": "Save Page",
        "print-button": "Print",
        "find-button": "Find",
        "open-file-button": "Open File",
        "characterencoding-button": "Text Encoding",
        "email-link-button": "Email Link",
        "share-tab-button": "Share Tab",
        "sync-button": "Sync Tabs",
        "send-tab-button": "Send Tab",
        "panic-button": "Forget Recent History",
        "privatebrowsing-button": "New Private Window",
        "tab-groups-button": "Tab Groups",
      };

  const QUICK_ACTION_EXCLUDED_IDS = new Set([
    "urlbar-container",
    "back-button",
    "forward-button",
    "stop-reload-button",
    "reload-button",
    "stop-button",
    "fxa-toolbar-menu-button",
    "PanelUI-button",
    "PanelUI-menu-button",
    "sidebar-button",
    "vertical-spacer",
    "nav-bar-overflow-button",
    "profiler-button",
    "profiler-button-button",
    "ai-window-toggle",
    "ai-window-toggle-button",
    "smartwindow-ask-button",
    "smart-window-ask-button",
    "zoom-controls",
    "edit-controls",
  ]);

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

  /** Read the persisted ordered quick-action IDs, falling back to defaults. */
  function readQuickActionIds() {
    try {
      const raw = ServicesApi?.prefs?.getStringPref(PREF_QUICK_ACTIONS, "");
      if (!raw) return [...DEFAULT_QUICK_ACTION_IDS];
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return [...DEFAULT_QUICK_ACTION_IDS];
      return Array.from(
        new Set(
          ids.filter(
            (id) =>
              typeof id === "string" &&
              /^[A-Za-z0-9_{}@.+-]+$/.test(id) &&
              !QUICK_ACTION_EXCLUDED_IDS.has(id) &&
              !/-browser-action$/i.test(id)
          )
        )
      );
    } catch (error) {
      log("read quick actions", error);
      return [...DEFAULT_QUICK_ACTION_IDS];
    }
  }

  /** Persist the ordered quick-action IDs for future browser windows. */
  function saveQuickActionIds(ids) {
    ServicesApi?.prefs?.setStringPref(
      PREF_QUICK_ACTIONS,
      JSON.stringify(Array.from(new Set(ids)))
    );
  }

  /**
   * 读取 Sidebery 自己的 storage.local
   * 优先使用 Firefox 当前的 IndexedDB 后端，保留旧后端兼容
   */
  async function getSideberyStorage() {
    const { ExtensionParent } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionParent.sys.mjs"
    );
    const extension = ExtensionParent.GlobalManager.getExtension(SIDEBERY_ID);
    if (!extension || extension.hasShutdown) throw new Error("Sidebery is unavailable");

    const { ExtensionStorageIDB } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionStorageIDB.sys.mjs"
    );
    const backend = await ExtensionStorageIDB.selectBackend({ extension });
    if (backend.backendEnabled) {
      const storagePrincipal = ExtensionStorageIDB.getStoragePrincipal(extension);
      const connection = await ExtensionStorageIDB.open(
        storagePrincipal,
        extension.hasPermission("unlimitedStorage")
      );
      return {
        extension,
        get: (keys) => connection.get(keys),
        set: async (items) => {
          const changes = await connection.set(items);
          if (changes) ExtensionStorageIDB.notifyListeners(SIDEBERY_ID, changes);
        },
      };
    }

    const { ExtensionStorage } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionStorage.sys.mjs"
    );
    return {
      extension,
      get: (keys) => ExtensionStorage.get(SIDEBERY_ID, keys),
      set: (items) => ExtensionStorage.set(SIDEBERY_ID, items),
    };
  }

  function getSideberyCssRule(css, cssVar) {
    const re = new RegExp(
      `#root\\.root\\s*\\{\\s*${cssVar}\\s*:\\s*([^;{}]+);\\s*\\}`,
      "g"
    );
    const match = re.exec(css || "");
    return match ? match[1].trim() : "";
  }

  function setSideberyCssRule(css, cssVar, enabled, value) {
    const re = new RegExp(
      `#root\\.root\\s*\\{\\s*${cssVar}\\s*:\\s*[^;{}]+;\\s*\\}\\s*`,
      "g"
    );
    const rest = String(css || "").replace(re, "").trim();
    if (!enabled) return rest;
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length > 100 || /[;{}\r\n]/.test(normalized)) {
      throw new Error(`Invalid Sidebery color: ${cssVar}`);
    }
    const rule = `#root.root {${cssVar}: ${normalized};}`;
    return rest ? `${rule}\n${rest}` : rule;
  }

  /** 读取并校验 ZenFox 支持的 Sidebery 外观字段。 */
  async function readSideberyAppearance() {
    const storage = await getSideberyStorage();
    const stored = await storage.get(["settings", "sidebarCSS"]);
    // 全新 Sidebery 会在内存中使用默认值，不一定立即创建 settings 键。
    const settings =
      stored?.settings && typeof stored.settings === "object" ? stored.settings : {};
    const sidebarCSS = typeof stored.sidebarCSS === "string" ? stored.sidebarCSS : "";
    const activeForeground = getSideberyCssRule(
      sidebarCSS,
      SIDEBERY_COLOR_RULES.activeForeground
    );
    const activeBackground = getSideberyCssRule(
      sidebarCSS,
      SIDEBERY_COLOR_RULES.activeBackground
    );
    return {
      fontSize: SIDEBERY_FONT_SIZES.includes(settings.fontSize)
        ? settings.fontSize
        : "m",
      density: SIDEBERY_DENSITIES.includes(settings.density)
        ? settings.density
        : "default",
      activeForegroundEnabled: !!activeForeground,
      activeForeground: activeForeground || "rgb(255,255,255)",
      activeBackgroundEnabled: !!activeBackground,
      activeBackground: activeBackground || "#f20006ff",
      version: storage.extension.manifest?.version || "unknown",
    };
  }

  /**
   * 重建正在显示的 Sidebery 侧栏
   * 使用 Firefox 原生关闭/打开链路，避免直接 reload 后留下空白侧栏
   */
  async function reloadSideberySidebars() {
    const windows = ServicesApi?.wm?.getEnumerator("navigator:browser");
    if (!windows) return;

    const reloads = [];
    while (windows.hasMoreElements()) {
      const browserWindow = windows.getNext();
      try {
        const controller = browserWindow.SidebarController;
        const extension = controller
          ?.getExtensions?.()
          ?.find((item) => item?.extensionId === SIDEBERY_ID);
        if (!extension?.commandID || controller.currentID !== extension.commandID) continue;

        controller.hide({ dismissPanel: false });
        reloads.push(Promise.resolve(controller.show(extension.commandID)));
      } catch (error) {
        log("rebuild Sidebery sidebar", error);
      }
    }
    await Promise.all(reloads);
  }

  /**
   * 合并写回 ZenFox 支持的外观字段
   * 第一次修改前保存原值，Sidebery 的其他配置保持不变
   */
  async function saveSideberyAppearance(appearance) {
    if (
      !SIDEBERY_FONT_SIZES.includes(appearance?.fontSize) ||
      !SIDEBERY_DENSITIES.includes(appearance?.density)
    ) {
      throw new Error("Invalid Sidebery appearance values");
    }

    const storage = await getSideberyStorage();
    const stored = await storage.get(["settings", "sidebarCSS"]);
    // settings 缺失是 Sidebery 全新 Profile 的合法状态，首次应用时增量创建。
    const settings =
      stored?.settings && typeof stored.settings === "object" ? stored.settings : {};

    if (!ServicesApi?.prefs?.prefHasUserValue(PREF_SIDEBERY_APPEARANCE_BACKUP)) {
      ServicesApi?.prefs?.setStringPref(
        PREF_SIDEBERY_APPEARANCE_BACKUP,
        JSON.stringify({
          fontSize: SIDEBERY_FONT_SIZES.includes(settings.fontSize)
            ? settings.fontSize
            : "m",
          density: SIDEBERY_DENSITIES.includes(settings.density)
            ? settings.density
            : "default",
          version: storage.extension.manifest?.version || "unknown",
        })
      );
    }
    const sidebarCSS = typeof stored.sidebarCSS === "string" ? stored.sidebarCSS : "";
    if (!ServicesApi?.prefs?.prefHasUserValue(PREF_SIDEBERY_CSS_BACKUP)) {
      ServicesApi?.prefs?.setStringPref(PREF_SIDEBERY_CSS_BACKUP, sidebarCSS);
    }

    let nextSidebarCSS = setSideberyCssRule(
      sidebarCSS,
      SIDEBERY_COLOR_RULES.activeForeground,
      !!appearance.activeForegroundEnabled,
      appearance.activeForeground
    );
    nextSidebarCSS = setSideberyCssRule(
      nextSidebarCSS,
      SIDEBERY_COLOR_RULES.activeBackground,
      !!appearance.activeBackgroundEnabled,
      appearance.activeBackground
    );

    await storage.set({
      settings: {
        ...settings,
        fontSize: appearance.fontSize,
        density: appearance.density,
      },
      sidebarCSS: nextSidebarCSS,
    });
    await reloadSideberySidebars();
  }

  /** Materialize every enabled quick action in this window's nav-bar area. */
  function ensureQuickActionsPlaced(ids) {
    const CUI = win.CustomizableUI;
    if (!CUI) return;

    // Firefox 延迟注册开发者按钮；启动阶段的定时布局会在注册后再次收纳。
    for (const id of ids) {
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

  /** Collect built-in, single-button CUI widgets that fit the quick row. */
  function collectQuickActionCandidates() {
    const CUI = win.CustomizableUI;
    const candidates = new Map();
    if (!CUI) return [];

    const add = (widget, requestedId = null) => {
      const id = requestedId || widget?.id;
      if (
        !id ||
        candidates.has(id) ||
        QUICK_ACTION_EXCLUDED_IDS.has(id) ||
        /-browser-action$/i.test(id)
      ) {
        return;
      }

      let node = null;
      try {
        node = widget?.forWindow?.(win)?.node || findWidgetNode(id);
      } catch (_) {}

      const isDefault = DEFAULT_QUICK_ACTION_IDS.includes(id);
      if (!isDefault) {
        if (widget?.webExtension || isAiJunk(node)) return;
        if (widget?.provider === CUI.PROVIDER_API) {
          if (widget.source && widget.source !== CUI.SOURCE_BUILTIN) return;
          if (widget.type !== "button" && widget.type !== "view") return;
        } else if (!node || node.localName !== "toolbarbutton") {
          return;
        }
      }

      const label =
        QUICK_ACTION_LABELS[id] ||
        widget?.label ||
        node?.getAttribute?.("label") ||
        node?.getAttribute?.("tooltiptext") ||
        id;
      candidates.set(id, { id, label: String(label) });
    };

    for (const id of KNOWN_NATIVE_QUICK_ACTION_IDS) {
      try {
        add(CUI.getWidget?.(id), id);
      } catch (_) {}
    }

    try {
      for (const widget of CUI.getUnusedWidgets?.(win.gNavToolbox?.palette) || []) {
        add(widget);
      }
    } catch (error) {
      log("collect unused widgets", error);
    }

    try {
      for (const id of CUI.getWidgetIdsInArea?.(CUI.AREA_NAVBAR || "nav-bar") || []) {
        add(CUI.getWidget?.(id), id);
      }
    } catch (error) {
      log("collect navbar widgets", error);
    }

    for (const id of readQuickActionIds()) {
      if (!candidates.has(id)) {
        candidates.set(id, { id, label: QUICK_ACTION_LABELS[id] || id });
      }
    }
    return Array.from(candidates.values());
  }

  function createHtml(tag, className = "") {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (className) node.className = className;
    return node;
  }

  function makeSettingsButton(label, action, title = "") {
    const button = createHtml("button", "uc-zenfox-settings-button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    if (title) button.title = title;
    return button;
  }

  /** Render the sortable enabled list and the filtered available list. */
  function renderQuickActionSettings(overlay) {
    const enabledList = overlay.querySelector("#uc-zenfox-enabled-actions");
    const availableList = overlay.querySelector("#uc-zenfox-available-actions");
    if (!enabledList || !availableList) return;

    enabledList.replaceChildren();
    availableList.replaceChildren();
    const enabledIds = overlay.__ucEnabledIds || [];
    const candidateMap = new Map(
      (overlay.__ucCandidates || []).map((item) => [item.id, item])
    );

    const createRow = (item, enabled, index = -1) => {
      const row = createHtml("div", "uc-zenfox-settings-row");
      row.dataset.widgetId = item.id;
      row.draggable = enabled;

      const drag = createHtml("span", "uc-zenfox-settings-drag");
      drag.textContent = enabled ? "⋮⋮" : "+";
      drag.title = enabled ? TEXT.dragSort : TEXT.canAdd;

      const text = createHtml("span", "uc-zenfox-settings-row-text");
      const label = createHtml("strong");
      label.textContent = item.label;
      const id = createHtml("small");
      id.textContent = item.id;
      text.append(label, id);

      const actions = createHtml("span", "uc-zenfox-settings-row-actions");
      if (enabled) {
        const up = makeSettingsButton("↑", "up", TEXT.moveUp);
        const down = makeSettingsButton("↓", "down", TEXT.moveDown);
        up.disabled = index === 0;
        down.disabled = index === enabledIds.length - 1;
        actions.append(up, down, makeSettingsButton(TEXT.hide, "hide"));
      } else {
        actions.append(makeSettingsButton(TEXT.add, "add"));
      }
      row.append(drag, text, actions);

      if (enabled) {
        row.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("text/plain", item.id);
          event.dataTransfer?.setDragImage?.(row, 12, 12);
          row.classList.add("dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (event) => event.preventDefault());
        row.addEventListener("drop", (event) => {
          event.preventDefault();
          const sourceId = event.dataTransfer?.getData("text/plain");
          const targetId = item.id;
          if (!sourceId || sourceId === targetId) return;
          const next = [...enabledIds];
          const sourceIndex = next.indexOf(sourceId);
          const targetIndex = next.indexOf(targetId);
          if (sourceIndex < 0 || targetIndex < 0) return;
          next.splice(sourceIndex, 1);
          next.splice(targetIndex, 0, sourceId);
          overlay.__ucEnabledIds = next;
          renderQuickActionSettings(overlay);
        });
      }
      return row;
    };

    enabledIds.forEach((id, index) => {
      const item = candidateMap.get(id) || { id, label: id };
      enabledList.appendChild(createRow(item, true, index));
    });
    if (!enabledIds.length) {
      const empty = createHtml("p", "uc-zenfox-settings-empty");
      empty.textContent = TEXT.emptyEnabled;
      enabledList.appendChild(empty);
    }

    const available = (overlay.__ucCandidates || [])
      .filter((item) => !enabledIds.includes(item.id))
      .sort((a, b) => a.label.localeCompare(b.label, IS_ZH ? "zh-CN" : "en"));
    for (const item of available) {
      availableList.appendChild(createRow(item, false));
    }
    if (!available.length) {
      const empty = createHtml("p", "uc-zenfox-settings-empty");
      empty.textContent = TEXT.emptyAvailable;
      availableList.appendChild(empty);
    }
  }

  /** 绘制 Sidebery 外观选项，并标记当前草稿值。 */
  function renderSideberyAppearance(overlay) {
    const view = overlay.querySelector("#uc-zenfox-appearance-view");
    const status = overlay.querySelector("#uc-zenfox-sidebery-status");
    if (!view || !status) return;

    const appearance = overlay.__ucSideberyAppearance;
    const loading = overlay.__ucSideberyLoading;
    const error = overlay.__ucSideberyError;
    const unavailable = !!error && !appearance;
    view.querySelectorAll("button[data-sidebery-field]").forEach((button) => {
      const selected = appearance?.[button.dataset.sideberyField] === button.dataset.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = loading || unavailable;
    });
    view.querySelectorAll("button[data-sidebery-toggle]").forEach((button) => {
      const field = button.dataset.sideberyToggle;
      const enabled = !!appearance?.[`${field}Enabled`];
      button.classList.toggle("selected", enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? TEXT.enabled : TEXT.disabled;
      button.disabled = loading || unavailable;
    });
    view.querySelectorAll("input[data-sidebery-color-text]").forEach((input) => {
      const field = input.dataset.sideberyColorText;
      if (doc.activeElement !== input) input.value = appearance?.[field] || "";
      input.disabled = loading || unavailable || !appearance?.[`${field}Enabled`];
    });
    view.querySelectorAll("input[data-sidebery-color-picker]").forEach((input) => {
      const field = input.dataset.sideberyColorPicker;
      input.value = toColorInputValue(appearance?.[field]);
      input.disabled = loading || unavailable || !appearance?.[`${field}Enabled`];
    });
    status.textContent = loading
      ? TEXT.sideberyLoading
      : error
        ? unavailable
          ? TEXT.sideberyUnavailable
          : String(error.message || error)
        : "";
    status.classList.toggle("error", !!error);
  }

  /** 切换设置标签，不丢弃当前未应用的草稿。 */
  function selectSettingsTab(overlay, tab) {
    overlay.__ucActiveTab = tab === "appearance" ? "appearance" : "quick-actions";
    overlay.querySelectorAll("button[data-settings-tab]").forEach((button) => {
      const selected = button.dataset.settingsTab === overlay.__ucActiveTab;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    overlay.querySelectorAll("[data-settings-view]").forEach((view) => {
      view.hidden = view.dataset.settingsView !== overlay.__ucActiveTab;
    });
  }

  function makeSideberyOptions(field, values, labels) {
    const group = createHtml("div", "uc-zenfox-settings-options");
    group.setAttribute("role", "group");
    values.forEach((value, index) => {
      const button = makeSettingsButton(labels[index], "");
      button.removeAttribute("data-action");
      button.dataset.sideberyField = field;
      button.dataset.value = value;
      button.setAttribute("aria-pressed", "false");
      group.appendChild(button);
    });
    return group;
  }

  function toColorInputValue(value) {
    const text = String(value || "").trim();
    const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text);
    if (hex) return `#${hex[1].toLowerCase()}`;
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(text);
    if (!rgb) return "#000000";
    return `#${rgb
      .slice(1, 4)
      .map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function makeSideberyColorRow(label, field) {
    const row = createHtml("div", "uc-zenfox-appearance-row");
    const title = createHtml("strong");
    title.textContent = label;
    const controls = createHtml("div", "uc-zenfox-color-controls");
    const picker = createHtml("input", "uc-zenfox-color-picker");
    picker.type = "color";
    picker.dataset.sideberyColorPicker = field;
    const textInput = createHtml("input", "uc-zenfox-color-text");
    textInput.type = "text";
    textInput.spellcheck = false;
    textInput.dataset.sideberyColorText = field;
    const toggle = makeSettingsButton(TEXT.disabled, "");
    toggle.removeAttribute("data-action");
    toggle.dataset.sideberyToggle = field;
    controls.append(picker, textInput, toggle);
    row.append(title, controls);
    return row;
  }

  /** Build the in-window settings overlay once and reuse it. */
  function ensureQuickActionSettingsOverlay() {
    let overlay = $("uc-zenfox-settings-overlay");
    if (overlay) return overlay;

    overlay = createHtml("div", "uc-zenfox-settings-overlay");
    overlay.id = "uc-zenfox-settings-overlay";
    overlay.hidden = true;

    const panel = createHtml("section", "uc-zenfox-settings-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "uc-zenfox-settings-title");

    const header = createHtml("header", "uc-zenfox-settings-header");
    const heading = createHtml("div");
    const title = createHtml("h2");
    title.id = "uc-zenfox-settings-title";
    title.textContent = TEXT.settings;
    const subtitle = createHtml("p");
    subtitle.textContent = TEXT.subtitle;
    heading.append(title, subtitle);
    const close = makeSettingsButton("×", "close", TEXT.close);
    close.classList.add("uc-zenfox-settings-close");
    header.append(heading, close);

    const tabs = createHtml("nav", "uc-zenfox-settings-tabs");
    tabs.setAttribute("role", "tablist");
    const quickTab = makeSettingsButton(TEXT.quickActions, "");
    quickTab.removeAttribute("data-action");
    quickTab.dataset.settingsTab = "quick-actions";
    quickTab.setAttribute("role", "tab");
    const appearanceTab = makeSettingsButton(TEXT.appearance, "");
    appearanceTab.removeAttribute("data-action");
    appearanceTab.dataset.settingsTab = "appearance";
    appearanceTab.setAttribute("role", "tab");
    tabs.append(quickTab, appearanceTab);

    const body = createHtml("div", "uc-zenfox-settings-body");
    const quickView = createHtml("div", "uc-zenfox-settings-view");
    quickView.dataset.settingsView = "quick-actions";
    const enabledSection = createHtml("section");
    const enabledTitle = createHtml("h3");
    enabledTitle.textContent = TEXT.enabled;
    const enabledList = createHtml("div", "uc-zenfox-settings-list");
    enabledList.id = "uc-zenfox-enabled-actions";
    enabledSection.append(enabledTitle, enabledList);

    const availableSection = createHtml("section");
    const availableTitle = createHtml("h3");
    availableTitle.textContent = TEXT.available;
    const availableList = createHtml("div", "uc-zenfox-settings-list");
    availableList.id = "uc-zenfox-available-actions";
    availableSection.append(availableTitle, availableList);
    quickView.append(enabledSection, availableSection);

    const appearanceView = createHtml("div", "uc-zenfox-settings-view uc-zenfox-appearance-view");
    appearanceView.id = "uc-zenfox-appearance-view";
    appearanceView.dataset.settingsView = "appearance";
    const sideberyTitle = createHtml("h3");
    sideberyTitle.textContent = TEXT.sidebery;
    const fontRow = createHtml("div", "uc-zenfox-appearance-row");
    const fontLabel = createHtml("strong");
    fontLabel.textContent = TEXT.fontSize;
    fontRow.append(
      fontLabel,
      makeSideberyOptions("fontSize", SIDEBERY_FONT_SIZES, SIDEBERY_FONT_SIZES.map((value) => value.toUpperCase()))
    );
    const densityRow = createHtml("div", "uc-zenfox-appearance-row");
    const densityLabel = createHtml("strong");
    densityLabel.textContent = TEXT.density;
    densityRow.append(
      densityLabel,
      makeSideberyOptions("density", SIDEBERY_DENSITIES, [
        TEXT.densityCompact,
        TEXT.densityDefault,
        TEXT.densityLoose,
      ])
    );
    const activeForegroundRow = makeSideberyColorRow(
      TEXT.activatedForeground,
      "activeForeground"
    );
    const activeBackgroundRow = makeSideberyColorRow(
      TEXT.activatedBackground,
      "activeBackground"
    );
    const sideberyStatus = createHtml("p", "uc-zenfox-sidebery-status");
    sideberyStatus.id = "uc-zenfox-sidebery-status";
    appearanceView.append(
      sideberyTitle,
      fontRow,
      densityRow,
      activeForegroundRow,
      activeBackgroundRow,
      sideberyStatus
    );
    body.append(quickView, appearanceView);

    const footer = createHtml("footer", "uc-zenfox-settings-footer");
    footer.append(
      makeSettingsButton(TEXT.reset, "reset"),
      makeSettingsButton(TEXT.cancel, "close"),
      makeSettingsButton(TEXT.apply, "apply")
    );
    footer.lastElementChild?.classList.add("primary");
    panel.append(header, tabs, body, footer);
    overlay.appendChild(panel);
    doc.documentElement.appendChild(overlay);

    overlay.addEventListener("click", async (event) => {
      if (event.target === overlay) {
        overlay.hidden = true;
        return;
      }

      const tabButton = event.target.closest?.("button[data-settings-tab]");
      if (tabButton) {
        selectSettingsTab(overlay, tabButton.dataset.settingsTab);
        return;
      }

      const sideberyButton = event.target.closest?.("button[data-sidebery-field]");
      if (sideberyButton && overlay.__ucSideberyAppearance) {
        overlay.__ucSideberyError = null;
        overlay.__ucSideberyAppearance = {
          ...overlay.__ucSideberyAppearance,
          [sideberyButton.dataset.sideberyField]: sideberyButton.dataset.value,
        };
        renderSideberyAppearance(overlay);
        return;
      }

      const toggleButton = event.target.closest?.("button[data-sidebery-toggle]");
      if (toggleButton && overlay.__ucSideberyAppearance) {
        overlay.__ucSideberyError = null;
        const field = toggleButton.dataset.sideberyToggle;
        overlay.__ucSideberyAppearance = {
          ...overlay.__ucSideberyAppearance,
          [`${field}Enabled`]: !overlay.__ucSideberyAppearance[`${field}Enabled`],
        };
        renderSideberyAppearance(overlay);
        return;
      }

      const button = event.target.closest?.("button[data-action]");
      if (!button) return;
      const row = button.closest(".uc-zenfox-settings-row");
      const id = row?.dataset?.widgetId;
      const ids = [...(overlay.__ucEnabledIds || [])];
      const index = id ? ids.indexOf(id) : -1;

      switch (button.dataset.action) {
        case "up":
          if (index > 0) [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
          break;
        case "down":
          if (index >= 0 && index < ids.length - 1)
            [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
          break;
        case "hide":
          if (index >= 0) ids.splice(index, 1);
          break;
        case "add":
          if (id && !ids.includes(id)) ids.push(id);
          break;
        case "reset":
          if (overlay.__ucActiveTab === "appearance") {
            overlay.__ucSideberyAppearance = {
              fontSize: "m",
              density: "default",
              activeForegroundEnabled: false,
              activeForeground: "rgb(255,255,255)",
              activeBackgroundEnabled: false,
              activeBackground: "#f20006ff",
            };
            renderSideberyAppearance(overlay);
            return;
          }
          overlay.__ucEnabledIds = [...DEFAULT_QUICK_ACTION_IDS];
          renderQuickActionSettings(overlay);
          return;
        case "apply":
          try {
            if (overlay.__ucSideberyAppearance && !overlay.__ucSideberyError) {
              await saveSideberyAppearance(overlay.__ucSideberyAppearance);
            }
            saveQuickActionIds(ids);
            overlay.hidden = true;
            layout("settings");
          } catch (error) {
            overlay.__ucSideberyError = error;
            renderSideberyAppearance(overlay);
            log("save Sidebery appearance", error);
          }
          return;
        case "close":
          overlay.hidden = true;
          return;
        default:
          return;
      }
      overlay.__ucEnabledIds = ids;
      renderQuickActionSettings(overlay);
    });

    overlay.addEventListener("input", (event) => {
      if (!overlay.__ucSideberyAppearance) return;
      const target = event.target;
      const field = target?.dataset?.sideberyColorText || target?.dataset?.sideberyColorPicker;
      if (!field) return;
      overlay.__ucSideberyError = null;
      overlay.__ucSideberyAppearance = {
        ...overlay.__ucSideberyAppearance,
        [field]: target.value,
      };
      renderSideberyAppearance(overlay);
    });

    win.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) overlay.hidden = true;
    });
    return overlay;
  }

  function openQuickActionSettings() {
    const overlay = ensureQuickActionSettingsOverlay();
    overlay.__ucCandidates = collectQuickActionCandidates();
    overlay.__ucEnabledIds = readQuickActionIds();
    overlay.__ucSideberyAppearance = null;
    overlay.__ucSideberyError = null;
    overlay.__ucSideberyLoading = true;
    renderQuickActionSettings(overlay);
    renderSideberyAppearance(overlay);
    selectSettingsTab(overlay, "quick-actions");
    overlay.hidden = false;
    overlay.querySelector(".uc-zenfox-settings-close")?.focus();

    readSideberyAppearance()
      .then((appearance) => {
        overlay.__ucSideberyAppearance = appearance;
        overlay.__ucSideberyError = null;
      })
      .catch((error) => {
        overlay.__ucSideberyError = error;
        log("read Sidebery appearance", error);
      })
      .finally(() => {
        overlay.__ucSideberyLoading = false;
        renderSideberyAppearance(overlay);
      });
  }

  /**
   * 向独立设置页提供受控的数据接口
   * 保存后刷新所有已打开的 Firefox 窗口
   */
  function registerSettingsPageApi() {
    if (win.ZenFoxSettings) return;

    win.ZenFoxSettings = Object.freeze({
      async read() {
        let appearance = null;
        let appearanceError = "";
        try {
          appearance = await readSideberyAppearance();
        } catch (error) {
          appearanceError = String(error?.message || error);
        }
        return JSON.stringify({
          isZh: IS_ZH,
          candidates: collectQuickActionCandidates(),
          enabledIds: readQuickActionIds(),
          appearance,
          appearanceError,
        });
      },

      async apply(payload) {
        const { enabledIds, appearance } = JSON.parse(String(payload || "{}"));
        const ids = Array.from(
          new Set(
            (Array.isArray(enabledIds) ? enabledIds : []).filter(
              (id) =>
                typeof id === "string" &&
                /^[A-Za-z0-9_{}@.+-]+$/.test(id) &&
                !QUICK_ACTION_EXCLUDED_IDS.has(id) &&
                !/-browser-action$/i.test(id)
            )
          )
        );
        if (appearance) await saveSideberyAppearance(appearance);
        saveQuickActionIds(ids);

        const windows = ServicesApi?.wm?.getEnumerator("navigator:browser");
        while (windows?.hasMoreElements()) {
          windows.getNext()?.ZenFoxSettings?.refresh?.();
        }
      },

      refresh() {
        layout("settings-page");
      },
    });
  }

  /** 构造只含界面数据的设置页地址。 */
  async function buildSettingsPageUrl(result = null) {
    const state = JSON.parse(await win.ZenFoxSettings.read());
    return `${SETTINGS_URL}#data=${encodeURIComponent(JSON.stringify({ state, result }))}`;
  }

  /** 用系统权限向设置页回传最新配置和保存结果。 */
  async function loadSettingsPageState(browser, result = null) {
    const url = await buildSettingsPageUrl(result);
    browser.loadURI(url, {
      triggeringPrincipal: ServicesApi?.scriptSecurityManager?.getSystemPrincipal(),
    });
  }

  /**
   * 监听设置页提交的地址片段
   * 页面不接触 ChromeUtils，所有配置读写留在浏览器外壳
   */
  function registerSettingsPageBridge() {
    const browser = win.gBrowser;
    if (!browser || win.__zenfoxSettingsBridge) return;

    const listener = {
      onLocationChange(linkedBrowser, _webProgress, _request, location) {
        const spec = location?.spec || "";
        const prefix = `${SETTINGS_URL}#apply=`;
        if (!spec.startsWith(prefix) || linkedBrowser.__zenfoxApplyingSettings) return;

        linkedBrowser.__zenfoxApplyingSettings = true;
        const payload = spec.slice(prefix.length);
        Promise.resolve()
          .then(() => win.ZenFoxSettings.apply(decodeURIComponent(payload)))
          .then(() => loadSettingsPageState(linkedBrowser, { ok: true }))
          .catch((error) =>
            loadSettingsPageState(linkedBrowser, {
              ok: false,
              message: String(error?.message || error),
            })
          )
          .catch((error) => log("reload settings page", error))
          .finally(() => {
            linkedBrowser.__zenfoxApplyingSettings = false;
          });
      },
    };

    browser.addTabsProgressListener(listener);
    win.__zenfoxSettingsBridge = listener;
    win.addEventListener(
      "unload",
      () => {
        try {
          browser.removeTabsProgressListener(listener);
        } catch (_) {}
      },
      { once: true }
    );
  }

  /** 打开已有设置标签，未打开时创建受信任标签。 */
  async function openSettingsPage() {
    const browser = win.gBrowser;
    if (!browser) return;

    const existing = Array.from(browser.tabs || []).find(
      (tab) => tab.linkedBrowser?.currentURI?.spec?.startsWith(SETTINGS_URL)
    );
    if (existing) {
      await loadSettingsPageState(existing.linkedBrowser);
      browser.selectedTab = existing;
      return;
    }

    const url = await buildSettingsPageUrl();
    const tab = browser.addTrustedTab
      ? browser.addTrustedTab(url)
      : browser.addTab(url, {
          triggeringPrincipal: ServicesApi?.scriptSecurityManager?.getSystemPrincipal(),
        });
    browser.selectedTab = tab;
  }

  /** Add the ZenFox entry to Firefox's native toolbar context menu. */
  function ensureSettingsMenu() {
    const menu = $("toolbar-context-menu");
    if (!menu || $("uc-zenfox-settings-menuitem")) return;

    const separator = doc.createXULElement("menuseparator");
    separator.id = "uc-zenfox-settings-separator";
    const item = doc.createXULElement("menuitem");
    item.id = "uc-zenfox-settings-menuitem";
    item.setAttribute("label", TEXT.settings);
    item.addEventListener("command", openSettingsPage);

    const anchor = $("toolbar-context-customize");
    menu.insertBefore(separator, anchor || null);
    menu.insertBefore(item, anchor || null);
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
    let hiddenActions = $("uc-left-hidden-actions");
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
    if (!hiddenActions) {
      hiddenActions = makeBox("uc-left-hidden-actions", false);
      host.appendChild(hiddenActions);
    }

    // 2) Row1 — window and navigation controls only.
    const r1nodes = [
      findLights(nav),
      findWidgetNode("fxa-toolbar-menu-button"),
      $("PanelUI-button"),
      $("back-button"),
      $("forward-button"),
      $("stop-reload-button") || $("reload-button"),
    ];
    for (const n of r1nodes) {
      if (move(row1, n)) {
        resetToolbarGeom(n);
      }
    }

    // 3) Quick row — configured native actions in the persisted order.
    const quickActionIds = readQuickActionIds();
    ensureQuickActionsPlaced(quickActionIds);
    for (const node of Array.from(quickRow.children)) {
      if (!quickActionIds.includes(node.id || "")) move(hiddenActions, node);
    }
    for (const id of quickActionIds) {
      const node = findWidgetNode(id);
      if (!node) continue;
      try {
        // 重新追加同一父容器中的节点，让保存后的顺序立即生效。
        quickRow.appendChild(node);
      } catch (error) {
        log("order quick action", id, error);
        continue;
      }
      lightGeom(node);
    }

    ensureSettingsMenu();

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
    registerSettingsPageApi();
    registerSettingsPageBridge();

    const boot = () => {
      layout("boot");
      watchSidebar();
      bindTabSync();
      ensureSideberySidebar();
      root.setAttribute("uc-left-chrome", "ready");
      logAlways("ready v0.5.33 (bridged ZenFox settings tab; Sidebery selected)");
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
