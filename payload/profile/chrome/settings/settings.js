"use strict";

const DEFAULT_QUICK_ACTION_IDS = [
  "unified-extensions-button",
  "downloads-button",
  "bookmarks-menu-button",
  "history-panelmenu",
  "logins-button",
  "developer-button",
  "preferences-button",
];
const DEFAULT_ROW1_ACTION_IDS = [
  "fxa-toolbar-menu-button",
  "PanelUI-button",
  "back-button",
  "forward-button",
  "stop-reload-button",
];
const DEFAULT_APPEARANCE = {
  fontSize: "m",
  density: "default",
  sideberyBackgroundEnabled: false,
  sideberyBackground: "#1a1a1a",
  normalForegroundEnabled: false,
  normalForeground: "rgb(249,249,250)",
  normalBackgroundEnabled: false,
  normalBackground: "rgba(255,255,255,0.08)",
  activeForegroundEnabled: false,
  activeForeground: "rgb(255,255,255)",
  activeBackgroundEnabled: false,
  activeBackground: "#f20006ff",
};
const FONT_SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"];
const DENSITIES = ["compact", "default", "loose"];

const INITIAL_PAGE_DATA = readPageData();
const IS_ZH =
  typeof INITIAL_PAGE_DATA?.state?.isZh === "boolean"
    ? INITIAL_PAGE_DATA.state.isZh
    : String(navigator.language || "en").toLowerCase().startsWith("zh");
const TEXT = IS_ZH
  ? {
      title: "ZenFox 设置",
      subtitle: "配置前两行按钮和 Sidebery 外观。",
      quickActions: "按钮布局",
      appearance: "外观设置",
      row1: "第一行",
      row2: "第二行",
      available: "可添加",
      previewTitle: "ZenFox 栏预览",
      previewHint: "拖动图标调整位置；三大金刚固定。",
      availableHint: "拖入上方添加，拖回这里隐藏。",
      dragSort: "拖拽排序",
      canAdd: "可添加",
      moveUp: "上移",
      moveDown: "下移",
      moveOtherRow: "移到另一行",
      hide: "隐藏",
      emptyRow1: "第一行当前只有窗口控制组。",
      emptyRow2: "第二行当前为空。",
      emptyAvailable: "没有其他可添加的原生单按钮。",
      reset: "恢复默认",
      apply: "应用",
      saved: "设置已应用。",
      saveFailed: "保存失败：",
      fontSize: "字体大小",
      density: "排列方式",
      compact: "紧凑",
      normal: "默认",
      loose: "宽松",
      foreground: "激活项前景色",
      background: "激活项背景色",
      sideberyBackground: "Sidebery 背景色",
      normalForeground: "标签前景色",
      normalBackground: "标签背景色",
      on: "打开",
      off: "关闭",
      sideberyUnavailable: "无法读取 Sidebery 配置。请确认 Sidebery 已启用。",
      stateUnavailable: "无法读取 ZenFox 配置。请关闭此标签页并重新打开。",
    }
  : {
      title: "ZenFox Settings",
      subtitle: "Configure the first two button rows and Sidebery appearance.",
      quickActions: "Button Layout",
      appearance: "Appearance",
      row1: "First row",
      row2: "Second row",
      available: "Available",
      previewTitle: "ZenFox Toolbar Preview",
      previewHint: "Drag icons to arrange them. Window controls stay fixed.",
      availableHint: "Drag upward to add; drag back here to hide.",
      dragSort: "Drag to reorder",
      canAdd: "Available to add",
      moveUp: "Move up",
      moveDown: "Move down",
      moveOtherRow: "Move to other row",
      hide: "Hide",
      emptyRow1: "Only the window controls are in the first row.",
      emptyRow2: "The second row is empty.",
      emptyAvailable: "No other native single-button widgets are available.",
      reset: "Restore defaults",
      apply: "Apply",
      saved: "Settings applied.",
      saveFailed: "Save failed: ",
      fontSize: "Font size",
      density: "Density",
      compact: "Compact",
      normal: "Default",
      loose: "Relaxed",
      foreground: "Activated foreground",
      background: "Activated background",
      sideberyBackground: "Sidebery background",
      normalForeground: "Tab foreground",
      normalBackground: "Tab background",
      on: "On",
      off: "Off",
      sideberyUnavailable: "Unable to read Sidebery settings. Make sure Sidebery is enabled.",
      stateUnavailable: "Unable to read ZenFox settings. Close this tab and open it again.",
    };

