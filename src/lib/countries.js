// Country list for the RFQ nationality field.
//
// Names are derived from ISO 3166-1 alpha-2 codes via Intl.DisplayNames, which
// every browser we target ships natively — so this costs no bundle weight and
// stays correctly spelled and localised without a dependency. Older engines
// without Intl.DisplayNames fall back to the raw code, which is still a valid,
// unambiguous value rather than a blank option.

const CODES = [
  "AF","AL","DZ","AD","AO","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY",
  "BE","BZ","BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI","KH","CM","CA",
  "CV","CF","TD","CL","CN","CO","KM","CG","CD","CR","CI","HR","CU","CY","CZ",
  "DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FJ","FI","FR",
  "GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY","HT","HN","HU","IS",
  "IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KW","KG",
  "LA","LV","LB","LS","LR","LY","LI","LT","LU","MG","MW","MY","MV","ML","MT",
  "MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM","NA","NR","NP",
  "NL","NZ","NI","NE","NG","KP","MK","NO","OM","PK","PW","PS","PA","PG","PY",
  "PE","PH","PL","PT","QA","RO","RU","RW","KN","LC","VC","WS","SM","ST","SA",
  "SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA","KR","SS","ES","LK","SD",
  "SR","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM",
  "TV","UG","UA","AE","GB","US","UY","UZ","VU","VA","VE","VN","YE","ZM","ZW",
];

function nameFor(code) {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

// [{ code, name }], alphabetical by display name.
export const COUNTRIES = CODES
  .map(code => ({ code, name: nameFor(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
