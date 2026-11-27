import type { Request, Response, Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, ensureDbReady } from '../db';
import { apiCache } from '../services/cache';
import { isOriginAllowed } from '../utils/cors';
import { DEFAULT_PROPERTY_IMAGE } from '../services/transformers';
import {
  DEFAULT_SITE_URL,
  BALI_SEO_DISTRICTS,
  slugifySeo,
  buildPropertySeoPath,
  buildDistrictSeoPath,
  resolveDistrictFromSlug,
  escapeXml,
  escapeHtml
} from '../../shared/seo';

interface SitemapPropertyRow extends RowDataPacket {
  id: string;
  name: string;
  district: string;
}

interface PrerenderPropertyRow extends RowDataPacket {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number | string;
  rating: number | string;
  image: string | null;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  totalRooms: number | string;
  occupiedRooms: number | string;
}

interface FacilityRow extends RowDataPacket {
  facility: string;
}

interface ReviewRow extends RowDataPacket {
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

/**
 * Resolves the canonical public URL safely, ignoring spoofed Host headers.
 */
export function resolveCanonicalSiteUrl(req: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const protoStr = Array.isArray(rawProto) ? rawProto[0] : String(rawProto);
  const proto = protoStr.split(',')[0].trim().toLowerCase() === 'http' ? 'http' : 'https';

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host;
  const hostStr = Array.isArray(rawHost) ? rawHost[0] : String(rawHost || '');
  const cleanHost = hostStr.split(',')[0].trim();

  if (cleanHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(cleanHost)) {
    const candidate = `${proto}://${cleanHost}`;
    const hostname = cleanHost.split(':')[0].toLowerCase();
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

    if (isOriginAllowed(candidate) && !(isProd && isLocalHost)) {
      return candidate.replace(/\/+$/, '');
    }
  }

  return DEFAULT_SITE_URL;
}

function formatIdrPlain(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

function resolvePublicImage(image: string | null | undefined): string {
  if (!image || image.trim() === '' || image.startsWith('data:')) {
    return DEFAULT_PROPERTY_IMAGE;
  }
  return image.trim();
}

export const handleRobotsTxt = (req: Request, res: Response): void => {
  const siteUrl = resolveCanonicalSiteUrl(req);
  const body = [
    '# https://www.robotstxt.org/robotstxt.html',
    'User-agent: *',
    'Allow: /',
    'Allow: /kos/',
    'Allow: /area/',
    'Allow: /api/sitemap.xml',
    'Allow: /api/seo/',
    '',
    'Disallow: /admin',
    'Disallow: /landlord',
    'Disallow: /tenant',
    'Disallow: /api/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(`${body}\n`);
};

export const handleSitemapXml = async (req: Request, res: Response): Promise<void> => {
  const siteUrl = resolveCanonicalSiteUrl(req);
  const cacheKey = `seo:sitemap:${siteUrl}`;
  const cachedXml = apiCache.get<string>(cacheKey);

  if (cachedXml) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.status(200).send(cachedXml);
    return;
  }

  let properties: SitemapPropertyRow[] = [];
  try {
    await ensureDbReady();
    const [rows] = await pool.query<SitemapPropertyRow[]>(
      'SELECT id, name, district FROM properties ORDER BY is_featured DESC, id DESC LIMIT 1000'
    );
    properties = rows;
  } catch (err: unknown) {
    console.warn('[SEO Sitemap] Fallback to static URLs because DB query failed:', err);
  }

  const today = new Date().toISOString().split('T')[0];
  const entries: Array<{ loc: string; changefreq: string; priority: string }> = [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' }
  ];

  for (const district of BALI_SEO_DISTRICTS) {
    entries.push({
      loc: `${siteUrl}${buildDistrictSeoPath(district)}`,
      changefreq: 'daily',
      priority: '0.9'
    });
  }

  for (const prop of properties) {
    entries.push({
      loc: `${siteUrl}${buildPropertySeoPath({ id: prop.id, name: prop.name })}`,
      changefreq: 'weekly',
      priority: '0.8'
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`
    ),
    '</urlset>'
  ].join('\n');

  if (properties.length > 0) {
    apiCache.set(cacheKey, xml, 300);
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.status(200).send(xml);
};

export const handleSeoPrerender = async (req: Request, res: Response): Promise<void> => {
  const siteUrl = resolveCanonicalSiteUrl(req);
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId.trim() : '';
  const districtSlug = typeof req.query.district === 'string' ? req.query.district.trim() : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');

  if (propertyId) {
    try {
      await ensureDbReady();
      const [propRows] = await pool.query<PrerenderPropertyRow[]>(
        `SELECT id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms
         FROM properties WHERE id = ? LIMIT 1`,
        [propertyId]
      );

      const prop = propRows[0];
      if (!prop) {
        res.status(404).send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Properti Tidak Ditemukan | KOSMO Bali</title>
  </head>
  <body>
    <h1>Properti Kos Tidak Ditemukan</h1>
    <p><a href="${escapeHtml(siteUrl)}/">Kembali ke Beranda KOSMO Bali</a></p>
  </body>
</html>`);
        return;
      }

      const [[facilityRows], [reviewRows]] = await Promise.all([
        pool.query<FacilityRow[]>('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]),
        pool.query<ReviewRow[]>(
          'SELECT userName, rating, comment, date FROM reviews WHERE propertyId = ? ORDER BY id DESC LIMIT 10',
          [prop.id]
        )
      ]);

      const facilities = facilityRows.map((f) => f.facility);
      const priceNum = Number(prop.price) || 0;
      const totalRooms = Number(prop.totalRooms) || 0;
      const occupiedRooms = Number(prop.occupiedRooms) || 0;
      const availableRooms = Math.max(0, totalRooms - occupiedRooms);
      const ratingNum = Number(prop.rating) || 0;
      const canonicalUrl = `${siteUrl}${buildPropertySeoPath({ id: prop.id, name: prop.name })}`;
      const districtPath = buildDistrictSeoPath(prop.district);
      const image = resolvePublicImage(prop.image);
      const title = `${prop.name} — Kos All-Inclusive di ${prop.district}, Bali | KOSMO`;
      const rawDesc =
        prop.description && prop.description.trim().length > 20
          ? prop.description.trim()
          : `Sewa ${prop.name} di ${prop.district}, Bali mulai ${formatIdrPlain(priceNum)}/bulan all-inclusive (listrik, air, WiFi cepat, keamanan) dengan kontrak digital resmi.`;
      const description = rawDesc.slice(0, 158);

      const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'LodgingBusiness',
            name: prop.name,
            description,
            url: canonicalUrl,
            image,
            address: {
              '@type': 'PostalAddress',
              streetAddress: prop.address,
              addressLocality: prop.district,
              addressRegion: 'Bali',
              addressCountry: 'ID'
            },
            ...(prop.latitude && prop.longitude
              ? {
                  geo: {
                    '@type': 'GeoCoordinates',
                    latitude: Number(prop.latitude),
                    longitude: Number(prop.longitude)
                  }
                }
              : {}),
            amenityFeature: facilities.map((fac) => ({
              '@type': 'LocationFeatureSpecification',
              name: fac,
              value: true
            })),
            makesOffer: {
              '@type': 'Offer',
              priceCurrency: 'IDR',
              price: priceNum,
              availability:
                availableRooms > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              url: canonicalUrl
            },
            ...(ratingNum > 0
              ? {
                  aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: ratingNum,
                    bestRating: 5,
                    reviewCount: Math.max(1, reviewRows.length)
                  }
                }
              : {})
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'KOSMO Bali', item: `${siteUrl}/` },
              {
                '@type': 'ListItem',
                position: 2,
                name: `Kos di ${prop.district}`,
                item: `${siteUrl}${districtPath}`
              },
              { '@type': 'ListItem', position: 3, name: prop.name, item: canonicalUrl }
            ]
          }
        ]
      };

      const serializedLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
      res.status(200).send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="KOSMO Bali Co-Living" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="place" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <script type="application/ld+json">${serializedLd}</script>
  </head>
  <body>
    <main>
      <nav aria-label="Breadcrumb">
        <a href="${escapeHtml(siteUrl)}/">KOSMO Bali</a> &gt;
        <a href="${escapeHtml(siteUrl)}${escapeHtml(districtPath)}">Kos di ${escapeHtml(prop.district)}</a> &gt;
        <span>${escapeHtml(prop.name)}</span>
      </nav>
      <h1>${escapeHtml(prop.name)} — ${escapeHtml(prop.district)}, Bali</h1>
      <p><strong>Harga All-Inclusive:</strong> ${escapeHtml(formatIdrPlain(priceNum))} / bulan (${availableRooms} kamar tersedia dari ${totalRooms})</p>
      <p><strong>Alamat:</strong> ${escapeHtml(prop.address)}</p>
      <p>${escapeHtml(rawDesc)}</p>
      <h2>Fasilitas Termasuk</h2>
      <ul>${facilities.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
      ${
        reviewRows.length > 0
          ? `<h2>Ulasan Penghuni</h2><ul>${reviewRows
              .map(
                (r) =>
                  `<li><strong>${escapeHtml(r.userName)}</strong> (${r.rating}/5): ${escapeHtml(r.comment)}</li>`
              )
              .join('')}</ul>`
          : ''
      }
    </main>
  </body>
</html>`);
      return;
    } catch (err: unknown) {
      console.warn('[SEO Prerender] Failed property prerender, falling back to listing view:', err);
    }
  }

  // Case B: District landing page or root homepage
  const matchedDistrict = resolveDistrictFromSlug(districtSlug);
  let listRows: PrerenderPropertyRow[] = [];
  try {
    await ensureDbReady();
    if (matchedDistrict) {
      const [rows] = await pool.query<PrerenderPropertyRow[]>(
        `SELECT id, name, district, address, price, rating, image, description, totalRooms, occupiedRooms
         FROM properties WHERE district = ? ORDER BY is_featured DESC, id DESC LIMIT 30`,
        [matchedDistrict]
      );
      listRows = rows;
    } else {
      const [rows] = await pool.query<PrerenderPropertyRow[]>(
        `SELECT id, name, district, address, price, rating, image, description, totalRooms, occupiedRooms
         FROM properties ORDER BY is_featured DESC, id DESC LIMIT 30`
      );
      listRows = rows;
    }
  } catch (err: unknown) {
    console.warn('[SEO Prerender] DB list query fallback:', err);
  }

  const canonicalUrl = matchedDistrict
    ? `${siteUrl}${buildDistrictSeoPath(matchedDistrict)}`
    : `${siteUrl}/`;
  const title = matchedDistrict
    ? `Sewa Kos & Co-Living di ${matchedDistrict}, Bali All-Inclusive | KOSMO`
    : 'KOSMO Bali — Sewa Kos & Co-Living Bulanan All-Inclusive di Bali';
  const description = matchedDistrict
    ? `Temukan kos eksklusif & coliving bulanan all-inclusive di ${matchedDistrict}, Bali. Harga transparan termasuk listrik, air PDAM, WiFi cepat, kontrak digital resmi UU ITE.`
    : 'Platform sewa kos & co-living bulanan all-inclusive terbaik di Bali (Jimbaran, Canggu, Seminyak, Ubud, Denpasar) dengan kontrak digital resmi dan pembayaran instan.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'KOSMO Bali',
        url: `${siteUrl}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/area/{search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl
      },
      {
        '@type': 'ItemList',
        itemListElement: listRows.map((p, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${siteUrl}${buildPropertySeoPath({ id: p.id, name: p.name })}`,
          name: p.name
        }))
      }
    ]
  };

  const serializedLd = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  res.status(200).send(`<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="geo.region" content="ID-BA" />
    <meta name="geo.placename" content="Bali, Indonesia" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:site_name" content="KOSMO Bali Co-Living" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(DEFAULT_PROPERTY_IMAGE)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <script type="application/ld+json">${serializedLd}</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <section>
        <h2>Daftar Kos & Co-Living Pilihan</h2>
        <ul>
          ${listRows
            .map(
              (p) =>
                `<li><a href="${escapeHtml(siteUrl)}${escapeHtml(buildPropertySeoPath({ id: p.id, name: p.name }))}">${escapeHtml(p.name)} — ${escapeHtml(p.district)} (${escapeHtml(formatIdrPlain(Number(p.price) || 0))}/bulan)</a></li>`
            )
            .join('\n          ')}
        </ul>
      </section>
      <section>
        <h2>Area Populer di Bali</h2>
        <ul>
          ${BALI_SEO_DISTRICTS.map(
            (d) =>
              `<li><a href="${escapeHtml(siteUrl)}/area/${escapeHtml(slugifySeo(d))}">Kos di ${escapeHtml(d)}</a></li>`
          ).join('\n          ')}
        </ul>
      </section>
    </main>
  </body>
</html>`);
};

export function registerSeoRoutes(router: Router): void {
  router.get('/robots.txt', handleRobotsTxt);
  router.get('/sitemap.xml', handleSitemapXml);
  router.get('/seo/prerender', handleSeoPrerender);
}
