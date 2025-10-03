// pages/pricing.js
import { useRouter } from 'next/router'
import Header from '../components/Header'
import Footer from '../components/Footer'

const plans = [
  { id: 'start', title: 'Start', price: 'ZDARMA',
    perks: ['1× ukázkový jídelníček + 1× trénink','Evidence váhy a měření','Základní tipy e-mailem'] },
  { id: 'individual', title: 'Individuální', price: '1 490 Kč / měsíc', recommended: true,
    perks: ['Plán na míru bez trenéra','AI jídelníček + trénink každý týden','Automatické úpravy','Tipy pro spánek, stres, regeneraci'] },
  { id: 'group', title: 'Skupina', price: '2 490 Kč / měsíc',
    perks: ['Vše z Individuálního','Skupinový trénink 1× / měs.','Přístup do komunity','Q&A s koučem'] },
  { id: 'addon', title: 'Add-on: Osobní lekce', price: '60 min = 1 190 Kč / 90 min = 1 690 Kč',
    perks: ['Doobjednej kdykoliv','Balíčky (5×,10×) – sleva','Storno do 24 h zdarma'] },
]

export default function Pricing() {
  const router = useRouter()
  const choosePlan = (id) => router.push(`/register?plan=${id}`)

  return (
    <>
      <Header />
      <main className="container">
        <h1>Ceník</h1>
        <p>Vyber plán, který ti vyhovuje. Add-ony můžeš dokoupit později.</p>

        <div className="pricing-grid">
          {plans.map(p => (
            <div key={p.id} className="card" onClick={() => choosePlan(p.id)}>
              {p.recommended && <div className="badge">Doporučeno</div>}
              <h3>{p.title}</h3>
              <p className="price">{p.price}</p>
              <ul className="perks">{p.perks.map((x,i)=><li key={i}>{x}</li>)}</ul>
              <button className="submit">Zvolit</button>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  )
}
