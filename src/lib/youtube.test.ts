import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeVideoId } from './youtube';

test('reads live links', () => assert.equal(parseYouTubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ'));
test('reads watch links', () => assert.equal(parseYouTubeVideoId('youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ'));
test('reads short links', () => assert.equal(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ'));
test('rejects other sites', () => assert.equal(parseYouTubeVideoId('https://vimeo.com/dQw4w9WgXcQ'), null));
