"use client";

import { useState } from "react";

type Credential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
  portal_url: string | null;
};

export default function CredentialRow({
  credential,
  onDelete,
  onEdit,
}: {
  credential: Credential;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(credential.password ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <tr>
      <td>
        {credential.label}
        {credential.portal_url && (
          <a
            href={credential.portal_url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-blue-600 underline"
          >
            open
          </a>
        )}
      </td>
      <td>{credential.username || "—"}</td>
      <td className="whitespace-nowrap">
        <span className="mr-2 font-mono text-xs">{credential.password || "—"}</span>
        {credential.password && (
          <button className="btn px-1.5 py-0.5 text-xs" onClick={copy}>
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        )}
      </td>
      <td className="whitespace-nowrap text-right">
        <button className="btn mr-1 px-1.5 py-0.5 text-xs" onClick={onEdit}>
          แก้ไข
        </button>
        <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={onDelete}>
          ลบ
        </button>
      </td>
    </tr>
  );
}
