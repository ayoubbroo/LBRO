import 'dotenv/config'
import { createRequire } from 'node:module'
const { PrismaClient } = createRequire(import.meta.url)('@prisma/client')
const p = new PrismaClient()

// slug, FR name, AR name, EN name, lat, lng
const cities: [string, string, string, string, number, number][] = [
  ['casablanca', 'Casablanca', 'الدار البيضاء', 'Casablanca', 33.5731, -7.5898],
  ['rabat', 'Rabat', 'الرباط', 'Rabat', 34.0209, -6.8416],
  ['marrakech', 'Marrakech', 'مراكش', 'Marrakesh', 31.6295, -7.9811],
  ['fes', 'Fès', 'فاس', 'Fez', 34.0331, -5.0003],
  ['meknes', 'Meknès', 'مكناس', 'Meknes', 33.8935, -5.5473],
  ['tanger', 'Tanger', 'طنجة', 'Tangier', 35.7595, -5.834],
  ['agadir', 'Agadir', 'أكادير', 'Agadir', 30.4278, -9.5981],
  ['oujda', 'Oujda', 'وجدة', 'Oujda', 34.6867, -1.9114],
  ['kenitra', 'Kénitra', 'القنيطرة', 'Kenitra', 34.261, -6.5802],
  ['tetouan', 'Tétouan', 'تطوان', 'Tetouan', 35.5785, -5.3684],
  ['safi', 'Safi', 'آسفي', 'Safi', 32.2994, -9.2372],
]
// Pre-existing cities (El Jadida, Béni Mellal) are left untouched: no data is deleted.
for (const [slug, name, nameAr, nameEn, lat, lng] of cities) {
  const existing = (await p.city.findUnique({ where: { name } })) ?? (await p.city.findUnique({ where: { slug } }))
  if (existing) await p.city.update({ where: { id: existing.id }, data: { slug: existing.slug ?? slug, nameAr, nameEn } })
  else await p.city.create({ data: { name, slug, nameAr, nameEn, lat, lng } })
}
// Opt-in demo data only (clearly flagged isDemo + source DEMO, excluded from hotspots).
if (process.env.SEED_DEMO === 'true') {
  for (const c of await p.city.findMany()) {
    if (!(await p.incident.count({ where: { cityId: c.id, isDemo: true } })))
      await p.incident.create({ data: { type: 'pothole', latitude: c.lat + 0.004, longitude: c.lng + 0.004, description: 'DEMO', isDemo: true, source: 'DEMO', cityId: c.id, expiresAt: new Date(Date.now() + 30 * 864e5) } })
  }
}
console.log('seeded cities' + (process.env.SEED_DEMO === 'true' ? ' + demo incidents (flagged isDemo)' : ''))
await p.$disconnect()
