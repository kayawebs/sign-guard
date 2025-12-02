import { notFound } from "next/navigation";
import { getContractById } from "@/lib/storage";
import AuditResult from "@/components/AuditResult";
import AuditPolling from "@/components/AuditPolling";

export const dynamic = "force-dynamic";

export default async function ContractDetail({ params }: { params: { id: string } }) {
  const item = await getContractById(params.id);
  if (!item) return notFound();

  const isImage = item.mime?.startsWith("image/");
  const isPdf = item.mime === "application/pdf";

  return (
    <div className="list">
      <AuditPolling id={item.id} hasAudit={!!item.audit} />
      
      {/* Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{item.filename}</h1>
            <div className="row" style={{ gap: '0.5rem' }}>
               <span className="tag">{item.category ?? "未分类"}</span>
               <span className="tag" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                 {item.expectedImprintName || "上海大学材料科学与工程学院"}
               </span>
            </div>
          </div>
          <div className="row">
            <a className="btn secondary" href={`/api/contracts/${item.id}/download`}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: 6 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              下载
            </a>
            <form action={`/api/audit`} method="post">
              <input type="hidden" name="id" value={item.id} />
              <button className="btn secondary" type="submit">重新审核</button>
            </form>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <form action={`/api/contracts/${item.id}/category`} method="post">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: '0.5rem' }}>修改分类</label>
                <select name="category" defaultValue={item.category || "其他"}>
                  <option>本科教学类</option>
                  <option>研究生教学类</option>
                  <option>科研类</option>
                  <option>人事/劳动类</option>
                  <option>国际/港澳台交流类</option>
                  <option>学工类</option>
                  <option>院团委类</option>
                  <option>其他</option>
                </select>
              </div>
              <button className="btn secondary" type="submit">更新</button>
            </div>
          </form>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Preview Section */}
        <div className="card">
          <h3>合同预览</h3>
          <div style={{ background: '#f1f5f9', borderRadius: '0.5rem', padding: '1rem', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {item.images && item.images.length > 0 ? (
              <div style={{ display: "grid", gap: 8, width: '100%' }}>
                {item.images.map((_, idx) => (
                  <img key={idx} src={`/api/contracts/${item.id}/image/${idx}?embed=1`} alt={`${item.filename}-page-${idx + 1}`} style={{ maxWidth: "100%", borderRadius: 4, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                ))}
              </div>
            ) : !item.images?.length && isImage ? (
              <img src={`/api/contracts/${item.id}/download?embed=1`} alt={item.filename} style={{ maxWidth: "100%", maxHeight: '600px', objectFit: 'contain' }} />
            ) : !item.images?.length && isPdf ? (
              <object data={`/api/contracts/${item.id}/download?embed=1`} type="application/pdf" width="100%" height="600" style={{ borderRadius: 4 }}>
                <p>无法预览 PDF，请点击下载查看。</p>
              </object>
            ) : (
              <p className="muted">暂不支持在线预览该类型文件</p>
            )}
          </div>
        </div>

        {/* Audit & Review Section */}
        <div className="list">
          <div className="card">
            <h3>智能审核结果</h3>
            <AuditResult audit={item.audit ?? null} />
          </div>

          <div className="card">
            <h3>人工复核</h3>
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: item.manualReview?.status === 'approved' ? '#f0fdf4' : item.manualReview?.status === 'rejected' ? '#fef2f2' : '#f8fafc', borderRadius: '0.5rem', border: '1px solid transparent', borderColor: item.manualReview?.status === 'approved' ? '#bbf7d0' : item.manualReview?.status === 'rejected' ? '#fecaca' : '#e2e8f0' }}>
               {item.manualReview?.status ? (
                <div className="row">
                  <span style={{ fontWeight: 600, color: item.manualReview.status === 'approved' ? '#166534' : item.manualReview.status === 'rejected' ? '#991b1b' : '#854d0e' }}>
                    {item.manualReview.status === "approved" ? "✅ 已通过" : item.manualReview.status === "rejected" ? "❌ 已拒绝" : "⚠️ 需修改"}
                  </span>
                  {item.manualReview.reviewer && <span className="muted">by {item.manualReview.reviewer}</span>}
                </div>
              ) : (
                <span className="muted">暂无复核记录</span>
              )}
              {item.manualReview?.comment && <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{item.manualReview.comment}</p>}
            </div>

            <form action={`/api/contracts/${item.id}/review`} method="post" style={{ display: "grid", gap: '1rem' }}>
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: '0.5rem' }}>复核决定</label>
                <select name="status" defaultValue="approved">
                  <option value="approved">通过</option>
                  <option value="needs_changes">需修改</option>
                  <option value="rejected">拒绝</option>
                </select>
              </div>
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: '0.5rem' }}>复核人</label>
                <input type="text" name="reviewer" placeholder="请输入您的姓名" />
              </div>
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: '0.5rem' }}>意见说明</label>
                <textarea name="comment" placeholder="请输入详细的复核意见..." rows={3} />
              </div>
              <button className="btn" type="submit" style={{ width: '100%' }}>提交复核结果</button>
            </form>
          </div>
          
          {!!item.history?.length && (
            <div className="card">
              <h3>操作记录</h3>
              <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                {item.history!.map((h, i) => (
                  <li key={i} className="muted" style={{ marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{h.action}</span>
                    <br/>
                    <span style={{ fontSize: '0.75rem' }}>{new Date(h.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
