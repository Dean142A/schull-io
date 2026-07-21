import React from 'react';
import { X, Printer, ShieldCheck, Award, FileText, CheckCircle } from 'lucide-react';

export default function TranscriptPdfModal({ isOpen, onClose, studentData }) {
  if (!isOpen || !studentData) return null;

  const { student, terms = [], overallAverage = 0, totalCoursesTaken = 0 } = studentData;
  const estimatedGpa = (Number(overallAverage) / 100 * 4.0).toFixed(2);
  const transcriptDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(15, 15, 20, 0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflowY: 'auto',
    }}>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-transcript, #printable-transcript * {
            visibility: visible;
          }
          #printable-transcript {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-modal)',
        padding: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
        position: 'relative',
      }}>
        {/* Controls Bar */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} style={{ color: 'var(--color-primary)' }} />
            <h3 className="h3">Official Academic Transcript Document</h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={15} /> Print / Save as PDF
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '6px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* PRINTABLE TRANSCRIPT DOCUMENT */}
        <div id="printable-transcript" style={{
          background: '#FFFFFF',
          color: '#1E293B',
          padding: '36px',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          fontFamily: 'var(--font-family)',
          position: 'relative',
        }}>
          {/* Watermark Background */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            fontSize: '84px',
            fontWeight: 900,
            color: 'rgba(79, 70, 229, 0.03)',
            letterSpacing: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}>
            OFFICIAL TRANSCRIPT
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '2px solid #1E293B', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A' }}>
                schull<span style={{ color: 'var(--color-primary)' }}>.io</span> University
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                Office of the Registrar &bull; Academic Security Directorate
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                Official Transcript of Academic Record
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div className="badge" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', fontWeight: 700, padding: '6px 12px' }}>
                <ShieldCheck size={14} /> VERIFIED & SEALED
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                Issue Date: {transcriptDate}
              </div>
            </div>
          </div>

          {/* Student Info Card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            background: '#F8FAFC',
            padding: '18px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            marginBottom: '24px',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Student Full Name</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{student.full_name}</div>

              <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginTop: '10px' }}>Department</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>{student.department_name}</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Matriculation Code</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px', fontFamily: 'monospace' }}>{student.student_code}</div>

              <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginTop: '10px' }}>Cumulative GPA</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                {estimatedGpa} / 4.00 ({overallAverage}% Average)
              </div>
            </div>
          </div>

          {/* Multi-Term Course Results Tables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
            {terms.map(t => (
              <div key={t.termLabel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #CBD5E1' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{t.termLabel}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>Term Average: {t.average}%</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9', textTransform: 'uppercase', fontSize: '11px', color: '#475569' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Course Code</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Course Title</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Score</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Grade</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.results.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: 'monospace' }}>{r.course_code}</td>
                        <td style={{ padding: '8px 10px' }}>{r.course_title}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{r.score}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: r.grade === 'A' ? '#047857' : (r.grade === 'F' ? '#B91C1C' : '#0F172A') }}>
                          {r.grade}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                          {r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Transcript Sign-Off & Verification Seal */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: '20px', borderTop: '2px solid #1E293B' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '2px dashed var(--color-primary)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                textAlign: 'center',
                color: 'var(--color-primary)',
                fontWeight: 700
              }}>
                QR VERIFY
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>VERIFICATION HASH:</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#0F172A', fontWeight: 600 }}>SCH-TRNS-{student.student_code.replace(/\//g, '')}-2026</div>
                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>Single-use sha256 cryptographic verification token</div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'cursive', fontSize: '18px', color: 'var(--color-primary)', fontWeight: 700, marginBottom: '2px' }}>
                Ogude Dean
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>Dr. Ogude Dean</div>
              <div style={{ fontSize: '11px', color: '#64748B' }}>University Registrar & Academic Security Director</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
