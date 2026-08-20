import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCache } from '../backend/services/cache';

test('InMemoryCache service logic & TTL lifecycle', async (t) => {
  await t.test('sets and gets cached items within TTL', () => {
    const cache = new InMemoryCache();
    cache.set('key1', 'value1', 10);
    cache.set('objKey', { id: 1, name: 'Kos Bali' }, 10);

    assert.equal(cache.get<string>('key1'), 'value1');
    assert.deepEqual(cache.get<{ id: number; name: string }>('objKey'), { id: 1, name: 'Kos Bali' });
    assert.equal(cache.size(), 2);
  });

  await t.test('returns null on cache miss', () => {
    const cache = new InMemoryCache();
    assert.equal(cache.get<string>('non_existent_key'), null);
  });

  await t.test('evicts expired entries on access and returns null', async () => {
    const cache = new InMemoryCache();
    // Set with negative or zero TTL to simulate immediate expiration
    cache.set('short_lived', 'temp_val', -1);

    assert.equal(cache.get<string>('short_lived'), null);
    assert.equal(cache.size(), 0);
  });

  await t.test('del() removes existing key from cache', () => {
    const cache = new InMemoryCache();
    cache.set('delete_me', 12345);
    assert.equal(cache.size(), 1);

    cache.del('delete_me');
    assert.equal(cache.get<number>('delete_me'), null);
    assert.equal(cache.size(), 0);
  });

  await t.test('invalidatePattern() evicts all keys matching prefix', () => {
    const cache = new InMemoryCache();
    cache.set('api:properties:all', [{ id: 'p1' }]);
    cache.set('api:properties:featured', [{ id: 'p2' }]);
    cache.set('api:users:u1', { name: 'Tenant' });
    cache.set('stats:summary', { total: 100 });

    assert.equal(cache.size(), 4);

    cache.invalidatePattern('api:properties');

    assert.equal(cache.get('api:properties:all'), null);
    assert.equal(cache.get('api:properties:featured'), null);
    assert.notEqual(cache.get('api:users:u1'), null);
    assert.notEqual(cache.get('stats:summary'), null);
    assert.equal(cache.size(), 2);
  });

  await t.test('clear() purges all keys in cache', () => {
    const cache = new InMemoryCache();
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');
    cache.set('k3', 'v3');
    assert.equal(cache.size(), 3);

    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('k1'), null);
    assert.equal(cache.get('k2'), null);
    assert.equal(cache.get('k3'), null);
  });
});
