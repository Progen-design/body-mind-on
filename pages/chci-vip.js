// /pages/chci-vip.js – Registrace VIP Coaching (samostatná stránka, nezávislá na ON Club)
import Header from "../components/Header";
import Footer from "../components/Footer";
import VipRegistrationForm from "../components/VipRegistrationForm";

export default function ChciVipPage() {
  return (
    <>
      <Header />
      <main className="container py-12 text-white">
        <section className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-3 text-violet-400">
            VIP Coaching – Luxusní péče pro ty, co chtějí víc
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Vše z ON Club + elitní lidský kouč, strategie šitá na míru, týdenní 1:1 video konzultace a prioritní podpora.
          </p>
        </section>
        <VipRegistrationForm />
      </main>
      <Footer />
    </>
  );
}
