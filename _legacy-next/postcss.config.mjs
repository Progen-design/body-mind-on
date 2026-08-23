/**
 * Tailwind se do téhle aplikace přidává PŘÍRŮSTKOVĚ.
 *
 * Profil i zbytek appky stojí na styled-jsx a na `styles/globals.css`
 * (~4000 řádků jen v pages/profil.js). Tailwind je proto zapojený tak, aby
 * generoval POUZE utility třídy — bez Preflightu, což je jeho globální reset.
 * Preflight by přepsal výchozí styly všech elementů v celé aplikaci a rozbil
 * by vzhled stránek, kterých se nový design vůbec netýká.
 *
 * Kde se to nastavuje: styles/globals.css importuje jen vrstvy `theme`
 * a `utilities`, ne `preflight`.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
