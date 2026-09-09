/**
 * ODKAZY NA PRAVNI TEXTY — jediny zdroj pravdy pro celou appku.
 *
 * Podminky a GDPR ZIJI NA VEREJNEM WEBU, ne tady. Duvod je vecny, ne
 * organizacni: clovek je cte drive, nez si zalozi ucet, takze musi byt
 * dostupne bez prihlaseni, a maji byt cteny i vyhledavaci. Tahle appka je
 * SPA — na /obchodni-podminky umela vratit jen prazdnou skorapku a od
 * zavedeni 404 stranky vraci rovnou „stranka neexistuje".
 *
 * Absolutni URL zamerne: appka bezi na app.bodyandmindon.cz, relativni
 * cesta by mirila zpatky do SPA.
 */
const WEB = 'https://bodyandmindon.cz';

export const ODKAZ_PODMINKY = `${WEB}/obchodni-podminky`;
export const ODKAZ_GDPR = `${WEB}/gdpr`;
