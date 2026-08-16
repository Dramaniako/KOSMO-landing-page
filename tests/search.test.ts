import test from 'node:test';
import assert from 'node:assert/strict';

interface SearchPropertyItem {
  id: string;
  name: string;
  district: string;
  price: number;
  facilities: string[];
}

interface SearchQueryParams {
  district?: string;
  priceMin?: number;
  priceMax?: number;
  facilities?: string[];
}

function filterProperties(
  properties: SearchPropertyItem[],
  query: SearchQueryParams
): SearchPropertyItem[] {
  return properties.filter((p) => {
    // District filter
    if (query.district && query.district !== 'Semua' && p.district.toLowerCase() !== query.district.toLowerCase()) {
      return false;
    }

    // Price min filter
    if (query.priceMin !== undefined && p.price < query.priceMin) {
      return false;
    }

    // Price max filter
    if (query.priceMax !== undefined && p.price > query.priceMax) {
      return false;
    }

    // Facilities filter (must include all requested facilities)
    if (query.facilities && query.facilities.length > 0) {
      const propFacsLower = p.facilities.map((f) => f.toLowerCase());
      const allMatched = query.facilities.every((f) => propFacsLower.includes(f.toLowerCase()));
      if (!allMatched) {
        return false;
      }
    }

    return true;
  });
}

function buildSearchQueryString(params: SearchQueryParams): string {
  const parts: string[] = [];

  if (params.priceMin !== undefined) {
    parts.push(`priceMin=${params.priceMin}`);
  }
  if (params.priceMax !== undefined) {
    parts.push(`priceMax=${params.priceMax}`);
  }
  if (params.district && params.district !== 'Semua') {
    parts.push(`district=${encodeURIComponent(params.district)}`);
  }
  if (params.facilities && params.facilities.length > 0) {
    params.facilities.forEach((fac) => {
      parts.push(`facility=${encodeURIComponent(fac)}`);
    });
  }

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

test('Property search and filter query logic', async (t) => {
  const sampleProperties: SearchPropertyItem[] = [
    {
      id: 'p1',
      name: 'KOSMO Hub Seminyak',
      district: 'Badung',
      price: 3500000,
      facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Kebersihan']
    },
    {
      id: 'p2',
      name: 'KOSMO Sunset Kuta',
      district: 'Badung',
      price: 2500000,
      facilities: ['Wifi', 'AC', 'Parkir']
    },
    {
      id: 'p3',
      name: 'KOSMO Sanur Living',
      district: 'Denpasar',
      price: 4500000,
      facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Keamanan', 'Parkir', 'Kolam renang']
    },
    {
      id: 'p4',
      name: 'KOSMO Ubud Sanctuary',
      district: 'Gianyar',
      price: 5000000,
      facilities: ['Wifi', 'AC', 'Kebersihan', 'Dapur']
    }
  ];

  await t.test('filters by district correctly', () => {
    const results = filterProperties(sampleProperties, { district: 'Denpasar' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'p3');

    const badungResults = filterProperties(sampleProperties, { district: 'Badung' });
    assert.equal(badungResults.length, 2);

    const allResults = filterProperties(sampleProperties, { district: 'Semua' });
    assert.equal(allResults.length, 4);
  });

  await t.test('filters by price boundaries', () => {
    const budgetResults = filterProperties(sampleProperties, { priceMin: 2000000, priceMax: 3500000 });
    assert.equal(budgetResults.length, 2);
    assert.ok(budgetResults.every((p) => p.price >= 2000000 && p.price <= 3500000));
  });

  await t.test('filters by required facility subsets', () => {
    const allInclusiveResults = filterProperties(sampleProperties, {
      facilities: ['Listrik', 'Air']
    });
    assert.equal(allInclusiveResults.length, 2);
    assert.ok(allInclusiveResults.some((p) => p.id === 'p1'));
    assert.ok(allInclusiveResults.some((p) => p.id === 'p3'));

    const poolResults = filterProperties(sampleProperties, {
      facilities: ['Kolam renang']
    });
    assert.equal(poolResults.length, 1);
    assert.equal(poolResults[0].id, 'p3');
  });

  await t.test('builds query parameter string accurately', () => {
    const queryString = buildSearchQueryString({
      priceMin: 1000000,
      priceMax: 5000000,
      district: 'Badung',
      facilities: ['Wifi', 'AC']
    });

    assert.equal(queryString, '?priceMin=1000000&priceMax=5000000&district=Badung&facility=Wifi&facility=AC');
  });
});
