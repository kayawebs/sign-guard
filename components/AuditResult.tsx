"use client";
import type { AuditResult as AR } from "@/lib/types";

export default function AuditResult({ audit }: { audit: AR | null }) {
  if (!audit) return <p className="muted">尚未执行审核</p>;
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        {audit.ok ? (
          <span className="ok">✅ 检查通过</span>
        ) : (
          <span className="err">❌ 存在问题</span>
        )}
        {audit.source && <span className="tag">来源: {audit.source}</span>}
      </div>
      <ul>
        {audit.checks.map((c) => (
          <li key={c.name} className={c.ok ? "ok" : "err"}>
            {c.ok ? "✔" : "✖"} {c.name} {c.message ? `- ${c.message}` : ""}
          </li>
        ))}
      </ul>
      {audit.recognized && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ margin: 0, marginBottom: 8 }}>识别要素</h4>
          {audit.recognized.seals && audit.recognized.seals.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="muted" style={{ marginBottom: 4 }}>印章识别</div>
              <ul>
                {audit.recognized.seals.map((s, i) => (
                  <li key={`seal-${i}`} className="muted">
                    [{s.side || '未知'}] {s.imprint_text || '—'} {s.near_text ? `（邻近：${s.near_text}）` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {audit.recognized.signatures && audit.recognized.signatures.length > 0 && (
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>签名/代理识别</div>
              <ul>
                {audit.recognized.signatures.map((s, i) => (
                  <li key={`sig-${i}`} className="muted">
                    [{s.side || '未知'}] {s.name || '—'} {s.label ? `（${s.label}）` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {audit.notes && <p className="muted" style={{ marginTop: 8 }}>{audit.notes}</p>}
    </div>
  );
}
