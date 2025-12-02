"use client";
import { useEffect, useRef, useState } from "react";

export default function AuditPolling({ id, hasAudit }: { id: string; hasAudit: boolean }) {
  const [pending, setPending] = useState(!hasAudit);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!pending) return;
    async function check() {
      try {
        const res = await fetch(`/api/contracts/${id}?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (j?.audit) {
          // stop polling and hard refresh to re-render server data
          setPending(false);
          if (timer.current) clearInterval(timer.current);
          window.location.reload();
        }
      } catch {}
    }
    check();
    timer.current = setInterval(check, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [id, pending]);

  if (!pending) return null;
  return (
    <div className="polling-toast">
      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.3" />
        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      正在审核中…（每2秒自动刷新）
    </div>
  );
}

