import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tonemender.app",
  appName: "ToneMender",

  // Not used when loading remote site, but required by Capacitor
  webDir: "out",

  /**
   * Load the production web app directly.
   * This keeps the mobile app always running the latest deployed version.
   */
  server: {
    url: "https://tonemender.com",
    cleartext: false, // HTTPS only
    androidScheme: "https"
  },

  /**
   * Prevent dev server from accidentally being enabled in production builds
   */
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;