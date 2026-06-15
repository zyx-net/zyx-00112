import { useState } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import ApiVersionManager from './components/ApiVersionManager';
import ScenarioManager from './components/ScenarioManager';
import FailureInjectionManager from './components/FailureInjectionManager';
import ExecutionPanel from './components/ExecutionPanel';
import RollbackManager from './components/RollbackManager';
import ScenarioPackageManager from './components/ScenarioPackageManager';

function App() {
  const [activeTab, setActiveTab] = useState('versions');

  const renderContent = () => {
    switch (activeTab) {
      case 'versions':
        return <ApiVersionManager />;
      case 'scenarios':
        return <ScenarioManager />;
      case 'injections':
        return <FailureInjectionManager />;
      case 'execution':
        return <ExecutionPanel />;
      case 'rollback':
        return <RollbackManager />;
      case 'packages':
        return <ScenarioPackageManager />;
      default:
        return <ApiVersionManager />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      <main style={{ minHeight: 'calc(100vh - 140px)' }}>
        {renderContent()}
      </main>
      <footer style={{ backgroundColor: '#2c3e50', color: '#bdc3c7', padding: '1rem 2rem', textAlign: 'center', fontSize: '0.875rem' }}>
        接口变更演练与回滚沙盘 © 2024
      </footer>
    </div>
  );
}

export default App;