import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, readBackup, backupFileName } from '../src/backup.js';

test('копия и восстановление: всё на месте, фото байт в байт', async () => {
  const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 250, 0])], { type: 'image/jpeg' });
  const dump = {
    students: [{ id: '0001', name: 'Әлібеков Нұрлан', group: '11А', lang: 'kk', status: 'active' }],
    tests: [{ id: 't1', name: 'Пробное ЕНТ — ноябрь', date: '2026-11-28', keys: { '01': { history: { 1: { a: 'C', topic: 'Ханство' } }, subjects: {} } } }],
    results: [{ id: 'r1', testId: 't1', studentId: '0001', photo, H: [1, 0, 0, 0, 1, 0, 0, 0, 1], edits: { answers: { history: { 5: '' } } } }],
    settings: [{ key: 'activeTest', value: 't1' }, { key: 'lastStudentId', value: '0001' }],
  };
  const text = await makeBackup(dump, new Date('2026-11-28T10:00:00Z'));
  const back = readBackup(text);
  assert.equal(back.createdAt, '2026-11-28T10:00:00.000Z');
  assert.deepEqual(back.counts, { students: 1, tests: 1, results: 1, settings: 2 });
  assert.deepEqual(back.dump.students, dump.students);
  assert.deepEqual(back.dump.tests, dump.tests);
  assert.deepEqual(back.dump.settings, dump.settings);
  const r = back.dump.results[0];
  assert.equal(r.edits.answers.history[5], '');
  assert.ok(r.photo instanceof Blob);
  assert.equal(r.photo.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await r.photo.arrayBuffer()), new Uint8Array(await photo.arrayBuffer()));
});

test('чужой или испорченный файл не принимается', () => {
  assert.throws(() => readBackup('не json'), /notBackup/);
  assert.throws(() => readBackup(JSON.stringify({ app: 'other', data: {} })), /notBackup/);
  assert.throws(() => readBackup(JSON.stringify({ app: 'ent-scanner', format: 99, data: {} })), /newerFormat/);
  assert.throws(() => readBackup(JSON.stringify({ app: 'ent-scanner', format: 1, data: { students: [] } })), /broken/);
});

test('имя файла копии с датой', () => {
  assert.equal(backupFileName(new Date(2026, 10, 28)), 'ent-backup-2026-11-28.json');
});
