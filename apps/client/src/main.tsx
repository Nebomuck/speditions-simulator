import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { installGlobalErrorHandlers } from './game/errors.ts';
import { initPanelSizes } from './ui/Resizer.tsx';
import './styles.css';

installGlobalErrorHandlers();
initPanelSizes();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
