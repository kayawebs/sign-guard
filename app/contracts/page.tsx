import { listContracts } from "@/lib/storage";
import DeleteContractButton from "@/components/DeleteContractButton";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const items = await listContracts();
  return (
    <div style={{ maxWidth: '1024px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>合同列表</h2>
        <a href="/upload" className="btn">上传新合同</a>
      </div>
      
      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p className="muted">暂无合同记录</p>
          <a href="/upload" className="btn secondary" style={{ marginTop: '1rem' }}>去上传</a>
        </div>
      ) : (
        <div className="list">
          {items.map((c) => (
            <div className="card" key={c.id} style={{ padding: '1rem 1.5rem' }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <a href={`/contracts/${c.id}`} style={{ fontWeight: 600, fontSize: '1.125rem', color: 'var(--text-main)' }}>
                      {c.filename}
                    </a>
                  </div>
                  <div className="row" style={{ gap: '0.75rem', fontSize: '0.875rem' }}>
                    <span className="muted">{new Date(c.createdAt).toLocaleString()}</span>
                    {c.category && <span className="tag">{c.category}</span>}
                  </div>
                </div>
                
                <div className="row" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {c.audit?.ok ? (
                      <span className="tag" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>✅ 审核通过</span>
                    ) : c.audit ? (
                      <span className="tag" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>⚠️ 发现问题</span>
                    ) : (
                      <span className="tag" style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}>⏳ 待审核</span>
                    )}
                    
                    {c.manualReview?.status && (
                      <span className="tag" style={{ background: '#f8fafc', color: '#475569' }}>
                        复核: {c.manualReview.status === "approved" ? "通过" : c.manualReview.status === "rejected" ? "拒绝" : "需修改"}
                      </span>
                    )}
                  </div>
                  
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <a href={`/contracts/${c.id}`} className="btn secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>查看</a>
                    <DeleteContractButton id={c.id} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
