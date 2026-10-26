export function isProductionMidtrans(): boolean {
  if (import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true') {
    return true;
  }
  const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
  if (typeof clientKey === 'string' && clientKey.startsWith('Mid-client-')) {
    return true;
  }
  return false;
}

export function getSnapScriptUrl(): string {
  return isProductionMidtrans()
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

export function loadSnapSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
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
      if (existingScript.src !== scriptUrl) {
        existingScript.remove();
        delete (window as unknown as { snap?: unknown }).snap;
      } else {
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', (e) => reject(e));
        return;
      }
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
