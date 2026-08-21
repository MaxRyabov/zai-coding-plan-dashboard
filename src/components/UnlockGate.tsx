'use client';

import { type FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2, Lock, ShieldAlert, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useVault } from '@/components/VaultContext';

export const MIN_PASSWORD_LENGTH = 8;

type LocalError = 'MISMATCH' | 'TOO_SHORT' | null;

export function UnlockGate() {
  const t = useTranslations();
  const { status, error, isBusy, hasLegacyKey, createVault, unlock, resetVault } = useVault();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<LocalError>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const isSetup = status === 'setup';

  if (status === 'unavailable') {
    return (
      <Card className='border-destructive/50 bg-destructive/5'>
        <CardHeader>
          <CardTitle className='flex items-center gap-1.5 text-sm font-medium'>
            <ShieldAlert className='w-3.5 h-3.5 text-destructive' />
            {t('vault.unavailableTitle')}
          </CardTitle>
          <CardDescription className='text-xs'>{t('vault.unavailable')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) return;

    if (isSetup) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError('TOO_SHORT');
        return;
      }
      if (password !== confirmation) {
        setLocalError('MISMATCH');
        return;
      }
      setLocalError(null);
      const created = await createVault(password);
      if (created) {
        setPassword('');
        setConfirmation('');
      }
      return;
    }

    setLocalError(null);
    const unlocked = await unlock(password);
    // Clear the field either way: on success it is spent, on failure it is wrong.
    setPassword('');
    if (!unlocked) return;
  };

  const errorText = localError === 'TOO_SHORT'
    ? t('vault.tooShort', { count: MIN_PASSWORD_LENGTH })
    : localError === 'MISMATCH'
    ? t('vault.mismatch')
    : error === 'WRONG_PASSWORD'
    ? t('vault.wrongPassword')
    : error === 'VAULT_CORRUPT'
    ? t('vault.corrupt')
    : error === 'VAULT_VERSION'
    ? t('vault.unsupportedVersion')
    : error === 'SAVE_FAILED'
    ? t('vault.saveFailed')
    : null;

  const submitDisabled = isBusy || !password || error === 'VAULT_VERSION';

  return (
    <Card className='max-w-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-1.5 text-sm font-medium'>
          {isSetup ? <Lock className='w-3.5 h-3.5' /> : <Unlock className='w-3.5 h-3.5' />}
          {isSetup ? t('vault.setupTitle') : t('vault.unlockTitle')}
        </CardTitle>
        <CardDescription className='text-xs'>
          {isSetup ? t('vault.setupDescription') : t('vault.unlockDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isSetup && hasLegacyKey && (
          <p className='mb-3 rounded-lg bg-primary/8 px-3 py-2 text-[11px] text-muted-foreground'>
            {t('vault.migrationNotice')}
          </p>
        )}

        <form onSubmit={handleSubmit} className='flex flex-col gap-2'>
          <Input
            type='password'
            value={password}
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocalError(null);
            }}
            placeholder={t('vault.password')}
            className='h-8 text-xs'
          />
          {isSetup && (
            <Input
              type='password'
              value={confirmation}
              autoComplete='new-password'
              onChange={(event) => {
                setConfirmation(event.target.value);
                setLocalError(null);
              }}
              placeholder={t('vault.confirmPassword')}
              className='h-8 text-xs'
            />
          )}

          {errorText && (
            <p className='flex items-center gap-1 text-[10px] text-destructive/80'>
              <AlertCircle className='w-3 h-3 shrink-0' />
              {errorText}
            </p>
          )}

          <Button type='submit' size='sm' disabled={submitDisabled} className='rounded-full h-8 px-3 text-xs self-start'>
            {isBusy
              ? (
                <>
                  <Loader2 className='w-3 h-3 animate-spin' />
                  {t('vault.unlocking')}
                </>
              )
              : isSetup
              ? t('vault.create')
              : t('vault.unlock')}
          </Button>
        </form>

        {isSetup
          ? <p className='mt-3 text-[10px] text-muted-foreground'>{t('vault.setupWarning')}</p>
          : (
            <div className='mt-3'>
              {confirmingReset
                ? (
                  <div className='flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2'>
                    <p className='text-[10px] text-destructive/80'>{t('vault.resetWarning')}</p>
                    <div className='flex gap-2'>
                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        className='rounded-full h-7 px-3 text-xs'
                        onClick={() => {
                          resetVault();
                          setConfirmingReset(false);
                          setPassword('');
                        }}
                      >
                        {t('vault.reset')}
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='rounded-full h-7 px-3 text-xs'
                        onClick={() => setConfirmingReset(false)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )
                : (
                  <button
                    type='button'
                    className='text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors'
                    onClick={() => setConfirmingReset(true)}
                  >
                    {t('vault.forgot')}
                  </button>
                )}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
