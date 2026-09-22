"use client";

import InlineConfirm from "@/components/inline-confirm";
import PasswordValue from "@/components/password-value";

type Credential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
  portal_url: string | null;
};

export default function CredentialRow({
  credential,
  confirming,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  credential: Credential;
  confirming: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
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
            เปิดเว็บ
          </a>
        )}
      </td>
      <td>{credential.username || "—"}</td>
      <td className="whitespace-nowrap">
        <PasswordValue value={credential.password} />
      </td>
      <td className="whitespace-nowrap text-right">
        {confirming ? (
          <InlineConfirm
            message="ลบข้อมูลนี้?"
            confirmLabel="ลบ"
            onConfirm={onConfirmDelete}
            onCancel={onCancelDelete}
          />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <button className="btn px-1.5 py-0.5 text-xs" onClick={onEdit}>
              แก้ไข
            </button>
            <button className="btn-danger px-1.5 py-0.5 text-xs" onClick={onRequestDelete}>
              ลบ
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
