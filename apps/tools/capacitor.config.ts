import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "fr.elsatia.tools",
  appName: "ELSATIA Tools",
  webDir: "out",
  backgroundColor: "#f3f2ed",
  loggingBehavior: "none",
  zoomEnabled: false,
  server: {
    hostname: "localhost",
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
