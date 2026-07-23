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
  const currentTarget = getActionRow(rowName);
  const currentIndex = currentTarget.indexOf(id);
  const adjustedIndex =
    index !== null && currentIndex >= 0 && currentIndex < index ? index - 1 : index;
  row1Ids = row1Ids.filter((item) => item !== id);
  row2Ids = row2Ids.filter((item) => item !== id);
  const target = getActionRow(rowName);
  const insertAt =
    adjustedIndex === null
      ? target.length
      : Math.max(0, Math.min(adjustedIndex, target.length));
  target.splice(insertAt, 0, id);
  markDirty();
  renderQuickActions();
}

/** 绘制第一行、第二行和可添加按钮，支持跨行拖拽。 */
function renderQuickActions() {
  const row1List = document.querySelector("#row1-actions");
  const row2List = document.querySelector("#row2-actions");
  const availableList = document.querySelector("#available-actions");
  row1List.replaceChildren();
  row2List.replaceChildren();
  availableList.replaceChildren();
  const candidateMap = new Map(candidates.map((item) => [item.id, item]));

  const createRow = (item, rowName = "", index = -1) => {
    const enabled = rowName === "row1" || rowName === "row2";
    const rowIds = enabled ? getActionRow(rowName) : [];
    const row = document.createElement("div");
    row.className = "settings-row";
    row.dataset.widgetId = item.id;
    if (enabled) row.dataset.actionRow = rowName;
    row.draggable = enabled;

    const handle = document.createElement("span");
    handle.className = "row-handle";
    handle.title = enabled ? TEXT.dragSort : TEXT.canAdd;
    if (item.icon) {
      const icon = document.createElement("img");
      icon.className = "row-icon";
      icon.src = item.icon;
      icon.alt = "";
      icon.addEventListener(
        "error",
        () => handle.replaceChildren(enabled ? "⋮⋮" : "+"),
        { once: true }
      );
      handle.append(icon);
    } else {
      handle.textContent = enabled ? "⋮⋮" : "+";
    }

    const text = document.createElement("span");
    text.className = "row-text";
    const label = document.createElement("strong");
    label.textContent = item.label;
    const id = document.createElement("small");
    id.textContent = item.id;
    text.append(label, id);

    const actions = document.createElement("span");
    actions.className = "row-actions";
    if (enabled) {
      const up = makeButton("↑", "up", TEXT.moveUp);
      const down = makeButton("↓", "down", TEXT.moveDown);
      const other = makeButton("⇄", "other-row", TEXT.moveOtherRow);
      up.disabled = index === 0;
      down.disabled = index === rowIds.length - 1;
      actions.append(up, down, other, makeButton(TEXT.hide, "hide"));
    } else {
      actions.append(
        makeButton(TEXT.row1, "add-row1"),
        makeButton(TEXT.row2, "add-row2")
      );
    }
    row.append(handle, text, actions);

    if (enabled) {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", item.id);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceId = event.dataTransfer?.getData("text/plain");
        if (!sourceId || sourceId === item.id) return;
        moveActionToRow(sourceId, rowName, getActionRow(rowName).indexOf(item.id));
      });
    }
    return row;
  };

  const renderEnabledRow = (list, ids, rowName, emptyText) => {
    ids.forEach((id, index) => {
      list.append(createRow(candidateMap.get(id) || { id, label: id }, rowName, index));
    });
    if (!ids.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      list.append(empty);
    }
  };
  renderEnabledRow(row1List, row1Ids, "row1", TEXT.emptyRow1);
  renderEnabledRow(row2List, row2Ids, "row2", TEXT.emptyRow2);

  const enabledIds = new Set([...row1Ids, ...row2Ids]);
  const available = candidates
    .filter((item) => !enabledIds.has(item.id))
    .sort((a, b) => a.label.localeCompare(b.label, IS_ZH ? "zh-CN" : "en"));
  available.forEach((item) => availableList.append(createRow(item)));
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = TEXT.emptyAvailable;
    availableList.append(empty);
  }
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

  const actionButton = event.target.closest?.("[data-action]");
  if (actionButton) {
    const itemRow = actionButton.closest(".settings-row");
    const id = itemRow?.dataset.widgetId;
    const rowName = itemRow?.dataset.actionRow;
    const rowIds = rowName ? getActionRow(rowName) : [];
    const index = rowIds.indexOf(id);
    switch (actionButton.dataset.action) {
      case "up":
        if (index > 0) [rowIds[index - 1], rowIds[index]] = [rowIds[index], rowIds[index - 1]];
        break;
      case "down":
        if (index >= 0 && index < rowIds.length - 1)
          [rowIds[index], rowIds[index + 1]] = [rowIds[index + 1], rowIds[index]];
        break;
      case "other-row":
        moveActionToRow(id, rowName === "row1" ? "row2" : "row1");
        return;
      case "hide":
        if (index >= 0) rowIds.splice(index, 1);
        break;
      case "add-row1":
        moveActionToRow(id, "row1");
        return;
      case "add-row2":
        moveActionToRow(id, "row2");
        return;
      default:
        return;
    }
    markDirty();
    renderQuickActions();
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
  document.querySelector("#row1-title").textContent = TEXT.row1;
  document.querySelector("#row2-title").textContent = TEXT.row2;
  document.querySelector("#available-title").textContent = TEXT.available;
  document.querySelector("#reset-button").textContent = TEXT.reset;
  document.querySelector("#apply-button").textContent = TEXT.apply;

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.querySelector("#apply-button").addEventListener("click", applySettings);
  document.querySelectorAll("[data-action-row]").forEach((list) => {
    list.addEventListener("dragover", (event) => event.preventDefault());
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = event.dataTransfer?.getData("text/plain");
      if (id) moveActionToRow(id, list.dataset.actionRow);
    });
  });
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
