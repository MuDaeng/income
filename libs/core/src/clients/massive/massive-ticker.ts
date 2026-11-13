/**
 * Toss 심볼(Security.symbol)을 Massive 티커로. 우선주 표기만 다름: Toss 'BAC-P' → Massive 'BACpP'.
 * 그 밖의 표기('BRK.B' 등)는 같음
 */
export const toMassiveTicker = (symbol: string) =>
  symbol.replace(/-([A-Z]+)$/, 'p$1');
