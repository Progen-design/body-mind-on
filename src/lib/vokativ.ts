// 5. pád jmen — logika žije ve sdíleném `lib/vokativ.js` (používá ji i server,
// e-mail s připomínkou). Tady jen re-export pro appku.
export { vokativ, prvniSlovo, urciOsloveni } from '../../lib/vokativ.js';
