import { config } from "../package.json";
import { Zotodo } from "./zotodo";

function debug(message: string): void {
  Zotero.debug(`Zotodo: ${message}`);
}

function registerMenus(): boolean {
  debug("Attempting to register menus with MenuManager");
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.registerMenu !== "function") {
    debug("MenuManager API not available; falling back to legacy menus");
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
    debug(`Registered MenuManager menus: ${String(createTaskMenuID)}, ${String(preferencesMenuID)}`);
    return true;
  }
  catch (err) {
    Zotero.logError(`Zotodo: failed to register menus with MenuManager: ${String(err)}`);
    unregisterMenus();
    return false;
  }
}

function unregisterMenus(): void {
  debug("Unregistering all tracked MenuManager menus");
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.unregisterMenu !== "function") {
    debug("MenuManager unregister API unavailable; clearing tracked IDs only");
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
      debug(`Unregistered menu ID: ${String(menuID)}`);
    }
    catch (err) {
      Zotero.logError(`Zotodo: failed to unregister menu ${String(menuID)}: ${String(err)}`);
    }
  }
}

function addLegacyMenus(window: Window): void {
  debug("Adding legacy XUL menus to main window");
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
  debug("Removing legacy XUL menus from main window");
  const doc = window.document;
  doc.getElementById("zotodo-itemmenu-make-task")?.remove();
  doc.getElementById("id-zotodo-separator")?.remove();
  doc.getElementById("zotodo-toolsmenu-options")?.remove();
}

async function onStartup() {
  debug("onStartup called; waiting for Zotero initialization promises");
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  debug("Zotero initialization promises resolved");

  addon.data.zotodo = new Zotodo();
  debug("Created Zotodo instance");
  addon.data.zotodo.init();
  debug("Initialized Zotodo instance");

  if (Zotero.PreferencePanes) {
    const paneID = await Zotero.PreferencePanes.register({
      pluginID: config.addonID,
      src: rootURI + "content/options.xhtml",
      label: config.addonName,
      defaultXUL: true,
    });
    addon.data.preferencesPaneID = paneID;
    debug(`Registered preferences pane: ${paneID}`);
  }

  addon.data.useMenuManager = registerMenus();
  debug(`Menu mode: ${addon.data.useMenuManager ? "MenuManager" : "legacy XUL"}`);

  await Promise.all(Zotero.getMainWindows().map((win: _ZoteroTypes.MainWindow) => onMainWindowLoad(win)));
  debug("Main-window load hooks completed for all open windows");

  addon.data.initialized = true;
  debug("Addon startup complete; initialized=true");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  debug("onMainWindowLoad called");
  win.MozXULElement?.insertFTLIfNeeded("zotodo-mainWindow.ftl");
  if (!addon.data.useMenuManager) {
    addLegacyMenus(win);
  }
  addon.data.zotodo?.onWindowLoad(win);
  debug("onMainWindowLoad completed");
}

async function onMainWindowUnload(win: _ZoteroTypes.MainWindow): Promise<void> {
  debug("onMainWindowUnload called");
  if (!addon.data.useMenuManager) {
    removeLegacyMenus(win);
  }
  addon.data.zotodo?.onWindowUnload(win);
  debug("onMainWindowUnload completed");
}

function onShutdown(): void {
  debug("onShutdown called");
  unregisterMenus();

  Zotero.getMainWindows().forEach((win: _ZoteroTypes.MainWindow) => {
    if (!addon.data.useMenuManager) {
      removeLegacyMenus(win);
    }
    addon.data.zotodo?.onWindowUnload(win);
  });

  if (addon.data.zotodo?.notifierID) {
    Zotero.Notifier.unregisterObserver(addon.data.zotodo.notifierID);
    debug(`Notifier unregistered: ${String(addon.data.zotodo.notifierID)}`);
  }

  addon.data.alive = false;
  delete (Zotero as any)[config.addonInstance];
  debug("Addon shutdown complete; instance removed from Zotero namespace");
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
