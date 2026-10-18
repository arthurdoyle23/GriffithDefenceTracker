// Short codes and flag images for delivering partners. Partners without a flag show their code instead.

const PARTNERS = {
  'Australia': { code: 'AUS', flag: 'Australia.png' },
  'United States of America': { code: 'USA', flag: 'USA.png', short: 'United States' },
  'New Zealand': { code: 'NZL', flag: 'NewZealand.png' },
  'China': { code: 'CHN', flag: 'China.png' },
  'France': { code: 'FRA', flag: 'France.png' },
  'United Kingdom': { code: 'GBR', flag: 'UK.png' },
  'Japan': { code: 'JPN', flag: 'Japan.png' },
  'Indonesia': { code: 'IDN', flag: 'Indonesia.png' },
  'Fiji': { code: 'FJI', flag: 'Fiji.png' },
  'Canada': { code: 'CAN', flag: 'Canada.png' },
  'Papua New Guinea': { code: 'PNG', flag: 'PapuaNewGuinea.png' },
  'Republic of Korea': { code: 'KOR', flag: 'SouthKorea.png', short: 'South Korea' },
  'Tonga': { code: 'TON', flag: 'Tonga.svg.png' },
  'Chile': { code: 'CHL', flag: 'Chile.png' },
  'Netherlands': { code: 'NLD', flag: 'Netherlands.png' },
  'Nepal': { code: 'NPL', flag: 'Nepal.png' },
  'United Nations': { code: 'UN', flag: 'UN.png' },
  'India': { code: 'IND', flag: 'India.png' },
  'Vatican City': { code: 'VAT', flag: 'VaticanCity.png' },
  'Germany': { code: 'DEU', flag: 'Germany.png' },
  'Philippines': { code: 'PHL', flag: 'Philippines.png' },
  'Solomon Islands': { code: 'SLB' },
  'Vanuatu': { code: 'VUT' },
};

export function partnerInfo(name) {
  const p = PARTNERS[name] ?? {};
  return {
    code: p.code ?? name.slice(0, 3).toUpperCase(),
    short: p.short ?? name,
    flag: p.flag ? `${import.meta.env.BASE_URL}icons/${p.flag}` : null,
  };
}
