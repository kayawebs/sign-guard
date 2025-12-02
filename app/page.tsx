export default function Page() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>Sign Guard</h1>
        <p className="muted" style={{ fontSize: '1.25rem', marginBottom: '2rem' }}>
          智能合同预审核系统，结合 AI 视觉识别与规则引擎，<br/>
          为您提供高效、严谨的合同合规性检查。
        </p>
        
        <div className="row" style={{ justifyContent: 'center', gap: '1.5rem' }}>
          <a href="/upload" className="btn" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
            立即上传合同
          </a>
          <a href="/contracts" className="btn secondary" style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}>
            查看历史记录
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="card">
          <h3>🤖 智能识别</h3>
          <p className="muted">基于 Qwen VL 大模型，精准识别合同文本、印章及关键要素。</p>
        </div>
        <div className="card">
          <h3>⚖️ 规则审核</h3>
          <p className="muted">自动校验签署日期、标准署名、合同分类等合规性要求。</p>
        </div>
        <div className="card">
          <h3>👨‍💻 人工复核</h3>
          <p className="muted">支持人工二次确认与分类修正，确保审核结果万无一失。</p>
        </div>
      </div>
    </div>
  );
}

