/**
 * iOS-safe blob download helper.
 *
 * iPad/iPhone Safari resolves blob URLs asynchronously, so revoking the
 * object URL immediately after `a.click()` cancels the download before it
 * starts. We keep the URL alive for a grace period and, on iOS, also give
 * the browser a `target="_blank"` anchor, which Safari handles more
 * reliably for large blobs.
 */

export const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as macOS — detect via touch points.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  if (isIOSDevice()) {
    a.target = "_blank";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revocation: iOS Safari cancels the download if the blob URL is
  // revoked before it has started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
