import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

console.log('Renderer: main.tsx loaded');

const rootElement = document.getElementById('root');
console.log('Renderer: root element:', rootElement);

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('Renderer: React app mounted');
} else {
  console.error('Renderer: root element not found!');
}
