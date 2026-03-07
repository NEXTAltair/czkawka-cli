import { pluginId, getCfg } from "./src/plugin-meta";
import { registerToolStatus } from "./src/tool-status";
import { registerToolValidate } from "./src/tool-validate";
import { registerToolCacheInfo } from "./src/tool-cache-info";
import { registerToolDupHashScan } from "./src/tool-dup-hash-scan";
import { registerToolSimilarVideoScan } from "./src/tool-similar-video-scan";
import { registerPluginHooks } from "./src/plugin-hooks";

export default function register(api: any) {
  registerPluginHooks(api);

  api.registerGatewayMethod(`${pluginId}.status`, ({ respond }: any) => {
    try {
      const cfg = getCfg(api);
      respond(true, { ok: true, pluginId, configured: cfg });
    } catch (e: any) {
      respond(false, { ok: false, pluginId, error: String(e?.message || e) });
    }
  });

  registerToolStatus(api, getCfg);
  registerToolValidate(api, getCfg);
  registerToolCacheInfo(api, getCfg);
  registerToolDupHashScan(api, getCfg);
  registerToolSimilarVideoScan(api, getCfg);
}
