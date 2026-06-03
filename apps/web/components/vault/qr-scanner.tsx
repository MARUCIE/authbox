'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { Button } from '@/components/ui/button';

interface QrScannerProps {
  /** Fired once with the decoded QR text (a single otpauth:// or an otpauth-migration:// payload). */
  onResult: (text: string) => void;
  onCancel: () => void;
}

/**
 * Live camera QR scan — the web mirror of the iOS `QRScannerView`. The hard
 * part (turning the decoded string into accounts) is the proven
 * `parseOTPImport`; this component is the thin, untestable-headless camera seam
 * that yields that string. @zxing/browser wraps getUserMedia + the frame loop +
 * QR decode, so it works across browsers without a hand-rolled canvas pump.
 */
export function QrScanner({ onResult, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;

    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
        controls = ctrl;
        if (result && !done) {
          done = true;
          ctrl.stop();
          onResult(result.getText());
        }
      })
      .then((ctrl) => {
        controls = ctrl;
      })
      .catch((e: unknown) => {
        // getUserMedia rejects on denied permission, no camera, or an insecure
        // (non-HTTPS/localhost) context — surface it; the paste path still works.
        setError(
          e instanceof Error
            ? e.message
            : 'Camera unavailable. Grant camera access over HTTPS, or paste the export instead.',
        );
      });

    return () => {
      done = true;
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-2/3 w-2/3 rounded-lg border-2 border-white/70" />
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Point the camera at a service&rsquo;s 2FA QR code or a Google Authenticator
          &ldquo;Export accounts&rdquo; QR.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
