import Addon from "./addon";
import { config } from "../package.json";

if (!(Zotero as any)[config.addonInstance]) {
  _globalThis.addon = new Addon();
  (Zotero as any)[config.addonInstance] = addon;
}

export {};
