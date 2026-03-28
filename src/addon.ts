import { config } from "../package.json";
import hooks from "./hooks";
import { Zotodo } from "./zotodo";

type Env = "development" | "production";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: Env;
    initialized: boolean;
    preferencesPaneID?: string;
    useMenuManager: boolean;
    registeredMenuIDs: Array<string | number>;
    zotodo?: Zotodo;
  };

  public hooks: typeof hooks;
  public api: object;

  constructor() {
    Zotero.debug("Zotodo: Constructing Addon instance");
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      useMenuManager: false,
      registeredMenuIDs: [],
    };
    this.hooks = hooks;
    this.api = {};
    Zotero.debug(`Zotodo: Addon constructed (env=${this.data.env})`);
  }
}

export default Addon;
