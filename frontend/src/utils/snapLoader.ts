export function getSnapScriptUrl(): string {
  const isProduction = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true';
  return isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

export function loadSnapSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return resolve();
    }
    if (window.snap) {
      return resolve();
    }

    const scriptUrl = getSnapScriptUrl();
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY || '';

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="/snap/snap.js"]'
    );

    if (existingScript) {
      if (existingScript.src === scriptUrl && window.snap) {
        return resolve();
      }
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'midtrans-snap-sdk';
    script.type = 'text/javascript';
    script.src = scriptUrl;
    if (clientKey) {
      script.setAttribute('data-client-key', clientKey);
    }
    script.onload = () => resolve();
    script.onerror = (err) =>
      reject(new Error(`Gagal memuat Midtrans Snap SDK (${scriptUrl}): ${String(err)}`));
    document.head.appendChild(script);
  });
}
