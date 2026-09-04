import { useState, useEffect } from 'react';
import { User } from '../../../types/index';

export function validateIdentity(val: string, type: 'NIK' | 'PASSPORT'): { isValid: boolean; error: string | null } {
  const clean = val.trim();
  if (!clean) {
    return {
      isValid: false,
      error: type === 'NIK' ? 'NIK wajib diisi sesuai KTP (16 digit).' : 'Nomor Paspor wajib diisi (6-12 karakter).'
    };
  }
  if (type === 'NIK') {
    if (!/^\d+$/.test(clean)) {
      return { isValid: false, error: 'NIK hanya boleh berisi 16 digit angka.' };
    }
    if (clean.length !== 16) {
      return { isValid: false, error: `NIK harus tepat 16 digit angka (saat ini ${clean.length} digit).` };
    }
    return { isValid: true, error: null };
  } else {
    if (!/^[A-Za-z0-9]+$/.test(clean)) {
      return { isValid: false, error: 'Nomor Paspor hanya boleh berisi huruf dan angka alfanumerik.' };
    }
    if (clean.length < 6 || clean.length > 12) {
      return { isValid: false, error: `Nomor Paspor harus 6 - 12 karakter (saat ini ${clean.length} karakter).` };
    }
    return { isValid: true, error: null };
  }
}

export function useIdentityValidation(currentUser: User | null, showContract: boolean) {
  const [idType, setIdType] = useState<'NIK' | 'PASSPORT'>(() => {
    return (currentUser?.identity_type as 'NIK' | 'PASSPORT') || 'NIK';
  });
  const [idNumber, setIdNumber] = useState<string>(() => {
    return currentUser?.identity_number || '';
  });
  const [idTouched, setIdTouched] = useState<boolean>(() => Boolean(currentUser?.identity_number));
  const [idValidationMsg, setIdValidationMsg] = useState<string | null>(null);

  useEffect(() => {
    if (showContract) {
      if (currentUser?.identity_number) {
        setIdNumber(currentUser.identity_number);
        setIdType((currentUser.identity_type as 'NIK' | 'PASSPORT') || 'NIK');
        setIdTouched(true);
        setIdValidationMsg(null);
      } else {
        setIdTouched(false);
        setIdValidationMsg(null);
      }
    }
  }, [showContract, currentUser]);

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (idType === 'PASSPORT') {
      val = val.toUpperCase();
    }
    setIdNumber(val);
    setIdTouched(true);
    const result = validateIdentity(val, idType);
    setIdValidationMsg(result.error);
  };

  const handleIdTypeChange = (type: 'NIK' | 'PASSPORT') => {
    setIdType(type);
    if (idTouched && idNumber) {
      const result = validateIdentity(idNumber, type);
      setIdValidationMsg(result.error);
    }
  };

  const idCheckResult = validateIdentity(idNumber, idType);
  const isIdValid = idTouched && idCheckResult.isValid;

  return {
    idType,
    setIdType,
    idNumber,
    setIdNumber,
    idTouched,
    setIdTouched,
    idValidationMsg,
    setIdValidationMsg,
    handleIdChange,
    handleIdTypeChange,
    validateIdentity,
    idCheckResult,
    isIdValid
  };
}
