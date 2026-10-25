// Where is the ship, in words: the named sea plus the nearest port
// (Jose, 25 Oct 2026: "Bohai Sea, near Dalian", not "near China / Korea / Japan").
// Used by the portal and the WhatsApp assistant.

// Named seas and straits on JDS's routes, smallest first: the first box that
// holds the position wins. [name, latMin, latMax, lonMin, lonMax]
const SEAS = [
  // narrow passages first
  ['Suez Canal', 29.8, 31.35, 32.2, 32.65],
  ['Strait of Hormuz', 25.8, 27.2, 55.6, 57.2],
  ['Bab-el-Mandeb Strait', 12.2, 13.4, 42.9, 43.8],
  ['Singapore Strait', 1.0, 1.5, 103.4, 104.6],
  ['Strait of Gibraltar', 35.7, 36.2, -6.1, -5.2],
  ['Taiwan Strait', 22.5, 25.8, 118.0, 121.0],
  ['Korea Strait', 33.2, 35.3, 127.6, 130.4],
  ['Palk Strait', 9.0, 10.5, 78.8, 80.4],
  ['Gulf of Mannar', 7.8, 9.3, 77.8, 79.9],
  ['Malacca Strait', 1.2, 6.8, 95.8, 103.4],
  // China, Korea, Japan
  ['Bohai Sea', 37.0, 41.0, 117.5, 122.3],
  ['Yellow Sea', 31.5, 39.8, 119.5, 126.8],
  ['East China Sea', 23.5, 33.3, 117.0, 131.0],
  ['Sea of Japan', 33.5, 52.0, 127.0, 142.0],
  ['Seto Inland Sea', 33.5, 34.8, 130.8, 135.4],
  ['Pacific Ocean, off Japan', 24.0, 45.0, 131.0, 150.0],
  ['Philippine Sea', 5.0, 24.0, 121.0, 135.0],
  // South-East Asia
  ['Gulf of Thailand', 5.5, 13.8, 99.0, 105.0],
  ['South China Sea', 0.0, 23.5, 105.0, 121.0],
  ['Java Sea', -8.0, -2.5, 105.5, 118.0],
  ['Andaman Sea', 5.0, 17.0, 92.0, 98.8],
  // India and around
  ['Bay of Bengal', 5.0, 23.0, 80.0, 92.0],
  ['Laccadive Sea', 5.5, 14.0, 71.5, 79.95],
  ['Gulf of Khambhat', 20.5, 22.4, 71.8, 73.0],
  ['Gulf of Kutch', 22.3, 23.1, 68.5, 70.6],
  ['Arabian Sea', 5.0, 25.5, 55.0, 77.0],
  // Gulf, Red Sea
  ['Gulf of Oman', 22.0, 26.0, 56.5, 61.8],
  ['Persian Gulf', 23.5, 30.5, 47.5, 56.6],
  ['Gulf of Aden', 10.5, 15.0, 43.0, 51.5],
  ['Red Sea', 12.5, 30.0, 32.0, 43.6],
  ['Gulf of Suez', 27.5, 29.9, 32.3, 33.9],
  // Europe and Africa
  ['Aegean Sea', 35.0, 41.0, 22.5, 28.5],
  ['Adriatic Sea', 40.0, 45.8, 12.2, 19.8],
  ['Mediterranean Sea', 30.0, 46.0, -6.0, 36.5],
  ['English Channel', 48.5, 51.2, -5.8, 2.0],
  ['North Sea', 51.0, 61.0, -4.0, 9.5],
  ['Mozambique Channel', -26.0, -10.5, 32.5, 49.0],
  // oceans last
  ['Indian Ocean', -45.0, 25.0, 20.0, 115.0],
  ['Atlantic Ocean', -60.0, 70.0, -80.0, 20.0],
  ['Pacific Ocean', -60.0, 65.0, 115.0, 180.0],
  ['Pacific Ocean', -60.0, 65.0, -180.0, -80.0],
]

