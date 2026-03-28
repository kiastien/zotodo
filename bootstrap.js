// --- Bootstrap Functions ---
let rootURI = null
let chromeHandle = null // Stores the chrome registration handle
let zotodoInstance = null
let windowObserverID = null
let useMenuManager = false
const registeredMenuIDs = []
const services = {} // To store Cc and Services if needed
const ADDON_ID = 'zotodov8@zotero.org'
const WINDOW_OBSERVER_NAME = 'Zotodo-window-observer'

function registerMenus() {
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.registerMenu !== 'function') {
    return false
  }

  try {
    const createTaskMenuID = Zotero.MenuManager.registerMenu({
      menuID: 'zotodo-create-task',
      pluginID: ADDON_ID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'menuitem',
          l10nID: 'zotodo-menu-create-task',
          onCommand: () => {
            if (zotodoInstance && typeof zotodoInstance.makeTaskForSelectedItems === 'function') {
              zotodoInstance.makeTaskForSelectedItems()
            }
          },
        },
      ],
    })
    Zotero.debug('Zotodo: registered create task menu via Zotero.MenuManager')

    const preferencesMenuID = Zotero.MenuManager.registerMenu({
      menuID: 'zotodo-preferences',
      pluginID: ADDON_ID,
      target: 'main/menubar/tools',
      menus: [
        {
          menuType: 'menuitem',
          l10nID: 'zotodo-menu-preferences',
          onCommand: () => {
            if (zotodoInstance && typeof zotodoInstance.openPreferenceWindow === 'function') {
              zotodoInstance.openPreferenceWindow()
            }
          },
        },
      ],
    })
    Zotero.debug('Zotodo: registered preferences menu via Zotero.MenuManager')

    registeredMenuIDs.push(createTaskMenuID, preferencesMenuID)
    Zotero.debug('Zotodo: registered menus via Zotero.MenuManager')
    return true
  }
  catch (err) {
    Zotero.logError(`Zotodo: failed to register menus with MenuManager: ${String(err)}`)
    unregisterMenus()
    return false
  }
}

function unregisterMenus() {
  if (!Zotero.MenuManager || typeof Zotero.MenuManager.unregisterMenu !== 'function') {
    registeredMenuIDs.length = 0
    return
  }

  while (registeredMenuIDs.length > 0) {
    const menuID = registeredMenuIDs.pop()
    try {
      Zotero.MenuManager.unregisterMenu(menuID)
    }
    catch (err) {
      Zotero.logError(`Zotodo: failed to unregister menu ${String(menuID)}: ${String(err)}`)
    }
  }
}

const mainWindowObserver = {
  notify: (event, type, ids, extraData) => {
    Zotero.debug(`Zotodo: mainWindowObserver event: ${event}, type: ${type}`)
    if (type === 'window') {
      if (event === 'add') {
        ids.forEach((id) => {
          if (extraData[id] === true) {
            const win = Zotero.getMainWindows().find((w) => w.document.documentElement.id === id)
            if (win) {
              onMainWindowLoad({ window: win })
            }
          }
        })
      }
      else if (event === 'remove') {
        if (extraData) {
          onMainWindowUnload({ window: extraData })
        }
        else if (ids && ids.length > 0) {
          Zotero.debug(`Zotodo: Window removal detected for IDs: ${ids.join(', ')}, but no window object in extraData.`)
        }
      }
    }
  },
}

