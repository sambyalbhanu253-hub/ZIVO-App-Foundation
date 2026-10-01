import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zivo.app',
  appName: 'ZIVO',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://zivo-app-foundation.genmb.com',
    cleartext: true
  }
};

export default config;
