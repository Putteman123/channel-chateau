import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a75dc2d8aa96b483cb6655c65c33f188b',
  appName: 'Streamify',
  webDir: 'dist',
  server: {
    // Production: loads from local dist (no server.url)
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    CapacitorVideoPlayer: {
      // Use ExoPlayer (best for Android IPTV streams)
      pip: true,
    },
  },
};

export default config;
