import { useEffect, useRef } from 'react';

const STRIPE_SCRIPT = 'https://js.stripe.com/v3/pricing-table.js';

export default function PricingTable() {
  const containerRef = useRef(null);

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    'pk_test_51T7PxYPTu5plCL9P4KDRUIyryyHN4OKl976aR2tODDpFI0vqjJ5nvBUiHVV3gUxmZp6DmrIqR9GnsvMbSJstaXFq00tzAEIQ4w';
  const pricingTableId =
    process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
    'prctbl_1T7jsPPTu5plCL9PZeP3DcCi';

  useEffect(() => {
    if (!containerRef.current || !publishableKey || !pricingTableId) return;

    const existing = document.querySelector('script[src="' + STRIPE_SCRIPT + '"]');
    const init = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      const el = document.createElement('stripe-pricing-table');
      el.setAttribute('pricing-table-id', pricingTableId);
      el.setAttribute('publishable-key', publishableKey);
      containerRef.current.appendChild(el);
    };

    if (existing) {
      init();
      return;
    }

    const script = document.createElement('script');
    script.src = STRIPE_SCRIPT;
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
    return () => script.remove();
  }, [publishableKey, pricingTableId]);

  return (
    <div
      ref={containerRef}
      className="stripe-pricing-table-wrap"
      style={{ maxWidth: '900px', margin: '0 auto', minHeight: '200px' }}
    />
  );
}
