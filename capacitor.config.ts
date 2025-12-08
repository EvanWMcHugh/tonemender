import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tonemender.app',
  appName: 'ToneMender',
  webDir: 'out',
  server: {
    url: 'https://tonemender.com',
    cleartext: false
  }
};

export default config;