let candidates = [];
let row1Ids = [];
let row2Ids = [];
let appearance = null;
let appearanceError = "";
let activeTab = "quick-actions";
let preview = null;
let dragState = null;

/** 解析浏览器外壳写入地址片段的配置数据。 */
function readPageData() {
  const prefix = "#data=";
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    return JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length)));
  } catch (_) {
    return null;
  }
}

/** 创建统一样式的按钮。 */
function makeButton(label, action, title = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (action) button.dataset.action = action;
  if (title) button.title = title;
  return button;
}

/** 标记草稿已变化，并清除上次保存状态。 */
function markDirty() {
  const status = document.querySelector("#save-status");
  status.textContent = "";
  status.classList.remove("error");
  document.querySelector("#apply-button").disabled = false;
}

/** 返回指定按钮行对应的草稿数组。 */
function getActionRow(rowName) {
  return rowName === "row1" ? row1Ids : row2Ids;
}

/** 把按钮移动到指定行和插入位置，同时保证两行不重复。 */
function moveActionToRow(id, rowName, index = null) {
  if (!id || (rowName !== "row1" && rowName !== "row2")) return;
  row1Ids = row1Ids.filter((item) => item !== id);
  row2Ids = row2Ids.filter((item) => item !== id);
  const target = getActionRow(rowName);
  const insertAt =
    index === null
      ? target.length
      : Math.max(0, Math.min(index, target.length));
  target.splice(insertAt, 0, id);
  markDirty();
  renderQuickActions();
}

/** 创建仿真栏或按钮托盘中的原生按钮。 */
function createToolbarAction(item) {
  const action = document.createElement("button");
  action.type = "button";
  action.className = "toolbar-action";
  action.dataset.widgetId = item.id;
  action.title = item.label;
  action.setAttribute("aria-label", item.label);

  if (item.icon) {
    const icon = document.createElement("img");
    icon.src = item.icon;
    icon.alt = "";
    icon.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("span");
        fallback.className = "toolbar-action-fallback";
        fallback.textContent = "·";
        icon.replaceWith(fallback);
      },
      { once: true }
    );
    action.append(icon);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "toolbar-action-fallback";
    fallback.textContent = "·";
    action.append(fallback);
  }

  const label = document.createElement("span");
  label.className = "toolbar-action-label";
  label.textContent = item.label;
  action.append(label);
  return action;
}

/** 绘制两行 ZenFox 仿真栏和可添加按钮托盘。 */
function renderQuickActions() {
  const row1List = document.querySelector("#row1-actions");
  const row2List = document.querySelector("#row2-actions");
  const availableList = document.querySelector("#available-actions");
  const previewNode = document.querySelector("#toolbar-preview");
  row1List.replaceChildren();
  row2List.replaceChildren();
  availableList.replaceChildren();

  if (previewNode && preview) {
    previewNode.style.setProperty("--preview-width", `${preview.width || 307}px`);
    previewNode.style.setProperty("--preview-background", preview.background || "#1a1a1a");
    previewNode.style.setProperty("--preview-foreground", preview.foreground || "#f9f9fa");
    previewNode.style.setProperty("--preview-border", preview.border || "rgba(255,255,255,.12)");
  }

  const candidateMap = new Map(candidates.map((item) => [item.id, item]));
  const renderRow = (list, ids, emptyText) => {
    ids.forEach((id) => {
      list.append(createToolbarAction(candidateMap.get(id) || { id, label: id }));
    });
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      list.append(empty);
    }
  };
  renderRow(row1List, row1Ids, TEXT.emptyRow1);
  renderRow(row2List, row2Ids, TEXT.emptyRow2);

  const enabledIds = new Set([...row1Ids, ...row2Ids]);
  const available = candidates
    .filter((item) => !enabledIds.has(item.id))
    .sort((a, b) => a.label.localeCompare(b.label, IS_ZH ? "zh-CN" : "en"));
  available.forEach((item) => availableList.append(createToolbarAction(item)));
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = TEXT.emptyAvailable;
    availableList.append(empty);
  }
}

