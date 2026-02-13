import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a75dc2d8aa96b483cb6655c65c33f188b',
  appName: 'channel-chateau',
  webDir: 'dist',
  // For development with hot-reload, uncomment the server block below:
  // server: {
  //   url: 'https://75dc2d8a-a96b-483c-b665-5c65c33f188b.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
