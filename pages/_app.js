// /pages/_app.js
import '../styles/globals.css'
import '../styles/trial-paywall.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <style jsx global>{`
        .profile-hero,
        .profile-membership-plan-card,
        .withings-body-dev,
        .profile-bubbles {
          width: min(1180px, calc(100vw - 32px)) !important;
          max-width: 1180px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
        }

        .profile-hero {
          margin-top: 0 !important;
          margin-bottom: 10px !important;
        }

        .profile-membership-plan-card {
          margin-top: 0 !important;
          margin-bottom: 14px !important;
        }

        .withings-body-dev {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          position: relative !important;
          transform: none !important;
          margin-top: 0 !important;
          margin-bottom: 14px !important;
          z-index: 2 !important;
        }

        .profile-bubbles {
          display: flex !important;
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 14px !important;
          min-height: 0 !important;
          height: auto !important;
          padding: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
          position: relative !important;
          top: auto !important;
          transform: none !important;
        }

        .profile-bubble {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          position: relative !important;
          top: auto !important;
          transform: none !important;
        }

        #muj-plan.profile-bubble {
          margin-top: 0 !important;
        }

        #profile-bubble-body-muj-plan[data-open="true"] {
          padding-top: 0 !important;
        }

        .card.plan-section,
        .plan-section {
          margin-top: 0 !important;
        }

        @media (max-width: 760px) {
          .profile-hero,
          .profile-membership-plan-card,
          .withings-body-dev,
          .profile-bubbles {
            width: min(100%, calc(100vw - 20px)) !important;
          }
        }
      `}</style>
    </>
  )
}
