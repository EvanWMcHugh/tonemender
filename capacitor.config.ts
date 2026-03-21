import { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.tonemender.app",
  appName: "ToneMender",
  webDir: "out",

  server: isDev
    ? {
        url: "http://10.0.2.2:3000",
        cleartext: true,
      }
    : {
        url: "https://tonemender.com",
        cleartext: false,
        androidScheme: "https",
      },

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;