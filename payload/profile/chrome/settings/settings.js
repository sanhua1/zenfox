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
      subtitle: "配置第二行按钮和 Sidebery 外观。",
      quickActions: "第二行按钮",
      appearance: "外观设置",
      shown: "已显示",
      available: "可添加",
      dragSort: "拖拽排序",
      canAdd: "可添加",
      moveUp: "上移",
      moveDown: "下移",
      hide: "隐藏",
      add: "添加",
      emptyShown: "第二行当前为空。",
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
      subtitle: "Configure second-row buttons and Sidebery appearance.",
      quickActions: "Quick Actions",
      appearance: "Appearance",
      shown: "Shown",
      available: "Available",
      dragSort: "Drag to reorder",
      canAdd: "Available to add",
      moveUp: "Move up",
      moveDown: "Move down",
      hide: "Hide",
      add: "Add",
      emptyShown: "The second row is empty.",
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
let enabledIds = [];
let appearance = null;
let appearanceError = "";
let activeTab = "quick-actions";

/** 解析浏览器外壳写入地址片段的配置数据。 */
function readPageData() {
  const prefix = "#data=";
  if (!window.location.hash.startsWith(prefix)) return null;
  return JSON.parse(decodeURIComponent(window.location.hash.slice(prefix.length)));
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
}

/** 绘制第二行按钮列表及拖拽排序。 */
function renderQuickActions() {
  const enabledList = document.querySelector("#enabled-actions");
  const availableList = document.querySelector("#available-actions");
  enabledList.replaceChildren();
  availableList.replaceChildren();
  const candidateMap = new Map(candidates.map((item) => [item.id, item]));

  const createRow = (item, enabled, index = -1) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.dataset.widgetId = item.id;
    row.draggable = enabled;

    const handle = document.createElement("span");
    handle.className = "row-handle";
    handle.textContent = enabled ? "⋮⋮" : "+";
    handle.title = enabled ? TEXT.dragSort : TEXT.canAdd;

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
      up.disabled = index === 0;
      down.disabled = index === enabledIds.length - 1;
      actions.append(up, down, makeButton(TEXT.hide, "hide"));
    } else {
      actions.append(makeButton(TEXT.add, "add"));
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
        const sourceId = event.dataTransfer?.getData("text/plain");
        const sourceIndex = enabledIds.indexOf(sourceId);
        const targetIndex = enabledIds.indexOf(item.id);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
        enabledIds.splice(sourceIndex, 1);
        enabledIds.splice(targetIndex, 0, sourceId);
        markDirty();
        renderQuickActions();
      });
    }
    return row;
  };

  enabledIds.forEach((id, index) => {
    enabledList.append(createRow(candidateMap.get(id) || { id, label: id }, true, index));
  });
  if (!enabledIds.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = TEXT.emptyShown;
    enabledList.append(empty);
  }

  const available = candidates
    .filter((item) => !enabledIds.includes(item.id))
    .sort((a, b) => a.label.localeCompare(b.label, IS_ZH ? "zh-CN" : "en"));
  available.forEach((item) => availableList.append(createRow(item, false)));
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
  const toggle = makeButton(appearance?.[`${field}Enabled`] ? TEXT.on : TEXT.off, "");
  toggle.dataset.appearanceToggle = field;
  toggle.classList.toggle("selected", !!appearance?.[`${field}Enabled`]);
  const disabled = !appearance || !appearance[`${field}Enabled`];
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
    const id = actionButton.closest(".settings-row")?.dataset.widgetId;
    const index = enabledIds.indexOf(id);
    switch (actionButton.dataset.action) {
      case "up":
        if (index > 0) [enabledIds[index - 1], enabledIds[index]] = [enabledIds[index], enabledIds[index - 1]];
        break;
      case "down":
        if (index >= 0 && index < enabledIds.length - 1) [enabledIds[index], enabledIds[index + 1]] = [enabledIds[index + 1], enabledIds[index]];
        break;
      case "hide":
        if (index >= 0) enabledIds.splice(index, 1);
        break;
      case "add":
        if (id && !enabledIds.includes(id)) enabledIds.push(id);
        break;
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
      enabledIds = [...DEFAULT_QUICK_ACTION_IDS];
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
    JSON.stringify({ enabledIds, appearance })
  )}`;
}

/** 写入本地化文本并加载当前配置。 */
async function init() {
  document.documentElement.lang = IS_ZH ? "zh-CN" : "en";
  document.title = TEXT.title;
  document.querySelector("#page-title").textContent = TEXT.title;
  document.querySelector("#page-subtitle").textContent = TEXT.subtitle;
  document.querySelector('[data-settings-tab="quick-actions"]').textContent = TEXT.quickActions;
  document.querySelector('[data-settings-tab="appearance"]').textContent = TEXT.appearance;
  document.querySelector("#enabled-title").textContent = TEXT.shown;
  document.querySelector("#available-title").textContent = TEXT.available;
  document.querySelector("#reset-button").textContent = TEXT.reset;
  document.querySelector("#apply-button").textContent = TEXT.apply;

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.querySelector("#apply-button").addEventListener("click", applySettings);
  selectTab("quick-actions");

  const pageData = INITIAL_PAGE_DATA;
  if (!pageData?.state) {
    const status = document.querySelector("#save-status");
    status.textContent = TEXT.stateUnavailable;
    status.classList.add("error");
    document.querySelector("#apply-button").disabled = true;
    return;
  }

  const { state, result } = pageData;
  candidates = Array.from(state.candidates || [], (item) => ({ id: item.id, label: item.label }));
  enabledIds = Array.from(state.enabledIds || []);
  appearance = state.appearance ? { ...state.appearance } : null;
  appearanceError = state.appearanceError || "";
  renderQuickActions();
  renderAppearance();
  if (result?.ok) {
    document.querySelector("#save-status").textContent = TEXT.saved;
  } else if (result && !result.ok) {
    const status = document.querySelector("#save-status");
    status.textContent = `${TEXT.saveFailed}${result.message || ""}`;
    status.classList.add("error");
  }
}

init().catch((error) => {
  const status = document.querySelector("#save-status");
  status.textContent = `${TEXT.saveFailed}${String(error?.message || error)}`;
  status.classList.add("error");
});
