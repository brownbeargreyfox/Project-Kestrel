import type { PluginManifest } from "../../types/plugin";

export const manifest: PluginManifest = {
  id: "maia",
  name: "MAIA",
  version: "1.0.0",
  permissions: [],
  tabs: [],
  widgets: [],
  setup: () => {
    console.log("MAIA plugin loaded");
  },
};

export default manifest;
