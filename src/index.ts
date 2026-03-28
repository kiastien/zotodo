import Addon from "./addon";
import { config } from "../package.json";

if (!(Zotero as any)[config.addonInstance]) {
  Zotero.debug("Zotodo: No existing addon instance found; creating one");
  _globalThis.addon = new Addon();
  (Zotero as any)[config.addonInstance] = addon;
  Zotero.debug("Zotodo: Addon instance registered on Zotero namespace");
}
else {
  Zotero.debug("Zotodo: Existing addon instance detected; reusing current instance");
}

export {};
