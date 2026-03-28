var chromeHandle;

function install(data, reason) {}

async function startup({ rootURI }, reason) {
  Zotero.debug("Bootstrap startup begin");
  // registerChrome is Zotero 7 only; Zotero 8 uses chrome.manifest in the XPI.
  try {
    var aomStartup = Components.classes[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Components.interfaces.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "__addonRef__", rootURI + "content/"],
      ["locale", "__addonRef__", "en-US", rootURI + "locale/en-US/"],
      ["locale", "__addonRef__", "en-AU", rootURI + "locale/en-AU/"],
      ["skin", "__addonRef__", "default", rootURI + "skin/default/"],
    ]);
    Zotero.debug("Bootstrap registered chrome via registerChrome");
  } catch (e) {
    Zotero.debug(`Bootstrap chrome registration via registerChrome unavailable (Zotero 8+): ${e}`);
  }
  const ctx = { rootURI };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/__addonRef__.js`,
    ctx,
  );

  Zotero.debug("Bootstrap startup complete");
  await Zotero.__addonInstance__.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

async function shutdown({ rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.__addonInstance__?.hooks.onShutdown();

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) {}
