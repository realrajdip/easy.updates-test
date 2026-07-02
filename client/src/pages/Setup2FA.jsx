import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Copy, Check, Printer, ShieldAlert, ArrowRight, ShieldCheck } from 'lucide-react';
import OTPInput from '../components/OTPInput';

const Setup2FA = ({ setupData }) => {
  const { verify2fa } = useAuth();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!setupData) return null;
  const { qrCode, secret, backupCodes = [] } = setupData;

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const res = await verify2fa(code);
    if (!res.success) setError(res.message);
  };

  return (
    <div className="relative min-h-screen bg-canvas text-ink overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-1/4 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #6a4cf5 0%, transparent 65%)' }}
      />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[640px] surface-1 rounded-xxl p-7 flex flex-col gap-6 animate-scale-in border border-hairline-soft">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-pill bg-surface-2 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-[12px] uppercase tracking-[0.18em] text-ink-dim">
                Two-factor setup
              </p>
              <h2 className="display-md">Lock down your account</h2>
            </div>
          </div>

          {error && (
            <div className="banner-error">
              <ShieldAlert className="h-4 w-4 mt-[2px] flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
            {/* QR */}
            <div className="flex flex-col items-center gap-3">
              <Step n={1} title="Scan QR" />
              <div className="bg-white p-3 rounded-md">
                <img src={qrCode} alt="2FA QR code" className="w-[160px] h-[160px]" />
              </div>
              <div className="text-center w-full">
                <p className="text-[10px] uppercase tracking-[0.16em] text-ink-dim mb-1">
                  Secret key
                </p>
                <code className="text-[11px] font-mono text-ink break-all select-all block surface-2 px-2 py-2 rounded-sm">
                  {secret}
                </code>
              </div>
            </div>

            {/* Backup codes */}
            <div className="flex flex-col gap-3">
              <Step n={2} title="Save recovery codes" />
              <p className="text-[13px] text-ink-muted tracking-tight">
                Single-use codes that bypass 2FA if your device is lost. Print them or
                store them somewhere safe.
              </p>
              <div className="surface-2 p-4 rounded-md grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[12px] select-all">
                {backupCodes.map((bc, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-[10px] text-ink-dim w-4">{idx + 1}.</span>
                    <span className="text-ink">{bc}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopyCodes} className="btn btn-secondary btn-sm flex-1">
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
                <button onClick={() => window.print()} className="btn btn-secondary btn-sm flex-1">
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
              </div>
            </div>
          </div>

          {/* Verify */}
          <form onSubmit={handleVerify} className="flex flex-col gap-3 border-t border-hairline-soft pt-6">
            <Step n={3} title="Enter the current 6-digit code" />
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex justify-center">
                <OTPInput
                  length={6}
                  value={code}
                  onChange={(val) => setCode(val)}
                />
              </div>
              <button type="submit" className="btn btn-primary px-6">
                Enable 2FA
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const Step = ({ n, title }) => (
  <div className="flex items-center gap-2">
    <span className="w-5 h-5 rounded-full bg-surface-2 text-accent text-[11px] font-bold flex items-center justify-center">
      {n}
    </span>
    <span className="text-[13px] tracking-tight text-ink">{title}</span>
  </div>
);

export default Setup2FA;
