import assert from 'assert';
import {parseFoxOneCategories} from '../services/foxone-categories';
import {getFoxOneChunklistCacheKey} from '../services/foxone-playback';

const categories = (event: any) => parseFoxOneCategories(event);

assert(!categories({stream_types: ['SDR']}).includes('4K'), 'SDR must not imply 4K');
assert(categories({stream_types: ['HDR']}).includes('HDR'), 'HDR metadata should be labeled HDR');
assert(!categories({stream_types: ['HDR']}).includes('4K'), 'HDR alone must not imply 4K');
assert(categories({is_uhd: true}).includes('4K'), 'explicit UHD metadata should be labeled 4K');
assert(categories({stream_types: ['UHD']}).includes('4K'), 'UHD stream type should be labeled 4K');
assert(categories({stream_types: ['4K']}).includes('4K'), '4K stream type should be labeled 4K');
assert(categories({stream_types: ['HDR10']}).includes('HDR'), 'HDR10 should be labeled HDR');
assert(categories({genre_metadata: {display_name: 'Sports'}}).includes('Sports'), 'genre must remain one label');
assert(!categories({genre_metadata: {display_name: 'Sports'}}).includes('S'), 'genre text must not be split into characters');
assert.deepStrictEqual(categories({genre_metadata: null, stream_types: null, tags: null}), ['FOX One', 'FOX']);
assert.deepStrictEqual(categories({tags: ['Football', 'Football']}), ['FOX One', 'FOX', 'Football']);
const oldSignedUrl = 'https://cdn.example.test/ZXhwPTE3OTIyMjYzODk7bWFjPW9sZA/live/fnc-ue2/manifest/abc/6.m3u8?token=old';
const newSignedUrl = 'https://cdn.example.test/ZXhwPTE3OTIyMjY5OTk7bWFjPW5ldw/live/fnc-ue2/manifest/abc/6.m3u8?token=new';
assert.strictEqual(getFoxOneChunklistCacheKey(oldSignedUrl), getFoxOneChunklistCacheKey(newSignedUrl), 'signed token refresh must preserve the chunklist cache identity');
assert(getFoxOneChunklistCacheKey(oldSignedUrl).includes('/live/fnc-ue2/manifest/abc/6.m3u8'), 'cache identity should retain the resource path');
assert(!getFoxOneChunklistCacheKey(oldSignedUrl).includes('ZXhwPTE'), 'cache identity must not retain the expiring token');
assert(getFoxOneChunklistCacheKey('https://cdn.example.test/ZXhwPTEold/live/feed/6.m3u8?token=old&profile=uhd') === getFoxOneChunklistCacheKey('https://cdn.example.test/ZXhwPTEnew/live/feed/6.m3u8?token=new&profile=uhd'), 'auth query params should not destabilize the cache identity');
assert(getFoxOneChunklistCacheKey('https://cdn.example.test/ZXhwPTEold/live/feed/6.m3u8?token=old&profile=uhd') !== getFoxOneChunklistCacheKey('https://cdn.example.test/ZXhwPTEnew/live/feed/6.m3u8?token=new&profile=hd'), 'non-auth query params must remain part of the cache identity');
console.log('FOX One regression tests passed (16 assertions).');
