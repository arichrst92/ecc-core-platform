/**
 * Logo IDEA (vektor, dilacak dari logo-idea.webp) — disisipkan langsung di
 * laporan HTML/PDF supaya "Powered by IDEA" selalu tampil walau gambar dari
 * Portal tidak termuat (offline, print sebelum gambar selesai dimuat, dll.).
 */
const IDEA_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 43\" height=\"__H__\" style=\"display:block\"><path fill=\"#000000\" fill-rule=\"evenodd\" d=\"M52.0 33.5 L78.8 33.5 L78.8 42.9 L52.0 42.9 Z M52.0 17.0 L78.8 17.0 L78.8 26.6 L52.0 26.6 Z M103.0 0.0 L83.2 42.9 L93.0 42.9 L96.0 36.3 L114.7 36.3 L117.9 42.9 L127.9 42.9 L107.9 0.0 Z M105.3 15.0 L110.6 27.8 L99.6 27.8 Z M52.0 0.0 L78.8 0.0 L78.8 9.6 L52.0 9.6 Z M0.0 0.0 L11.2 0.0 L11.2 42.9 L0.0 42.9 Z\"/><path fill=\"#1A50E8\" d=\"M17.9 0.0 L31.6 21.3 L18.0 42.9 L32.0 42.9 L45.9 21.3 L31.9 0.0 Z\"/></svg>";

/** `<svg>` logo IDEA setinggi `height` px. */
export function ideaLogoSvg(height = 18): string {
  return IDEA_SVG.replace('__H__', String(height));
}
