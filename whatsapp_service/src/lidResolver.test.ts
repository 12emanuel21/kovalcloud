import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { isDirectChatJid, LidStore, senderIdFor, type IncomingKey } from './lidResolver';

const tempStore = () => new LidStore(fs.mkdtempSync(path.join(os.tmpdir(), 'koval-lid-')));
const key = (remoteJid: string, extra: Partial<IncomingKey> = {}) => ({ remoteJid, fromMe: false, id: 'm1', ...extra }) as IncomingKey;

test('solo los chats 1 a 1 (número o LID) son chats de clientes', () => {
  assert.equal(isDirectChatJid('573001234567@s.whatsapp.net'), true);
  assert.equal(isDirectChatJid('238012345678901@lid'), true);
  for (const jid of [
    '120363025246125486@g.us',
    'status@broadcast',
    '1234567890@broadcast',
    '120363144038483540@newsletter',
    '@s.whatsapp.net',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isDirectChatJid(jid), false, String(jid));
  }
});

test('senderIdFor ignora grupos, canales y difusión (y no los guarda como destino de respuesta)', () => {
  const store = tempStore();
  for (const jid of ['120363025246125486@g.us', 'status@broadcast', '120363144038483540@newsletter']) {
    assert.equal(senderIdFor(key(jid, { participant: '573001234567@s.whatsapp.net' }), store), null, jid);
  }
  // El participante de un grupo no quedó asociado a la conversación del grupo
  assert.equal(store.replyJidFor('120363025246125486'), '120363025246125486@s.whatsapp.net');
  assert.equal(store.replyJidFor('573001234567'), '573001234567@s.whatsapp.net');
});

test('senderIdFor sigue resolviendo clientes por número y por LID', () => {
  const store = tempStore();
  assert.equal(senderIdFor(key('573001234567@s.whatsapp.net'), store), '573001234567');
  assert.equal(senderIdFor(key('238012345678901@lid'), store), 'lid:238012345678901');
  assert.equal(senderIdFor(key('238099999999999@lid', { remoteJidAlt: '573109998877@s.whatsapp.net' }), store), '573109998877');
});