async function startup({ id, version, resourceURI, rootURI: startupRootURI }, reason) {
  Zotero.debug(`Zotodo: startup ${version}, reason: ${String(reason)}`)

  const addonRootURI = startupRootURI || (resourceURI && resourceURI.spec)
  if (!addonRootURI) {
    throw new Error('Zotodo: startup root URI is missing')
  }
  rootURI = addonRootURI

  services.aomStartup = Cc['@mozilla.org/addons/addon-manager-startup;1'].getService(Ci.amIAddonManagerStartup)

  const manifestURI = Services.io.newURI(`${addonRootURI}manifest.json`)
  Zotero.debug(`Zotodo: Registering chrome with manifest: ${manifestURI.spec}`)

  chromeHandle = services.aomStartup.registerChrome(manifestURI, [
    ['content', 'zotodo', 'content/'],
    ['locale', 'zotodo', 'en-US', 'locale/en-US/'],
    ['skin', 'zotodo', 'default', 'skin/'],
  ])

  zotodoInstance = new Zotodo()
  zotodoInstance.init()
  Zotero.Zotodo = zotodoInstance

  useMenuManager = registerMenus()

  if (!useMenuManager) {
    Zotero.getMainWindows().forEach((win) => onMainWindowLoad({ window: win }))
    windowObserverID = Zotero.Notifier.registerObserver(mainWindowObserver, ['window'], WINDOW_OBSERVER_NAME, true)
  }

  Zotero.debug('Zotodo: startup complete.')
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  Zotero.debug(`Zotodo: shutdown, reason: ${String(reason)}`)

  if (windowObserverID) {
    Zotero.Notifier.unregisterObserver(windowObserverID)
    windowObserverID = null
  }

  if (!useMenuManager) {
    Zotero.getMainWindows().forEach((win) => onMainWindowUnload({ window: win }))
  }

  unregisterMenus()
  useMenuManager = false

  if (zotodoInstance && zotodoInstance.notifierID) {
    Zotero.Notifier.unregisterObserver(zotodoInstance.notifierID)
  }

  if (chromeHandle) {
    chromeHandle.destruct()
    chromeHandle = null
  }

  if (Zotero.Zotodo) {
    Zotero.Zotodo = null
  }
  zotodoInstance = null
  Zotero.debug('Zotodo: shutdown complete.')
}

function install(data, reason) {
  Zotero.debug(`Zotodo: install, reason: ${String(reason)}, data: ${JSON.stringify(data)}`)
}

async function uninstall(data, reason) {
  Zotero.debug(`Zotodo: uninstall, reason: ${String(reason)}`)
}

function onMainWindowLoad({ window }) {
  Zotero.debug(`Zotodo: onMainWindowLoad for window ID ${window.document.documentElement.id}`)
  const doc = window.document
  window.MozXULElement?.insertFTLIfNeeded('zotodo.ftl')

  const itemMenuItem = doc.createXULElement('menuitem')
  itemMenuItem.id = 'zotodo-itemmenu-make-task'
  itemMenuItem.setAttribute('data-l10n-id', 'zotodo-menu-create-task')
  itemMenuItem.addEventListener('command', () => {
    if (zotodoInstance && typeof zotodoInstance.makeTaskForSelectedItems === 'function') {
      zotodoInstance.makeTaskForSelectedItems()
    }
    else {
      Zotero.debug('Zotodo: zotodoInstance or makeTaskForSelectedItems not available.')
    }
  })

  const zoteroItemMenu = doc.getElementById('zotero-itemmenu')
  if (zoteroItemMenu) {
    let sep = doc.getElementById('id-zotodo-separator')
    if (!sep) {
      sep = doc.createXULElement('menuseparator')
      sep.id = 'id-zotodo-separator'
      zoteroItemMenu.appendChild(sep)
    }
    zoteroItemMenu.appendChild(itemMenuItem)
  }
  else {
    Zotero.debug('Zotodo: zotero-itemmenu not found.')
  }

  const toolsMenuItem = doc.createXULElement('menuitem')
  toolsMenuItem.id = 'zotodo-toolsmenu-options'
  toolsMenuItem.setAttribute('data-l10n-id', 'zotodo-menu-preferences')
  toolsMenuItem.addEventListener('command', () => {
    if (zotodoInstance && typeof zotodoInstance.openPreferenceWindow === 'function') {
      zotodoInstance.openPreferenceWindow()
    }
    else {
      Zotero.debug('Zotodo: zotodoInstance or openPreferenceWindow not available.')
    }
  })

  const toolsMenu = doc.getElementById('menu_ToolsPopup')
  if (toolsMenu) {
    toolsMenu.appendChild(toolsMenuItem)
  }
  else {
    Zotero.debug('Zotodo: menu_ToolsPopup not found.')
  }

  zotodoInstance?.onWindowLoad(window)
}

function onMainWindowUnload({ window }) {
  Zotero.debug(`Zotodo: onMainWindowUnload for window ID ${window.document.documentElement.id}`)
  const doc = window.document

  doc.getElementById('zotodo-itemmenu-make-task')?.remove()
  doc.getElementById('id-zotodo-separator')?.remove()

  doc.getElementById('zotodo-toolsmenu-options')?.remove()

  zotodoInstance?.onWindowUnload(window)
}

Zotero.debug('Zotodo: zotodo.ts loaded')
