import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import { applyAppTheme, runtimeColorModeManager, theme } from './theme';

applyAppTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme} colorModeManager={runtimeColorModeManager}>
      <App />
    </ChakraProvider>
  </React.StrictMode>,
);
