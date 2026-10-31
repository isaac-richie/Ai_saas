import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { isPublicIp, assertPublicHttpsUrl } = await loadTs('core/utils/security/safe-fetch.ts');

describe('isPublicIp', () => {
  it('blocks private, loopback, link-local and metadata ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254']) {
      assert.equal(isPublicIp(ip), false, ip);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '104.18.1.1', '2606:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
  });
  it('rejects non-ip strings', () => {
    assert.equal(isPublicIp('localhost'), false);
  });
});

describe('assertPublicHttpsUrl', () => {
  for (const bad of ['http://example.com/a.mp4', 'file:///etc/passwd', 'https://127.0.0.1/a.mp4', 'https://[::1]/a', 'https://169.254.169.254/latest', 'https://user:pw@example.com/a', 'not a url', 'https://localhost/a.mp4']) {
    it(`rejects ${bad}`, async () => {
      await assert.rejects(assertPublicHttpsUrl(bad), { name: 'UnsafeUrlError' });
    });
  }
  it('accepts a public https ip literal', async () => {
    const url = await assertPublicHttpsUrl('https://8.8.8.8/clip.mp4');
    assert.equal(url.hostname, '8.8.8.8');
  });
});
