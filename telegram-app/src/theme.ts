import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

type ThemeParams = Record<string, string | undefined>;

type TelegramWebApp = {
  colorScheme?: 'light' | 'dark';
  themeParams?: ThemeParams;
  onEvent?: (event: 'themeChanged', listener: () => void) => void;
  offEvent?: (event: 'themeChanged', listener: () => void) => void;
};

const palettes = {
  light: {
    background: '#ffffff',
    foreground: '#0f172a',
    card: '#ffffff',
    popover: '#ffffff',
    muted: '#f1f5f9',
    mutedForeground: '#526075',
    border: '#8793a6',
    primary: '#172033',
    primaryForeground: '#f8fafc',
    destructive: '#dc2626',
    success: '#15803d',
    successForeground: '#ffffff',
  },
  dark: {
    background: '#020817',
    foreground: '#f8fafc',
    card: '#0b1220',
    popover: '#0b1220',
    muted: '#1e293b',
    mutedForeground: '#b6c2d2',
    border: '#56647a',
    primary: '#f8fafc',
    primaryForeground: '#172033',
    destructive: '#f05252',
    success: '#4ade80',
    successForeground: '#052e16',
  },
};

function themeValue(params: ThemeParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (value) return value;
  }
  return undefined;
}

function telegramWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

