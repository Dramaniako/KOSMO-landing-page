import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

test('Authentication logic & password hashing', async (t) => {
  const plainPassword = 'SuperSecretPassword123!';
  const hashedPassword = bcrypt.hashSync(plainPassword, 10);

  await t.test('bcrypt hashes password with salt correctly', () => {
    assert.notEqual(hashedPassword, plainPassword);
    assert.equal(typeof hashedPassword, 'string');
    assert.ok(hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'));
  });

  await t.test('bcrypt correctly validates matching password', () => {
    const isValid = bcrypt.compareSync(plainPassword, hashedPassword);
    assert.equal(isValid, true);
  });

  await t.test('bcrypt rejects incorrect password', () => {
    const isInvalid = bcrypt.compareSync('WrongPassword456!', hashedPassword);
    assert.equal(isInvalid, false);
  });

  await t.test('bcrypt rejects empty password against hash', () => {
    const isEmptyValid = bcrypt.compareSync('', hashedPassword);
    assert.equal(isEmptyValid, false);
  });

  await t.test('password verification logic handles missing parameters', () => {
    const verifyPasswordInput = (userId?: string, password?: string): { valid: boolean; error?: string } => {
      if (!userId || !password) {
        return { valid: false, error: 'userId dan password wajib diisi.' };
      }
      return { valid: true };
    };

    assert.equal(verifyPasswordInput(undefined, 'pass123').valid, false);
    assert.equal(verifyPasswordInput('user-1', undefined).valid, false);
    assert.equal(verifyPasswordInput('', '').valid, false);
    assert.equal(verifyPasswordInput('user-1', 'pass123').valid, true);
  });
});