/** 返回放置区域中真正承载按钮的弹性容器。 */
function getDropContainer(zone) {
  if (!zone) return null;
  switch (zone.dataset.dropZone) {
    case "row1":
      return document.querySelector("#row1-actions");
    case "row2":
      return document.querySelector("#row2-actions");
    case "available":
      return document.querySelector("#available-actions");
    default:
      return null;
  }
}

/** 根据指针位置找到占位块应插入的按钮之前。 */
function findDropReference(container, clientX, clientY) {
  const actions = Array.from(container.querySelectorAll(":scope > .toolbar-action"));
  for (const action of actions) {
    const rect = action.getBoundingClientRect();
    if (!container.classList.contains("action-palette")) {
      if (clientX < rect.left + rect.width / 2) return action;
      continue;
    }
    if (clientY < rect.top + rect.height / 2) return action;
    if (clientY <= rect.bottom && clientX < rect.left + rect.width / 2) return action;
  }
  return null;
}

/** 用 FLIP 位移动画让占位块周围的按钮平滑让位。 */
function moveDragPlaceholder(container, reference) {
  if (!dragState || !container) return;
  const actions = Array.from(document.querySelectorAll(".toolbar-action"));
  const before = new Map(actions.map((action) => [action, action.getBoundingClientRect()]));
  container.insertBefore(dragState.placeholder, reference);
  for (const action of actions) {
    if (!action.isConnected) continue;
    const first = before.get(action);
    const last = action.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    if (deltaX || deltaY) {
      action.animate(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
        { duration: 150, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    }
  }
}

/** 开始 Pointer Events 拖拽，并用浮动图标跟随指针。 */
function beginActionDrag(event) {
  if (dragState || event.button !== 0) return;
  const action = event.target.closest?.(".toolbar-action");
  const sourceZoneNode = action?.closest?.("[data-drop-zone]");
  const sourceZone = sourceZoneNode?.dataset.dropZone;
  if (!action || !sourceZone) return;
  event.preventDefault();

  const placeholder = document.createElement("span");
  placeholder.className = "drag-placeholder";
  action.replaceWith(placeholder);
  const ghost = action.cloneNode(true);
  ghost.classList.add("drag-ghost");
  document.body.append(ghost);
  dragState = {
    pointerId: event.pointerId,
    id: action.dataset.widgetId,
    sourceZone,
    placeholder,
    ghost,
    activeZone: sourceZoneNode,
  };
  document.body.classList.add("is-dragging");
  updateActionDrag(event);
}

/** 更新浮动图标、命中区域和实时占位位置。 */
function updateActionDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.ghost.style.left = `${event.clientX}px`;
  dragState.ghost.style.top = `${event.clientY}px`;
  document.querySelectorAll(".drop-active").forEach((node) => node.classList.remove("drop-active"));
  const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-drop-zone]");
  dragState.activeZone = zone || null;
  if (!zone) return;
  zone.classList.add("drop-active");
  const container = getDropContainer(zone);
  const reference = findDropReference(container, event.clientX, event.clientY);
  if (dragState.placeholder.parentNode !== container || dragState.placeholder.nextSibling !== reference) {
    moveDragPlaceholder(container, reference);
  }
}

/** 结束拖拽，把占位位置写回现有双行配置草稿。 */
function finishActionDrag(event, cancelled = false) {
  if (!dragState || (event && event.pointerId !== dragState.pointerId)) return;
  const { id, sourceZone, placeholder, ghost, activeZone } = dragState;
  const targetZone = cancelled ? "" : activeZone?.dataset.dropZone || "";
  const container = placeholder.parentNode;
  const targetIndex = container
    ? Array.from(container.children).filter((node) =>
        node.matches?.(".toolbar-action, .drag-placeholder")
      ).indexOf(placeholder)
    : -1;

  dragState = null;
  ghost.remove();
  document.body.classList.remove("is-dragging");
  document.querySelectorAll(".drop-active").forEach((node) => node.classList.remove("drop-active"));

  if (targetZone === "row1" || targetZone === "row2") {
    moveActionToRow(id, targetZone, Math.max(0, targetIndex));
    return;
  }
  if (targetZone === "available" && sourceZone !== "available") {
    row1Ids = row1Ids.filter((item) => item !== id);
    row2Ids = row2Ids.filter((item) => item !== id);
    markDirty();
  }
  renderQuickActions();
}

