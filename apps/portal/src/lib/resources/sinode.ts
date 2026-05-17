// DEPRECATED: import langsung dari './sinode-config' di pages.
// File ini sengaja dibiarkan sebagai re-export shim untuk backward compatibility
// kalau ada code yang masih reference path lama. Hapus saat sudah dikonfirmasi
// tidak ada caller yang pakai path ini.
export { sinodeResource } from './sinode-config';
