import { useState, useRef, useEffect } from 'react';

export function useScrollClickwrap(showContract: boolean) {
  const termsContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState<boolean>(false);
  const [affirmativeConsent, setAffirmativeConsent] = useState<boolean>(false);
  const [scrollError, setScrollError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    if (showContract) {
      setHasScrolledToBottom(false);
      setAffirmativeConsent(false);
      setScrollError(null);
      setConsentError(null);

      // Check if container already fits within view without scrolling
      const timer = setTimeout(() => {
        if (termsContainerRef.current) {
          const el = termsContainerRef.current;
          if (el.scrollHeight <= el.clientHeight + 15) {
            setHasScrolledToBottom(true);
          }
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [showContract]);

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 10) {
      setHasScrolledToBottom(true);
      setScrollError(null);
    }
  };

  return {
    termsContainerRef,
    hasScrolledToBottom,
    setHasScrolledToBottom,
    affirmativeConsent,
    setAffirmativeConsent,
    scrollError,
    setScrollError,
    consentError,
    setConsentError,
    handleTermsScroll
  };
}
