window.__ModuleLoader__.load({ id: "@ds-connector/connector", factory: (require) => {
"use strict";
(() => {
  // client/index.ts
  function activate() {
    try {
      const probe = {
        getState: async () => {
          try {
            const response = await fetch("http://127.0.0.1:28471/state");
            return await response.json();
          } catch {
            return null;
          }
        }
      };
      window["__dsConnector"] = probe;
      console.info("[DS Connector] client module ready");
    } catch (error) {
      console.warn("[DS Connector] client module init skipped", error);
    }
  }
  activate();
})();
});
