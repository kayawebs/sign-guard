"use client";

export default function DeleteContractButton({ id }: { id: string }) {
  return (
    <form action={`/api/contracts/${id}/delete`} method="post" onSubmit={(e) => {
      if (!confirm("确定要删除这个合同吗？此操作无法撤销。")) {
        e.preventDefault();
      }
    }}>
      <button className="btn danger" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} type="submit">删除</button>
    </form>
  );
}
