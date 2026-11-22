#!/usr/bin/env python3
"""Salin teks bawaan Els App (i18n id/en) ke Portal untuk editor "Teks app".

Jalankan setelah teks app berubah (dari Mac, kedua repo bersebelahan):
  python3 scripts/sync-app-text-catalog.py ../ecc-mobile-app/app/src/i18n/locales
"""
import json, sys, os

src = sys.argv[1] if len(sys.argv) > 1 else "../ecc-mobile-app/app/src/i18n/locales"
out = os.path.join(os.path.dirname(__file__), "..", "apps/portal/src/lib/app-text-catalog.json")
ids = json.load(open(os.path.join(src, "id.json")))
ens = json.load(open(os.path.join(src, "en.json")))


def flat(o, p=""):
    r = {}
    for k, v in o.items():
        kp = f"{p}.{k}" if p else k
        if isinstance(v, dict):
            r.update(flat(v, kp))
        elif isinstance(v, str):
            r[kp] = v
    return r


fi, fe = flat(ids), flat(ens)
cat = {k: [fi[k], fe.get(k, "")] for k in sorted(fi)}
json.dump(cat, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(cat)} teks → {os.path.normpath(out)}")