// Ports and coastal towns a ship passes, for "near …" [name, lat, lon]
const PLACES = [
  // China
  ['Tianjin', 38.98, 117.78], ['Caofeidian', 38.95, 118.5], ['Qinhuangdao', 39.92, 119.6], ['Huludao', 40.7, 120.95],
  ['Yingkou', 40.65, 122.2], ['Dalian', 38.92, 121.63], ['Yantai', 37.55, 121.4], ['Weihai', 37.5, 122.12],
  ['Qingdao', 36.07, 120.32], ['Rizhao', 35.38, 119.55], ['Lianyungang', 34.74, 119.45], ['Shanghai', 31.23, 121.8],
  ['Ningbo', 29.87, 121.85], ['Wenzhou', 27.95, 120.9], ['Fuzhou', 26.0, 119.6], ['Xiamen', 24.45, 118.07],
  ['Shantou', 23.35, 116.7], ['Hong Kong', 22.29, 114.17], ['Shekou', 22.48, 113.91], ['Nansha', 22.65, 113.65],
  ['Zhanjiang', 21.2, 110.4], ['Haikou', 20.05, 110.3], ['Beihai', 21.45, 109.1],
  // Taiwan, Korea, Japan
  ['Keelung', 25.15, 121.75], ['Taipei', 25.15, 121.4], ['Kaohsiung', 22.6, 120.28],
  ['Incheon', 37.45, 126.6], ['Gunsan', 35.98, 126.6], ['Mokpo', 34.78, 126.38], ['Jeju', 33.5, 126.53],
  ['Gwangyang', 34.9, 127.7], ['Busan', 35.1, 129.04], ['Ulsan', 35.5, 129.38],
  ['Fukuoka', 33.6, 130.4], ['Kitakyushu', 33.9, 130.9], ['Kobe', 34.68, 135.2], ['Osaka', 34.65, 135.43],
  ['Nagoya', 35.05, 136.85], ['Tokyo', 35.6, 139.8], ['Yokohama', 35.45, 139.65], ['Niigata', 37.95, 139.05],
  ['Okinawa', 26.2, 127.68], ['Maizuru', 35.48, 135.38], ['Toyama', 36.77, 137.2], ['Akita', 39.75, 140.05], ['Vladivostok', 43.1, 131.9],
  // South-East Asia
  ['Manila', 14.6, 120.95], ['Hai Phong', 20.85, 106.75], ['Da Nang', 16.07, 108.22], ['Qui Nhon', 13.77, 109.23],
  ['Vung Tau', 10.35, 107.07], ['Ho Chi Minh City', 10.77, 106.7], ['Sihanoukville', 10.63, 103.5],
  ['Laem Chabang', 13.08, 100.88], ['Bangkok', 13.7, 100.57], ['Songkhla', 7.2, 100.6], ['Kota Kinabalu', 5.98, 116.07],
  ['Kuching', 1.56, 110.35], ['Singapore', 1.26, 103.83], ['Tanjung Pelepas', 1.36, 103.55], ['Port Klang', 3.0, 101.38],
  ['Penang', 5.4, 100.35], ['Port Dickson', 2.52, 101.8], ['Belawan', 3.78, 98.7], ['Phuket', 7.88, 98.4],
  ['Jakarta', -6.1, 106.88], ['Semarang', -6.95, 110.42], ['Surabaya', -7.2, 112.73], ['Yangon', 16.77, 96.17],
  ['Great Nicobar', 7.0, 93.85], ['Port Blair', 11.67, 92.75],
  // Bangladesh, India, Sri Lanka, Pakistan
  ['Chittagong', 22.3, 91.8], ['Kolkata', 22.0, 88.1], ['Haldia', 22.03, 88.06], ['Paradip', 20.26, 86.67],
  ['Visakhapatnam', 17.69, 83.3], ['Kakinada', 16.95, 82.28], ['Krishnapatnam', 14.25, 80.13], ['Chennai', 13.1, 80.3],
  ['Puducherry', 11.93, 79.84], ['Nagapattinam', 10.77, 79.85], ['Tuticorin', 8.76, 78.2], ['Kanyakumari', 8.08, 77.55],
  ['Vizhinjam', 8.38, 76.99], ['Kochi', 9.97, 76.25], ['Kozhikode', 11.25, 75.77], ['Mangaluru', 12.92, 74.8],
  ['Karwar', 14.8, 74.12], ['Goa', 15.41, 73.8], ['Ratnagiri', 17.0, 73.28], ['Nhava Sheva', 18.95, 72.95],
  ['Mumbai', 18.93, 72.84], ['Dahanu', 19.97, 72.72], ['Hazira', 21.1, 72.65], ['Pipavav', 20.9, 71.5],
  ['Veraval', 20.9, 70.37], ['Porbandar', 21.63, 69.6], ['Okha', 22.47, 69.07], ['Mundra', 22.74, 69.7],
  ['Kandla', 23.0, 70.22], ['Karachi', 24.8, 66.98], ['Gwadar', 25.12, 62.33],
  ['Colombo', 6.95, 79.84], ['Galle', 6.03, 80.22], ['Hambantota', 6.12, 81.11], ['Trincomalee', 8.57, 81.23],
  ['Malé', 4.18, 73.51], ['Lakshadweep', 10.57, 72.64],
  // Gulf, Arabia, Red Sea
  ['Jebel Ali', 25.01, 55.06], ['Dubai', 25.27, 55.29], ['Abu Dhabi', 24.5, 54.37], ['Khor Fakkan', 25.35, 56.36],
  ['Fujairah', 25.12, 56.35], ['Bandar Abbas', 27.15, 56.2], ['Dammam', 26.5, 50.2], ['Hamad (Doha)', 25.0, 51.6],
  ['Kuwait', 29.35, 47.93], ['Umm Qasr', 30.03, 47.95], ['Sohar', 24.5, 56.62], ['Muscat', 23.62, 58.57],
  ['Duqm', 19.67, 57.7], ['Salalah', 16.95, 54.0], ['Socotra', 12.5, 54.0], ['Aden', 12.79, 44.98],
  ['Djibouti', 11.6, 43.13], ['Berbera', 10.44, 45.01], ['Hodeidah', 14.8, 42.93], ['Jeddah', 21.48, 39.17],
  ['Port Sudan', 19.6, 37.23], ['Yanbu', 24.08, 38.05], ['Aqaba', 29.5, 35.0], ['Suez', 29.95, 32.55],
  ['Port Said', 31.25, 32.3],
  // Mediterranean, Europe
  ['Alexandria', 31.2, 29.88], ['Haifa', 32.82, 35.0], ['Mersin', 36.78, 34.63], ['Limassol', 34.65, 33.03],
  ['Piraeus', 37.94, 23.62], ['Istanbul', 41.0, 28.98], ['Izmir', 38.43, 27.13], ['Malta', 35.82, 14.53],
  ['Gioia Tauro', 38.45, 15.9], ['Naples', 40.84, 14.26], ['Genoa', 44.4, 8.92], ['Trieste', 45.65, 13.77],
  ['Marseille', 43.3, 5.35], ['Barcelona', 41.35, 2.17], ['Valencia', 39.45, -0.32], ['Algeciras', 36.13, -5.43],
  ['Tanger Med', 35.88, -5.5], ['Lisbon', 38.7, -9.15], ['Le Havre', 49.48, 0.1], ['Rotterdam', 51.95, 4.05],
  ['Antwerp', 51.27, 4.33], ['Hamburg', 53.54, 9.97], ['Felixstowe', 51.95, 1.32], ['Southampton', 50.9, -1.4],
  // Africa
  ['Mombasa', -4.06, 39.67], ['Dar es Salaam', -6.82, 39.3], ['Port Louis', -20.16, 57.5], ['Durban', -29.87, 31.03],
  ['Cape Town', -33.9, 18.43], ['Lagos', 6.44, 3.4], ['Tema', 5.63, 0.0], ['Abidjan', 5.3, -4.0],
  // Americas
  ['New York', 40.67, -74.04], ['Savannah', 32.08, -81.1], ['Houston', 29.73, -95.0], ['Panama Canal', 9.1, -79.7],
  ['Los Angeles', 33.73, -118.26], ['Santos', -23.96, -46.3],
]

const toRad = (d) => (d * Math.PI) / 180
export function kmBetween(a, b) {
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

const NEAR_KM = 150 // "near Dalian"
const FROM_KM = 700 // "380 km from Chennai"; further out: only the sea's name

// "Bohai Sea, near Dalian" · "Bay of Bengal, 380 km from Chennai" · "Indian Ocean"
export function seaArea(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  const sea = SEAS.find(([, la1, la2, lo1, lo2]) => lat >= la1 && lat <= la2 && lon >= lo1 && lon <= lo2)?.[0] || 'At sea'
  let best = null
  for (const [name, la, lo] of PLACES) {
    const km = kmBetween([lat, lon], [la, lo])
    if (!best || km < best.km) best = { name, km }
  }
  if (!best || best.km > FROM_KM) return sea
  if (best.km <= 12) return `${sea}, at ${best.name}`
  if (best.km <= NEAR_KM) return `${sea}, near ${best.name}`
  return `${sea}, ${Math.round(best.km / 10) * 10} km from ${best.name}`
}
