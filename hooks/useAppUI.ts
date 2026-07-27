import { useState, useEffect } from 'react';
import { HelpTopic } from '../components/HelpWiki/HelpWiki';

export const useAppUI = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);
  const [isWifiOpen, setIsWifiOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdvancedSliceMode, setIsAdvancedSliceMode] = useState(false);
  const [isSlicePreviewMode, setIsSlicePreviewMode] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'gallery'>('editor');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);

  // Sync dark mode with HTML class
  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return {
    darkMode,
    setDarkMode,
    toggleDarkMode,
    activeStep,
    setActiveStep,
    helpTopic,
    setHelpTopic,
    isWifiOpen,
    setIsWifiOpen,
    isDragging,
    setIsDragging,
    isAdvancedSliceMode,
    setIsAdvancedSliceMode,
    isSlicePreviewMode,
    setIsSlicePreviewMode,
    currentView,
    setCurrentView,
    isPanelCollapsed,
    setIsPanelCollapsed,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isInspectorCollapsed,
    setIsInspectorCollapsed,
    workflowNotice,
    setWorkflowNotice
  };
};