/** 将 CSS 颜色转换为颜色选择器接受的十六进制值。 */
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

/** 创建字体大小和排列方式的分段选项。 */
function makeOptions(field, values, labels) {
  const group = document.createElement("div");
  group.className = "segmented";
  values.forEach((value, index) => {
    const button = makeButton(labels[index], "");
    button.dataset.appearanceField = field;
    button.dataset.value = value;
    const selected = appearance?.[field] === value;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = !appearance;
    group.append(button);
  });
  return group;
}

/** 创建 Sidebery 普通选项行。 */
function renderOptionRow(selector, label, field, values, labels) {
  const row = document.querySelector(selector);
  row.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = label;
  row.append(title, makeOptions(field, values, labels));
}

/** 创建 Sidebery 颜色选项行。 */
function renderColorRow(selector, label, field) {
  const row = document.querySelector(selector);
  row.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = label;
  const controls = document.createElement("div");
  controls.className = "color-controls";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.dataset.colorPicker = field;
  picker.value = toColorInputValue(appearance?.[field]);
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.dataset.colorText = field;
  input.value = appearance?.[field] || "";
  const enabled = !!appearance?.[`${field}Enabled`];
  const toggle = makeButton("", "");
  toggle.classList.add("switch-control");
  toggle.dataset.appearanceToggle = field;
  toggle.classList.toggle("selected", enabled);
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", String(enabled));
  toggle.setAttribute("aria-label", `${label}：${enabled ? TEXT.on : TEXT.off}`);
  toggle.title = enabled ? TEXT.on : TEXT.off;
  const disabled = !appearance || !enabled;
  picker.disabled = disabled;
  input.disabled = disabled;
  toggle.disabled = !appearance;
  controls.append(picker, input, toggle);
  row.append(title, controls);
}

/** 绘制 Sidebery 外观草稿和错误状态。 */
function renderAppearance() {
  renderOptionRow("#font-size-row", TEXT.fontSize, "fontSize", FONT_SIZES, FONT_SIZES.map((v) => v.toUpperCase()));
  renderOptionRow("#density-row", TEXT.density, "density", DENSITIES, [TEXT.compact, TEXT.normal, TEXT.loose]);
  renderColorRow("#sidebery-background-row", TEXT.sideberyBackground, "sideberyBackground");
  renderColorRow("#normal-foreground-row", TEXT.normalForeground, "normalForeground");
  renderColorRow("#normal-background-row", TEXT.normalBackground, "normalBackground");
  renderColorRow("#foreground-row", TEXT.foreground, "activeForeground");
  renderColorRow("#background-row", TEXT.background, "activeBackground");

  const status = document.querySelector("#sidebery-status");
  status.textContent = appearanceError ? TEXT.sideberyUnavailable : "";
  status.classList.toggle("error", !!appearanceError);
}

/** 切换设置分类并保留当前草稿。 */
function selectTab(tab) {
  activeTab = tab === "appearance" ? "appearance" : "quick-actions";
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    const selected = button.dataset.settingsTab === activeTab;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-settings-view]").forEach((view) => {
    view.hidden = view.dataset.settingsView !== activeTab;
  });
  document.querySelector("#reset-button").disabled =
    activeTab === "appearance" && !appearance;
}

/** 处理按钮排序、外观选择和恢复默认。 */
function handleClick(event) {
  const tabButton = event.target.closest?.("[data-settings-tab]");
  if (tabButton) {
    selectTab(tabButton.dataset.settingsTab);
    return;
  }

  const appearanceButton = event.target.closest?.("[data-appearance-field]");
  if (appearanceButton && appearance) {
    appearance = { ...appearance, [appearanceButton.dataset.appearanceField]: appearanceButton.dataset.value };
    markDirty();
    renderAppearance();
    return;
  }

  const toggleButton = event.target.closest?.("[data-appearance-toggle]");
  if (toggleButton && appearance) {
    const field = toggleButton.dataset.appearanceToggle;
    appearance = { ...appearance, [`${field}Enabled`]: !appearance[`${field}Enabled`] };
    markDirty();
    renderAppearance();
    return;
  }

  if (event.target.id === "reset-button") {
    if (activeTab === "appearance") {
      appearance = { ...DEFAULT_APPEARANCE };
      appearanceError = "";
      renderAppearance();
    } else {
      row1Ids = [...DEFAULT_ROW1_ACTION_IDS];
      row2Ids = [...DEFAULT_QUICK_ACTION_IDS];
      renderQuickActions();
    }
    markDirty();
  }
}

