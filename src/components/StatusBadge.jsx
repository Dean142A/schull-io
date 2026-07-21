import React from 'react';
import { Lock, CheckCircle, Upload, Edit3 } from 'lucide-react';

export default function StatusBadge({ status }) {
  switch (status) {
    case 'Draft':
      return (
        <span className="badge badge-draft">
          <Edit3 size={12} /> Draft
        </span>
      );
    case 'Uploaded':
      return (
        <span className="badge badge-uploaded">
          <Upload size={12} /> Uploaded
        </span>
      );
    case 'Locked':
      return (
        <span className="badge badge-locked">
          <Lock size={12} style={{ color: 'var(--color-warning)' }} /> Locked
        </span>
      );
    case 'Published':
      return (
        <span className="badge badge-published">
          <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> Published
        </span>
      );
    default:
      return <span className="badge badge-draft">{status}</span>;
  }
}
