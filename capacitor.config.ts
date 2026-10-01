import type { CapacitorConfig } from '@capacitor/cli';

// The packaged WebView origin cannot serve GenMB SDK/API endpoints. Android must
// open the deployed app so SDK requests and assets use the same real HTTPS origin.
const productionUrl = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.ZIVO_PRODUCTION_URL?.trim();
if (productionUrl) {
  const url = new URL(productionUrl);
  if (url.protocol !== 'https:' || !url.hostname || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname) || url.username || url.password || url.hash) {
    throw new Error('ZIVO_PRODUCTION_URL must be a deployed HTTPS app URL without credentials or a hash fragment.');
  }
}

const config: CapacitorConfig = {
  appId: 'com.zivo.app',
  appName: 'ZIVO',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(productionUrl ? { url: productionUrl } : {})
  }
};

export default config;
