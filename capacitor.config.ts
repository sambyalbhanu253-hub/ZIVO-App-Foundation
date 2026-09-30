import type { CapacitorConfig } from '@capacitor/cli'

const productionUrl = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.ZIVO_PRODUCTION_URL?.trim()

if (!productionUrl || !/^https:\/\/[^\s]+$/i.test(productionUrl)) {
  throw new Error('ZIVO_PRODUCTION_URL must be the canonical HTTPS URL of the deployed ZIVO app.')
}

const config: CapacitorConfig = {
  appId: 'com.zivo.app',
  appName: 'ZIVO',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: productionUrl,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
