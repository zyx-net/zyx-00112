const Navigation = ({ activeTab, setActiveTab }) => {
 const tabs = [
 { id: 'versions', label: 'API版本管理' },
 { id: 'scenarios', label: '场景管理' },
 { id: 'injections', label: '失败注入' },
 { id: 'execution', label: '演练执行' },
 { id: 'rollback', label: '回滚管理' },
 { id: 'packages', label: '场景包' },
 { id: 'forensics', label: '取证工作台' },
 { id: 'audit', label: '审计中心' }
 ];
 return (<nav style={{ backgroundColor: '#34495e', padding: '0 2rem' }}>
 <ul style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
 {tabs.map(tab => (<li key={tab.id}>
 <button onClick={() => setActiveTab(tab.id)} style={{
 backgroundColor: activeTab === tab.id ? '#2980b9' : 'transparent',
 color: '#fff',
 border: 'none',
 padding: '1rem 1.5rem',
 cursor: 'pointer',
 fontSize: '0.9rem',
 transition: 'background-color 0.2s',
 display: 'block'
 }}>
 {tab.label}
 </button>
 </li>))}
 </ul>
 </nav>);
};
export default Navigation;