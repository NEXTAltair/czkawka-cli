import { resolveConfig } from "./config";

export const pluginId = "czkawka-cli";
export const pluginVersion = "0.1.0";

export function getCfg(api: any) {
  const raw = api?.config?.plugins?.entries?.[pluginId]?.config ?? {};
  return resolveConfig(raw);
}
