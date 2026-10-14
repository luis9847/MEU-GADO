import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.sistemameugado.app',
  appName: 'Meu Gado',
  webDir: 'www',
  server: {
    url: 'https://www.sistemameugado.com.br/app',
    cleartext: false,
    allowNavigation: ['www.sistemameugado.com.br']
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
