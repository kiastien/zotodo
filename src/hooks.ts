import { config } from "../package.json";
import { Zotodo } from "./zotodo";

function registerMenus(): boolean {
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.registerMenu !== "function") {
    return false;
  }

  try {
    const createTaskMenuID = Zotero.MenuManager.registerMenu({
      menuID: "zotodo-create-task",
      pluginID: config.addonID,
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotodo-menu-create-task",
          onCommand: () => addon.data.zotodo?.makeTaskForSelectedItems(),
        },
      ],
    });

    const preferencesMenuID = Zotero.MenuManager.registerMenu({
      menuID: "zotodo-preferences",
      pluginID: config.addonID,
      target: "main/menubar/tools",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotodo-menu-preferences",
          onCommand: () => addon.data.zotodo?.openPreferenceWindow(),
        },
      ],
    });

    addon.data.registeredMenuIDs.push(createTaskMenuID, preferencesMenuID);
    return true;
  }
  catch (err) {
    Zotero.logError(`Zotodo: failed to register menus with MenuManager: ${String(err)}`);
    unregisterMenus();
    return false;
  }
}

function unregisterMenus(): void {
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.unregisterMenu !== "function") {
    addon.data.registeredMenuIDs = [];
    return;
  }

  while (addon.data.registeredMenuIDs.length > 0) {
    const menuID = addon.data.registeredMenuIDs.pop();
    if (menuID === undefined) {
      continue;
    }
    try {
      Zotero.MenuManager.unregisterMenu(menuID);
    }
    catch (err) {
      Zotero.logError(`Zotodo: failed to unregister menu ${String(menuID)}: ${String(err)}`);
    }
  }
}

function addLegacyMenus(window: Window): void {
  const doc = window.document;

  const itemMenuItem = doc.createXULElement("menuitem");
  itemMenuItem.id = "zotodo-itemmenu-make-task";
  itemMenuItem.setAttribute("data-l10n-id", "zotodo-menu-create-task");
  itemMenuItem.addEventListener("command", () => addon.data.zotodo?.makeTaskForSelectedItems());

  const zoteroItemMenu = doc.getElementById("zotero-itemmenu");
  if (zoteroItemMenu) {
    let sep = doc.getElementById("id-zotodo-separator");
    if (!sep) {
      sep = doc.createXULElement("menuseparator");
      sep.id = "id-zotodo-separator";
      zoteroItemMenu.appendChild(sep);
    }
    zoteroItemMenu.appendChild(itemMenuItem);
  }

  const toolsMenuItem = doc.createXULElement("menuitem");
  toolsMenuItem.id = "zotodo-toolsmenu-options";
  toolsMenuItem.setAttribute("data-l10n-id", "zotodo-menu-preferences");
  toolsMenuItem.addEventListener("command", () => addon.data.zotodo?.openPreferenceWindow());

  const toolsMenu = doc.getElementById("menu_ToolsPopup");
  if (toolsMenu) {
    toolsMenu.appendChild(toolsMenuItem);
  }
}

function removeLegacyMenus(window: Window): void {
  const doc = window.document;
  doc.getElementById("zotodo-itemmenu-make-task")?.remove();
  doc.getElementById("id-zotodo-separator")?.remove();
  doc.getElementById("zotodo-toolsmenu-options")?.remove();
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  addon.data.zotodo = new Zotodo();
  addon.data.zotodo.init();

  addon.data.useMenuManager = registerMenus();

  await Promise.all(Zotero.getMainWindows().map((win: _ZoteroTypes.MainWindow) => onMainWindowLoad(win)));

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  win.MozXULElement?.insertFTLIfNeeded("zotodo-mainWindow.ftl");
  if (!addon.data.useMenuManager) {
    addLegacyMenus(win);
  }
  addon.data.zotodo?.onWindowLoad(win);
}

async function onMainWindowUnload(win: _ZoteroTypes.MainWindow): Promise<void> {
  if (!addon.data.useMenuManager) {
    removeLegacyMenus(win);
  }
  addon.data.zotodo?.onWindowUnload(win);
}

function onShutdown(): void {
  unregisterMenus();

  Zotero.getMainWindows().forEach((win: _ZoteroTypes.MainWindow) => {
    if (!addon.data.useMenuManager) {
      removeLegacyMenus(win);
    }
    addon.data.zotodo?.onWindowUnload(win);
  });

  if (addon.data.zotodo?.notifierID) {
    Zotero.Notifier.unregisterObserver(addon.data.zotodo.notifierID);
  }

  addon.data.alive = false;
  delete (Zotero as any)[config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
