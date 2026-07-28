import React, { createContext, useContext, ReactNode } from 'react';
import { useProject } from '../hooks/useProject';
import { useSlicer } from '../hooks/useSlicer';

// Define the shape of our context
interface ProjectContextType {
  // From useProject
  project: ReturnType<typeof useProject>;
  // From useSlicer
  slicer: ReturnType<typeof useSlicer>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const project = useProject();
  const slicer = useSlicer(
    project.models,
    project.globalSettings,
    project.zZones,
    project.toolheads,
    project.calculatedTotalLayers,
    project.selectedMaterials
  );

  const value = {
    project,
    slicer
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};
