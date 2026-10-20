import { describe, it, expect } from 'vitest';
import {
  alignLyrics,
  isLabelLine,
  parseLrc,
  parseWhisperProgress,
  parseWhisperSegmentLine,
  similarity,
  wordsFromWhisperJson,
  type TimedWord,
} from './worship-align.js';

const W = (text: string, start: number): TimedWord => ({ text, start, end: start + 0.4 });
const wordsOf = (s: string, start: number, step = 0.5) => s.split(' ').map((w, i) => W(w, start + i * step));

describe('worship-align', () => {
  it('kemiripan kata', () => {
    expect(similarity('raja', 'raja')).toBe(1);
    expect(similarity('kau', 'kaw')).toBeGreaterThan(0.6);
    expect(similarity('raja', 'cinta')).toBeLessThan(0.6);
  });

  it('label bagian lagu', () => {
    expect(isLabelLine('Reff:')).toBe(true);
    expect(isLabelLine('[Verse 2]')).toBe(true);
    expect(isLabelLine('Bridge')).toBe(true);
    expect(isLabelLine('Kau Raja di atas segala raja')).toBe(false);
  });

  it('menyelaraskan baris + reff berulang + kata salah dengar', () => {
    const lirik = ['Kau Raja di atas segala raja', 'Kau layak dipuji', '', 'Reff:', 'Haleluya Kau Raja', 'Haleluya Kau Raja'];
    const words = [
      ...wordsOf('musik', 1),
      ...wordsOf('kau raja di atas segala raja', 10),
      ...wordsOf('kaw layak di puji', 15),
      ...wordsOf('haleluya kau raja', 22),
      ...wordsOf('haleluya kau raja', 27),
    ];
    const out = alignLyrics(lirik, words, 40);
    expect(out.map((o) => o.line)).toEqual(['Kau Raja di atas segala raja', 'Kau layak dipuji', 'Reff:', 'Haleluya Kau Raja', 'Haleluya Kau Raja']);
    expect(out[0]!.t).toBe(10);
    expect(out[1]!.t).toBe(15);
    expect(out[2]!.t).toBe(22); // label ikut baris berikutnya
    expect(out[3]!.t).toBe(22);
    expect(out[4]!.t).toBe(27);
    expect(out[0]!.confidence).toBe(1);
  });

  it('baris tidak terdengar diinterpolasi dengan keyakinan 0', () => {
    const out = alignLyrics(['satu dua tiga', 'empat lima enam', 'tujuh delapan sembilan'], [
      ...wordsOf('satu dua tiga', 5),
      ...wordsOf('tujuh delapan sembilan', 25),
    ]);
    expect(out[0]!.t).toBe(5);
    expect(out[2]!.t).toBe(25);
    expect(out[1]!.t).toBe(15);
    expect(out[1]!.confidence).toBe(0);
  });

  it('parser output whisper', () => {
    expect(parseWhisperProgress('whisper_print_progress_callback: progress =  10%\n... progress =  45%')).toBe(45);
    expect(parseWhisperProgress('nothing')).toBe(null);
    expect(parseWhisperSegmentLine('[00:01:02.340 --> 00:01:03.000]   raja')).toEqual({ start: 62.34, end: 63, text: 'raja' });
    expect(
      wordsFromWhisperJson({ transcription: [{ offsets: { from: 1000, to: 1500 }, text: ' Kau' }, { offsets: { from: 1500, to: 2500 }, text: 'Raja mulia' }] }),
    ).toEqual([
      { text: 'Kau', start: 1, end: 1.5 },
      { text: 'Raja', start: 1.5, end: 2 },
      { text: 'mulia', start: 2, end: 2.5 },
    ]);
  });

  it('parse .lrc', () => {
    expect(parseLrc('[ar:ECC]\n[00:12.40]Kau Raja\n[00:18.90][01:30.00]Haleluya\n')).toEqual([
      { t: 12.4, line: 'Kau Raja' },
      { t: 18.9, line: 'Haleluya' },
      { t: 90, line: 'Haleluya' },
    ]);
  });
});
