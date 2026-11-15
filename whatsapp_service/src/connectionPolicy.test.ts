import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPermanentDisconnect, isStaleMessage, messageTimestampMs, reconnectDelayMs } from './connectionPolicy';

const NOW = Date.UTC(2026, 10, 15, 15, 0, 0);
const secondsAgo = (s: number) => Math.floor((NOW - s * 1000) / 1000);

test('mensajes con más de 10 min de antigüedad no se responden (ráfaga tras reconexión)', () => {
  assert.equal(isStaleMessage(secondsAgo(30), NOW), false);
  assert.equal(isStaleMessage(secondsAgo(9 * 60), NOW), false);
  assert.equal(isStaleMessage(secondsAgo(11 * 60), NOW), true);
  assert.equal(isStaleMessage(secondsAgo(3 * 3600), NOW), true);
  // Long de protobuf (como llega messageTimestamp en Baileys)
  assert.equal(isStaleMessage({ toNumber: () => secondsAgo(20 * 60) }, NOW), true);
  assert.equal(messageTimestampMs({ toNumber: () => 1_700_000_000 }), 1_700_000_000_000);
  // Sin fecha: no se descarta
  assert.equal(isStaleMessage(undefined, NOW), false);
  assert.equal(isStaleMessage(null, NOW), false);
  assert.equal(isStaleMessage(0, NOW), false);
});

test('backoff exponencial de reconexión: 3s, 6s, 12s... con tope de 60s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(reconnectDelayMs), [3000, 6000, 12000, 24000, 48000, 60000, 60000, 60000]);
});

test('sesión cerrada, bloqueo o sesión reemplazada detienen el bucle; caídas de red reintentan', () => {
  for (const code of [401, 403, 440]) assert.equal(isPermanentDisconnect(code), true, `código ${code}`);
  // 408 timeout / 428 cerrada / 500 sesión dañada / 503 servicio / 515 reinicio tras el QR
  for (const code of [408, 428, 500, 503, 515, undefined]) assert.equal(isPermanentDisconnect(code), false, `código ${code}`);
});
