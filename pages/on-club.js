// /pages/on-club.js – Registrace ON Club (samostatná stránka, nezávislá na VIP)
import Header from "../components/Header";
import Footer from "../components/Footer";
import ClubRegistrationForm from "../components/ClubRegistrationForm";

export default function OnClubPage() {
  return (
    <>
      <Header />
      <main className="container py-12 text-white">
        <section className="text-center mb-10">
          <h1 className="text-4xl font-extrabold mb-3 text-cyan-400">
            ON Club – Tvůj osobní AI trenér vždy po ruce
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Vše ze START + osobní AI trenér 24/7, adaptivní plán dle výsledků, motivační komunita a video konzultace s experty.
          </p>
        </section>
        <ClubRegistrationForm />
      </main>
      <Footer />
    </>
  );
}
