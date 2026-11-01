import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { unlockAudio } from './lib/feedback';
import './index.css';
import './hardware.css';

window.addEventListener('pointerdown', unlockAudio, { once: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
