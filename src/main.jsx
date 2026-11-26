import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App.jsx';
import './styles.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <MotionConfig reducedMotion="user"><App /></MotionConfig>
  </ErrorBoundary>
);
