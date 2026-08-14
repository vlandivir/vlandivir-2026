declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string | undefined>;
        ready?: () => void;
        expand?: () => void;
        openLink?: (url: string) => void;
        onEvent?: (event: 'themeChanged', listener: () => void) => void;
        offEvent?: (event: 'themeChanged', listener: () => void) => void;
      };
    };
  }
}
export {};
