import { useState, useEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function Home() {
  const [showIntro, setShowIntro] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const videoDuration = 25; // délka videa v sekundách

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), (videoDuration - 3) * 1000);
    const hideTimer = setTimeout(() => setShowIntro(false), videoDuration * 1000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const skipIntro = () => {
    setFadeOut(true);
    setTimeout(() => setShowIntro(false), 1000);
  };

  return (
    <>
      {/* Úvodní video HeyGen */}
      {showIntro && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "#000",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            opacity: fadeOut ? 0 : 1,
            transition: "opacity 1.5s ease-in-out",
          }}
        >
          <iframe
            src="https://app.heygen.com/embedded-player/655e8d7c84404b748d39a97149c0d9d4?autoplay=1&muted=1"
            allow="autoplay; encrypted-media;"
            allowFullScreen
            style={{
              width: "380px",
              height: "680px",
              border: "none",
              borderRadius: "10px",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          ></iframe>

          {/* Tlačítko pro přeskočení intro */}
          <button
            onClick={skipIntro}
            style={{
              position: "absolute",
              bottom: "40px",
              right: "40px",
              backgroundColor: "rgba(255,255,255,0.2)",
              color: "#fff",
              border: "1px solid #fff",
              borderRadius: "6px",
              padding: "10px 20px",
              cursor: "pointer",
              fontSize: "16px",
              transition: "background 0.3s ease",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "rgba(255,255,255,0.4)")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "rgba(255,255,255,0.2)")}
          >
            Přeskočit intro
          </button>
        </div>
      )}

      {/* Web se zobrazí po skončení */}
      <Header />
      <main className="container">
        <section className="hero">
          <div>
            <h1>Body & Mind ON</h1>
            <p>
              Kompletní systém pro <strong>silné tělo</strong>, více energie a pevné sebevědomí.
            </p>
          </div>
        </section>

        {/* Zbytek tvého webu */}
      </main>
      <Footer />
    </>
  );
}