/** 同步颜色输入框到外观草稿。 */
function handleInput(event) {
  if (!appearance) return;
  const field = event.target.dataset?.colorText || event.target.dataset?.colorPicker;
  if (!field) return;
  appearance = { ...appearance, [field]: event.target.value };
  markDirty();

  if (event.target.dataset.colorPicker) {
    const textInput = document.querySelector(`[data-color-text="${field}"]`);
    if (textInput) textInput.value = event.target.value;
  }
}

/** 把草稿交给浏览器外壳保存。 */
function applySettings() {
  const button = document.querySelector("#apply-button");
  const status = document.querySelector("#save-status");
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "";
  window.location.hash = `apply=${encodeURIComponent(
    JSON.stringify({ row1Ids, row2Ids, appearance, requestId: Date.now() })
  )}`;
}

/** 接收浏览器外壳回传的配置，并恢复可继续编辑的页面状态。 */
function applyPageData(pageData) {
  if (!pageData?.state) return false;

  const { state, result } = pageData;
  candidates = Array.from(state.candidates || [], (item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon || "",
  }));
  row1Ids = Array.from(state.rows?.row1 || DEFAULT_ROW1_ACTION_IDS);
  row2Ids = Array.from(state.rows?.row2 || DEFAULT_QUICK_ACTION_IDS);
  appearance = state.appearance ? { ...state.appearance } : null;
  appearanceError = state.appearanceError || "";
  preview = state.preview ? { ...state.preview } : null;
  renderQuickActions();
  renderAppearance();

  const status = document.querySelector("#save-status");
  status.classList.remove("error");
  status.textContent = "";
  if (result?.ok) {
    status.textContent = TEXT.saved;
  } else if (result && !result.ok) {
    status.textContent = `${TEXT.saveFailed}${result.message || ""}`;
    status.classList.add("error");
  }
  document.querySelector("#apply-button").disabled = false;
  return true;
}

/** 写入本地化文本并加载当前配置。 */
async function init() {
  document.documentElement.lang = IS_ZH ? "zh-CN" : "en";
  document.title = TEXT.title;
  document.querySelector("#page-title").textContent = TEXT.title;
  document.querySelector("#page-subtitle").textContent = TEXT.subtitle;
  document.querySelector('[data-settings-tab="quick-actions"]').textContent = TEXT.quickActions;
  document.querySelector('[data-settings-tab="appearance"]').textContent = TEXT.appearance;
  document.querySelector("#preview-title").textContent = TEXT.previewTitle;
  document.querySelector("#preview-hint").textContent = TEXT.previewHint;
  document.querySelector("#available-title").textContent = TEXT.available;
  document.querySelector("#available-hint").textContent = TEXT.availableHint;
  document.querySelector("#reset-button").textContent = TEXT.reset;
  document.querySelector("#apply-button").textContent = TEXT.apply;

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("pointerdown", beginActionDrag);
  window.addEventListener("pointermove", updateActionDrag);
  window.addEventListener("pointerup", (event) => finishActionDrag(event));
  window.addEventListener("pointercancel", (event) => finishActionDrag(event, true));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dragState) finishActionDrag(null, true);
  });
  document.querySelector("#apply-button").addEventListener("click", applySettings);
  window.addEventListener("hashchange", () => {
    const pageData = readPageData();
    if (pageData) applyPageData(pageData);
  });
  selectTab("quick-actions");

  if (!applyPageData(INITIAL_PAGE_DATA)) {
    const status = document.querySelector("#save-status");
    status.textContent = TEXT.stateUnavailable;
    status.classList.add("error");
    document.querySelector("#apply-button").disabled = true;
    if (window.location.hash) window.location.hash = "";
    return;
  }
}

init().catch((error) => {
  const status = document.querySelector("#save-status");
  status.textContent = `${TEXT.saveFailed}${String(error?.message || error)}`;
  status.classList.add("error");
});
