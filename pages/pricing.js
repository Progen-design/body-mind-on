import Head from "next/head";
import Pricing from "@/components/Pricing";

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>Ceník – Body & Mind ON</title>
        <meta name="description" content="Ceník plánů Body & Mind ON – AI jídelníček, tréninky, koučink." />
      </Head>
      <main className="min-h-screen bg-[#111] text-white">
        <Pricing />
      </main>
    </>
  );
}
