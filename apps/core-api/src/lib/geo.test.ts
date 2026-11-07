import { describe, it, expect } from 'vitest';
import { distanceKm, extractCoordsFromMapsHtml, isMapsLink, isShortMapsLink, parseMapsCoordinates, placeTextFromMapsUrl } from './geo.js';

describe('parseMapsCoordinates', () => {
  it('koordinat polos', () => {
    expect(parseMapsCoordinates('-6.2088, 106.8456')).toEqual({ lat: -6.2088, lng: 106.8456 });
  });

  it('link place dengan !3d!4d (paling akurat, menang dari @)', () => {
    const url =
      'https://www.google.com/maps/place/Monas/@-6.17,106.82,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-6.1753924!4d106.8271528';
    expect(parseMapsCoordinates(url)).toEqual({ lat: -6.1753924, lng: 106.8271528 });
  });

  it('link @lat,lng,zoom', () => {
    expect(parseMapsCoordinates('https://www.google.com/maps/@-6.2297,106.8295,17z')).toEqual({
      lat: -6.2297,
      lng: 106.8295,
    });
  });

  it('query q= / ll=', () => {
    expect(parseMapsCoordinates('https://maps.google.com/?q=-6.2,106.8')).toEqual({ lat: -6.2, lng: 106.8 });
    expect(parseMapsCoordinates('https://maps.google.com/maps?ll=1.3521,103.8198&z=12')).toEqual({
      lat: 1.3521,
      lng: 103.8198,
    });
  });

  it('tidak valid → null', () => {
    expect(parseMapsCoordinates('Rumah Pak Budi, Jl. Mawar 5')).toBe(null);
    expect(parseMapsCoordinates('95, 200')).toBe(null);
    expect(parseMapsCoordinates('')).toBe(null);
    expect(parseMapsCoordinates(null)).toBe(null);
  });

  it('link pendek dikenali (perlu di-resolve)', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(parseMapsCoordinates('https://maps.app.goo.gl/AbCdEf123')).toBe(null);
  });
});

describe('distanceKm', () => {
  it('Monas → Bundaran HI ≈ 2.2 km', () => {
    const d = distanceKm({ lat: -6.1754, lng: 106.8272 }, { lat: -6.1949, lng: 106.823 });
    expect(Math.round(d * 10) / 10).toBe(2.2);
  });
});

describe('presisi koordinat (7 angka di belakang koma)', () => {
  it('dibulatkan dari link dengan banyak digit', () =>
    expect(parseMapsCoordinates('https://www.google.com/maps/place/x!3d-6.17539229999!4d106.82718369999')).toEqual({
      lat: -6.1753923,
      lng: 106.8271837,
    }));
  it('digit sedikit tetap apa adanya', () => expect(parseMapsCoordinates('-6.2088, 106.8456')).toEqual({ lat: -6.2088, lng: 106.8456 }));
});

describe('link Google Maps tanpa koordinat', () => {
  it('isMapsLink', () => {
    expect(isMapsLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isMapsLink('https://www.google.com/maps/place/Gereja+ECC/data=!4m2!3m1!1s0x2e6')).toBe(true);
    expect(isMapsLink('https://maps.google.com/?q=ECC+Bandung&ftid=0x2e68:0x1')).toBe(true);
    expect(isMapsLink('https://www.google.com/search?q=ecc')).toBe(false);
    expect(isMapsLink('https://example.com/maps')).toBe(false);
  });

  it('titik dari HTML halaman Google Maps', () => {
    expect(
      extractCoordsFromMapsHtml('<meta content="https://maps.google.com/maps/api/staticmap?center=-6.8915%2C107.6107&amp;zoom=16" property="og:image">'),
    ).toEqual({ lat: -6.8915, lng: 107.6107 });
    expect(extractCoordsFromMapsHtml('foo !3d-6.9!4d107.61 bar')).toEqual({ lat: -6.9, lng: 107.61 });
    expect(extractCoordsFromMapsHtml('window.APP_INITIALIZATION_STATE=[[[2541.6,107.6107,-6.8915],[0,0,0]')).toEqual({
      lat: -6.8915,
      lng: 107.6107,
    });
    expect(extractCoordsFromMapsHtml('<html>tidak ada</html>')).toBeNull();
  });

  it('nama tempat dari URL', () => {
    expect(placeTextFromMapsUrl('https://maps.google.com/?q=Gereja+ECC+Bandung&ftid=0x1:0x2')).toBe('Gereja ECC Bandung');
    expect(placeTextFromMapsUrl('https://www.google.com/maps/place/Jl.+Dago+No.+12,+Bandung/data=!4m2')).toBe('Jl. Dago No. 12, Bandung');
    expect(placeTextFromMapsUrl('https://maps.google.com/?q=-6.2,106.8')).toBeNull();
  });
});
