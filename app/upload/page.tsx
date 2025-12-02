"use client";
import { useState } from "react";

export default function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState("上海大学材料科学与工程学院");
  const [step, setStep] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const file = (fd.get("file") as File) || null;
      if (!file) throw new Error("缺少文件");
      // 后端执行PDF转图，前端统一调用原上传接口
      setStep("正在上传...");
      const res = await fetch("/api/contracts/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStep("正在审核...");
      window.location.href = `/contracts/${data.id}`;
    } catch (err: any) {
      setError(err.message || "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="card">
        <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>上传合同扫描件</h2>
        <form onSubmit={onSubmit} encType="multipart/form-data">
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="muted" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>选择文件</label>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '2rem', textAlign: 'center', background: '#f8fafc' }}>
              <input name="file" type="file" accept="application/pdf,image/*" multiple required style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }} />
              <p className="muted" style={{ fontSize: '0.75rem', margin: 0 }}>支持 PDF、JPG、PNG。图片可多选代表多页（单图骑缝章检查不适用）。建议单张 ≤ 20MB。</p>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="muted" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>标准署名（印章/主体名称需包含）</label>
            <input name="expectedName" type="text" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="例如：上海大学材料科学与工程学院" />
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>默认：上海大学材料科学与工程学院</div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button className="btn" disabled={busy} style={{ width: '100%', padding: '0.75rem' }}>
              {busy ? (
                <>
                  <span className="animate-spin" style={{ marginRight: 8 }}>⏳</span>
                  {step || "处理中..."}
                </>
              ) : "开始上传并审核"}
            </button>
          </div>
        </form>
        {error && (
          <div className="err" style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', borderRadius: 'var(--radius)', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// 后端执行PDF转图，无需前端转
