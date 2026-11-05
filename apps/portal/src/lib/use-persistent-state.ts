'use client';

/**
 * useState yang nilainya disimpan di sessionStorage (per tab browser).
 *
 * Dipakai untuk filter / pencarian / halaman di daftar: saat admin membuka
 * detail lalu kembali, filter masih terisi seperti sebelumnya.
 *
 *  - Navigasi di dalam aplikasi (klik detail → Kembali): nilai dibaca langsung
 *    saat komponen dibuat, jadi tidak ada fetch ganda dengan filter kosong.
 *  - Muat ulang halaman penuh: render pertama memakai nilai awal (supaya sama
 *    dengan HTML server), lalu nilai tersimpan dipasang setelah mount.
 *  - `skipRestore` = true → abaikan nilai tersimpan (mis. filter datang dari URL).
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const PREFIX = 'ecc.listState:';
let hydrated = false;

function read<T>(key: string): { ok: true; value: T } | { ok: false } {
  if (typeof window === 'undefined') return { ok: false };
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw == null) return { ok: false };
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false };
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage penuh / diblokir — abaikan */
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  opts?: { skipRestore?: boolean },
): [T, Dispatch<SetStateAction<T>>] {
  const skip = !!opts?.skipRestore;
  const initFromStorage = useRef(hydrated);
  const [value, setValue] = useState<T>(() => {
    const base = typeof initial === 'function' ? (initial as () => T)() : initial;
    if (!skip && hydrated) {
      const r = read<T>(key);
      if (r.ok) return r.value;
    }
    if (skip && typeof window !== 'undefined') write(key, base);
    return base;
  });

  useEffect(() => {
    if (!initFromStorage.current && !skip) {
      const r = read<T>(key);
      if (r.ok) setValue(r.value);
    }
    hydrated = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (v) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        write(key, next);
        return next;
      });
    },
    [key],
  );

  return [value, set];
}
