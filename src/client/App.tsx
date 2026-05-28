import { useState } from 'react';
import Dashboard from './pages/Dashboard.js';
import Project from './pages/Project.js';

export default function App() {
  const [projectName, setProjectName] = useState<string | null>(null);

  if (projectName) {
    return <Project name={projectName} onBack={() => setProjectName(null)} />;
  }
  return <Dashboard onSelectProject={setProjectName} />;
}
