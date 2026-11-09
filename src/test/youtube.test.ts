import { describe, expect, it } from 'vitest';
import { parseYouTube } from '../lib/youtube';

describe('YouTube-Links', () => {
  it('erkennt alle üblichen Linkformen', () => {
    expect(parseYouTube('https://www.youtube.com/watch?v=jfKfPfyJRdk')).toEqual({ id: 'jfKfPfyJRdk', start: null });
    expect(parseYouTube('https://youtu.be/jfKfPfyJRdk?t=90')).toEqual({ id: 'jfKfPfyJRdk', start: 90 });
    expect(parseYouTube('youtube.com/watch?v=jfKfPfyJRdk&t=1m30s')).toEqual({ id: 'jfKfPfyJRdk', start: 90 });
    expect(parseYouTube('https://m.youtube.com/shorts/jfKfPfyJRdk')?.id).toBe('jfKfPfyJRdk');
    expect(parseYouTube('https://music.youtube.com/watch?v=jfKfPfyJRdk&list=RD')?.id).toBe('jfKfPfyJRdk');
    expect(parseYouTube('https://www.youtube.com/live/jfKfPfyJRdk?si=abc')?.id).toBe('jfKfPfyJRdk');
    expect(parseYouTube('jfKfPfyJRdk')?.id).toBe('jfKfPfyJRdk');
  });

  it('lehnt fremde Seiten und kaputte Links ab', () => {
    expect(parseYouTube('https://evil.example/watch?v=jfKfPfyJRdk')).toBeNull();
    expect(parseYouTube('https://youtube.com.evil.example/watch?v=jfKfPfyJRdk')).toBeNull();
    expect(parseYouTube('https://www.youtube.com/watch?v=kurz')).toBeNull();
    expect(parseYouTube('kein link')).toBeNull();
    expect(parseYouTube('javascript:alert(1)')).toBeNull();
  });
});