function systemMode(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function isTelegramMiniApp() {
  return location.pathname.startsWith('/mini-app');
}

export function currentMode(): 'light' | 'dark' {
  if (isTelegramMiniApp()) return telegramWebApp()?.colorScheme || systemMode();
  return systemMode();
}

export function applyAppTheme() {
  const mode = currentMode();
  const fallback = palettes[mode];
  const params = isTelegramMiniApp() ? telegramWebApp()?.themeParams || {} : {};
  const background =
    themeValue(params, 'bg_color', 'bgColor') || fallback.background;
  const foreground =
    themeValue(params, 'text_color', 'textColor') || fallback.foreground;
  const card =
    themeValue(params, 'secondary_bg_color', 'secondaryBgColor') ||
    fallback.card;
  const muted =
    themeValue(params, 'section_bg_color', 'sectionBgColor') || fallback.muted;
  const mutedForeground =
    themeValue(params, 'hint_color', 'hintColor') || fallback.mutedForeground;
  const primary =
    themeValue(params, 'button_color', 'buttonColor') || fallback.primary;
  const primaryForeground =
    themeValue(params, 'button_text_color', 'buttonTextColor') ||
    fallback.primaryForeground;
  const destructive =
    themeValue(params, 'destructive_text_color', 'destructiveTextColor') ||
    fallback.destructive;
  const link =
    themeValue(params, 'link_color', 'linkColor', 'accent_text_color') ||
    primary;
  const border =
    themeValue(params, 'section_separator_color', 'sectionSeparatorColor') ||
    fallback.border;

  const values: Record<string, string> = {
    '--app-background': background,
    '--app-foreground': foreground,
    '--app-card': card,
    '--app-card-foreground': foreground,
    '--app-popover': card || fallback.popover,
    '--app-popover-foreground': foreground,
    '--app-muted': muted,
    '--app-muted-foreground': mutedForeground,
    '--app-border': border,
    '--app-primary': primary,
    '--app-primary-foreground': primaryForeground,
    '--app-link': link,
    '--app-destructive': destructive,
    '--app-success': fallback.success,
    '--app-success-foreground': fallback.successForeground,
  };

  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  Object.entries(values).forEach(([name, value]) =>
    root.style.setProperty(name, value),
  );
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', background);
  return mode;
}

export function subscribeToThemeChanges(
  listener: (mode: 'light' | 'dark') => void,
) {
  const update = () => listener(applyAppTheme());
  if (isTelegramMiniApp()) {
    const webApp = telegramWebApp();
    webApp?.onEvent?.('themeChanged', update);
    return () => webApp?.offEvent?.('themeChanged', update);
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}

const config: ThemeConfig = {
  initialColorMode: currentMode(),
  useSystemColorMode: false,
};

export const runtimeColorModeManager = {
  type: 'localStorage' as const,
  get: () => currentMode(),
  set: () => undefined,
};

const focusRing = {
  boxShadow: '0 0 0 2px var(--app-background), 0 0 0 4px var(--app-primary)',
};

export const theme = extendTheme({
  config,
  colors: {
    shadcn: {
      background: 'var(--app-background)',
      foreground: 'var(--app-foreground)',
      card: 'var(--app-card)',
      cardForeground: 'var(--app-card-foreground)',
      popover: 'var(--app-popover)',
      popoverForeground: 'var(--app-popover-foreground)',
      muted: 'var(--app-muted)',
      mutedForeground: 'var(--app-muted-foreground)',
      border: 'var(--app-border)',
      primary: 'var(--app-primary)',
      primaryForeground: 'var(--app-primary-foreground)',
      destructive: 'var(--app-destructive)',
      success: 'var(--app-success)',
      successForeground: 'var(--app-success-foreground)',
    },
  },
  fonts: {
    heading:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  radii: { md: '0.5rem', lg: '0.625rem', xl: '0.75rem' },
  shadows: {
    sm: '0 1px 2px rgb(0 0 0 / 0.12)',
    md: '0 12px 28px rgb(0 0 0 / 0.28)',
  },
  styles: {
    global: {
      'html, body': { bg: 'shadcn.background', color: 'shadcn.foreground' },
      body: { letterSpacing: '0' },
      '#root': { minH: '100vh' },
      '*::placeholder': { color: 'shadcn.mutedForeground', opacity: 1 },
    },
  },
  components: {
    Button: {
      baseStyle: {
        minH: '40px',
        borderRadius: 'md',
        fontWeight: '700',
        _focusVisible: focusRing,
      },
      variants: {
        primary: {
          bg: 'shadcn.primary',
          color: 'shadcn.primaryForeground',
          border: '1px solid',
          borderColor: 'shadcn.primary',
          _hover: { opacity: 0.9 },
          _active: { opacity: 0.82 },
        },
        success: {
          bg: 'shadcn.success',
          color: 'shadcn.successForeground',
          border: '1px solid',
          borderColor: 'shadcn.success',
          _hover: { opacity: 0.9 },
          _active: { opacity: 0.82 },
        },
        outline: {
          bg: 'transparent',
          color: 'shadcn.foreground',
          border: '1px solid',
          borderColor: 'shadcn.border',
          _hover: { bg: 'shadcn.muted' },
          _active: { bg: 'shadcn.muted' },
        },
        ghost: {
          color: 'shadcn.foreground',
          _hover: { bg: 'shadcn.muted' },
          _active: { bg: 'shadcn.muted' },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Input: {
      variants: {
        outline: {
          field: {
            bg: 'shadcn.background',
            color: 'shadcn.foreground',
            borderColor: 'shadcn.border',
            _hover: { borderColor: 'shadcn.mutedForeground' },
            _focusVisible: focusRing,
          },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Textarea: {
      variants: {
        outline: {
          bg: 'shadcn.background',
          color: 'shadcn.foreground',
          borderColor: 'shadcn.border',
          _hover: { borderColor: 'shadcn.mutedForeground' },
          _focusVisible: focusRing,
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Select: {
      variants: {
        outline: {
          field: {
            bg: 'shadcn.background',
            color: 'shadcn.foreground',
            borderColor: 'shadcn.border',
            _hover: { borderColor: 'shadcn.mutedForeground' },
            _focusVisible: focusRing,
          },
          icon: { color: 'shadcn.mutedForeground' },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Menu: {
      baseStyle: {
        list: {
          bg: 'shadcn.popover',
          color: 'shadcn.popoverForeground',
          borderColor: 'shadcn.border',
          boxShadow: 'md',
          p: 1,
        },
        item: {
          bg: 'transparent',
          color: 'shadcn.popoverForeground',
          borderRadius: 'md',
          _hover: { bg: 'shadcn.muted' },
          _focus: { bg: 'shadcn.muted' },
        },
      },
    },
    Modal: {
      baseStyle: {
        overlay: { bg: 'blackAlpha.600' },
        dialog: {
          bg: 'shadcn.popover',
          color: 'shadcn.popoverForeground',
          border: '1px solid',
          borderColor: 'shadcn.border',
          maxH: 'calc(100dvh - 32px)',
          m: 4,
        },
        header: { borderBottom: '1px solid', borderColor: 'shadcn.border' },
        body: { overflowY: 'auto' },
        footer: { borderTop: '1px solid', borderColor: 'shadcn.border' },
      },
    },
    Badge: {
      baseStyle: {
        bg: 'shadcn.muted',
        color: 'shadcn.foreground',
        borderRadius: 'full',
        px: 2.5,
        py: 1,
      },
      variants: {
        success: { bg: 'shadcn.success', color: 'shadcn.successForeground' },
        destructive: {
          bg: 'transparent',
          color: 'shadcn.destructive',
          border: '1px solid',
          borderColor: 'shadcn.destructive',
        },
      },
    },
    Alert: {
      variants: {
        subtle: {
          container: {
            bg: 'shadcn.muted',
            color: 'shadcn.foreground',
            border: '1px solid',
            borderColor: 'shadcn.border',
            borderRadius: 'md',
          },
        },
      },
      defaultProps: { variant: 'subtle' },
    },
    Divider: { baseStyle: { borderColor: 'shadcn.border' } },
    Spinner: { baseStyle: { color: 'shadcn.primary' } },
  },
});
