(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
const { default: app } = await import('../backend/server');
import { initDb, seedDatabase } from '../backend/db';

test('SEO Infrastructure Suite (robots.txt, dynamic sitemap.xml, crawler prerender & Host guard)', async (t) => {
  await initDb();
  await seedDatabase();

  let server: http.Server;
  let baseUrl: string;

  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  await t.test('GET /robots.txt & /api/robots.txt expose sitemap and block private dashboards', async () => {
    for (const path of ['/robots.txt', '/api/robots.txt']) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/plain/i);
      const body = await res.text();
      assert.match(body, /Disallow:\s*\/admin/);
      assert.match(body, /Disallow:\s*\/landlord/);
      assert.match(body, /Disallow:\s*\/tenant/);
      assert.match(body, /Sitemap:\s*https:\/\/www\.kosmobali\.my\.id\/sitemap\.xml/i);
    }
  });

  await t.test('GET /sitemap.xml & /api/sitemap.xml emit dynamic TiDB property URLs on canonical www domain without shadowing or test fixtures', async () => {
    const publicDir = path.resolve(process.cwd(), 'frontend', 'public');
    assert.equal(fs.existsSync(path.join(publicDir, 'sitemap.xml')), false);
    assert.equal(fs.existsSync(path.join(publicDir, 'robots.txt')), false);

    for (const urlPath of ['/sitemap.xml', '/api/sitemap.xml']) {
      const res = await fetch(`${baseUrl}${urlPath}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /application\/xml/i);
      const xml = await res.text();
      assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
      assert.match(xml, /<loc>https:\/\/www\.kosmobali\.my\.id\/<\/loc>/);
      assert.match(xml, /<loc>https:\/\/www\.kosmobali\.my\.id\/area\/jimbaran<\/loc>/);
      assert.match(xml, /<loc>https:\/\/www\.kosmobali\.my\.id\/area\/canggu<\/loc>/);
      assert.match(xml, /<loc>https:\/\/www\.kosmobali\.my\.id\/kos\/prop-01\/[a-z0-9-]+<\/loc>/);
      assert.equal(xml.includes('prop-cstorm-'), false);
    }
  });

  await t.test('Host header injection and bare apex Host normalize cleanly onto https://www.kosmobali.my.id', async () => {
    const spoofRes = await fetch(`${baseUrl}/api/sitemap.xml`, {
      headers: {
        Host: 'evil-phishing-site.org',
        'X-Forwarded-Host': 'attacker.com'
      }
    });
    assert.equal(spoofRes.status, 200);
    const spoofXml = await spoofRes.text();
    assert.equal(spoofXml.includes('evil-phishing-site.org'), false);
    assert.equal(spoofXml.includes('attacker.com'), false);
    assert.match(spoofXml, /https:\/\/www\.kosmobali\.my\.id\//);

    const apexRes = await fetch(`${baseUrl}/sitemap.xml`, {
      headers: {
        Host: 'kosmobali.my.id',
        'X-Forwarded-Proto': 'https'
      }
    });
    assert.equal(apexRes.status, 200);
    const apexXml = await apexRes.text();
    assert.match(apexXml, /<loc>https:\/\/www\.kosmobali\.my\.id\/<\/loc>/);
    assert.equal(apexXml.includes('<loc>https://kosmobali.my.id/'), false);
  });

  await t.test('GET /api/seo/prerender and root Vercel rewrite routes return HTML with canonical www link & Schema.org JSON-LD', async () => {
    // 1. Property detail prerender (API + root paths)
    for (const route of [
      '/api/seo/prerender?propertyId=prop-01',
      '/kos/prop-01/cove-nuansa-home-jimbaran',
      '/kos/prop-01'
    ]) {
      const propRes = await fetch(`${baseUrl}${route}`);
      assert.equal(propRes.status, 200);
      assert.match(propRes.headers.get('content-type') || '', /text\/html/i);
      const propHtml = await propRes.text();
      assert.match(propHtml, /<html lang="id">/);
      assert.match(propHtml, /<link rel="canonical" href="https:\/\/www\.kosmobali\.my\.id\/kos\/prop-01\//);
      assert.match(propHtml, /application\/ld\+json/);
      assert.match(propHtml, /LodgingBusiness/);
      assert.match(propHtml, /Cove Nuansa Home Jimbaran/);
    }

    // 2. District prerender (API + root path)
    for (const route of ['/api/seo/prerender?district=jimbaran', '/area/jimbaran']) {
      const areaRes = await fetch(`${baseUrl}${route}`);
      assert.equal(areaRes.status, 200);
      const areaHtml = await areaRes.text();
      assert.match(areaHtml, /<link rel="canonical" href="https:\/\/www\.kosmobali\.my\.id\/area\/jimbaran"/);
      assert.match(areaHtml, /CollectionPage/);
    }

    // 3. Unknown property returns 404 with noindex
    const missingRes = await fetch(`${baseUrl}/api/seo/prerender?propertyId=prop-does-not-exist-999`);
    assert.equal(missingRes.status, 404);
    const missingHtml = await missingRes.text();
    assert.match(missingHtml, /noindex/);
  });
});
