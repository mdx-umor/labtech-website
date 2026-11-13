// Company details in one place — edit here, the page updates everywhere.
export const COMPANY = {
  name: 'Labtech Ltd.',
  address: 'MEEM, 4th & 5th Floor\nHouse # 18, Road # 12, Sector 6\nUttara, Dhaka 1230, Bangladesh',
  phone: '+880 1701 206400',
  email: 'l.russel@labtech-bd.com',
  facebook: 'https://www.facebook.com/labtechlimited/',
};

// [name, description, longitude, latitude, label offset x, y, headquarters?]
export const SITES = [
  ['Dhaka, Bangladesh', 'Labtech Ltd. — laboratory & inspection centre', 90.41, 23.81, 12, -14, true],
  ['Quakenbrück, Germany', 'Sister laboratory — Labtech Prüfungsgesellschaft mbH', 7.95, 52.68, 12, -10],
  ['India', 'On-site inspections', 78.0, 21.5, -12, 5],
  ['Myanmar', 'On-site inspections', 96.2, 17.5, 12, 16],
  ['China', 'On-site inspections', 113.5, 29.5, 12, -10],
];

export const TICKER = [
  'ISO/IEC 17025:2017', 'ISO/IEC 17020:2012 TYPE A', 'ISO 2859-1 AQL', 'EN 71-1 · 71-2 · 71-3', 'ISO 6330 WASHING',
  'ISO 13934-1 TENSILE', 'ISO 12947 MARTINDALE', 'ISO 105 COLOUR FASTNESS', 'EN ISO 14362 AZO DYES', 'ISO 14389 PHTHALATES',
  'EN 16732 ZIPPERS', 'ISO 17075 CHROMIUM VI', 'DIN 53160 SALIVA & PERSPIRATION',
];

export const REQUEST = {
  product: ['Textile / fabric', 'Garments', 'Leather', 'Shoes', 'Bags', 'Toys'],
  service: ['Physical testing', 'Chemical testing', 'Inline inspection', 'Final random inspection', 'Loading check'],
  market: ['EU', 'UK', 'USA', 'Other'],
};
