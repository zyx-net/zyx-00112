const Header = () => {
 return (<header style={{ backgroundColor: '#2c3e50', color: '#fff', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div>
 <h1 style={{ fontSize: '1.5rem', fontWeight: '600' }}>接口变更演练与回滚沙盘</h1>
 <p style={{ fontSize: '0.875rem', color: '#bdc3c7', marginTop: '0.25rem' }}>API Change Drill & Rollback Sandbox</p>
 </div>
 <div style={{ fontSize: '0.875rem', color: '#bdc3c7' }}>
 当前状态: <span style={{ color: '#27ae60', fontWeight: '600' }}>运行中</span>
 </div>
 </header>);
};
export default Header;