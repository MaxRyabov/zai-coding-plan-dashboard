'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ChevronDown, ChevronUp, ClipboardPaste, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useVault } from '@/components/VaultContext';
import { type Account, isValidApiKey, maskKey } from '@/lib/accounts';

type Editing =
  | { mode: 'add' }
  | { mode: 'edit'; id: string }
  | { mode: 'confirm-delete'; id: string }
  | null;

type FormError = 'INVALID' | 'DUPLICATE' | null;

export function AccountsManager({ defaultOpenForm = false }: { defaultOpenForm?: boolean }) {
  const t = useTranslations();
  const { accounts, isBusy, addAccount, updateAccount, removeAccount, moveAccount } = useVault();

  const [editing, setEditing] = useState<Editing>(defaultOpenForm ? { mode: 'add' } : null);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);

  const closeForm = useCallback(() => {
    setEditing(null);
    setLabel('');
    setApiKey('');
    setShowApiKey(false);
    setFormError(null);
  }, []);

  const openAdd = useCallback(() => {
    setEditing({ mode: 'add' });
    setLabel('');
    setApiKey('');
    setShowApiKey(false);
    setFormError(null);
  }, []);

  const openEdit = useCallback((account: Account) => {
    setEditing({ mode: 'edit', id: account.id });
    setLabel(account.label);
    setApiKey(account.apiKey);
    setShowApiKey(false);
    setFormError(null);
  }, []);

  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    if (text) {
      setApiKey(text.trim());
      setFormError(null);
    }
  }, []);

  const submit = useCallback(async () => {
    const trimmedKey = apiKey.trim();
    if (!isValidApiKey(trimmedKey)) {
      setFormError('INVALID');
      return;
    }

    const editingId = editing?.mode === 'edit' ? editing.id : null;
    const clash = accounts.find((account) => account.apiKey === trimmedKey && account.id !== editingId);
    if (clash) {
      setFormError('DUPLICATE');
      return;
    }

    const saved = editingId
      ? await updateAccount(editingId, { label, apiKey: trimmedKey })
      : await addAccount({ label, apiKey: trimmedKey });

    if (saved) closeForm();
  }, [accounts, addAccount, apiKey, closeForm, editing, label, updateAccount]);

  const editor = (
    <div className='flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3'>
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t('accounts.labelPlaceholder')}
        className='h-8 text-xs'
      />
      <div className='flex gap-2'>
        <Input
          type={showApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            setFormError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') closeForm();
          }}
          placeholder={t('apiKey.placeholder')}
          className='flex-1 font-mono text-xs h-8'
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-8 px-2'
          onClick={() => setShowApiKey(!showApiKey)}
          title={showApiKey ? t('apiKey.hide') : t('apiKey.show')}
        >
          {showApiKey ? <EyeOff className='w-3.5 h-3.5' /> : <Eye className='w-3.5 h-3.5' />}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='h-8 px-2'
          onClick={handlePaste}
          title={t('apiKey.paste')}
        >
          <ClipboardPaste className='w-3.5 h-3.5' />
        </Button>
      </div>

      {formError && (
        <p className='flex items-center gap-1 text-[10px] text-destructive/80'>
          <AlertCircle className='w-3 h-3 shrink-0' />
          {formError === 'DUPLICATE' ? t('accounts.duplicate') : t('apiKey.invalid')}
        </p>
      )}

      <div className='flex gap-2'>
        <Button type='button' size='sm' className='rounded-full h-7 px-3 text-xs' disabled={isBusy} onClick={submit}>
          {isBusy ? <Loader2 className='w-3 h-3 animate-spin' /> : null}
          {t('common.save')}
        </Button>
        <Button type='button' variant='ghost' size='sm' className='rounded-full h-7 px-3 text-xs' onClick={closeForm}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium'>{t('accounts.title')}</CardTitle>
        <CardDescription className='text-xs'>{t('apiKey.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {accounts.length === 0 && editing?.mode !== 'add' && <p className='text-xs text-muted-foreground'>{t('accounts.empty')}</p>}

        {accounts.map((account, index) => {
          if (editing?.mode === 'edit' && editing.id === account.id) {
            return <div key={account.id}>{editor}</div>;
          }

          if (editing?.mode === 'confirm-delete' && editing.id === account.id) {
            return (
              <div
                key={account.id}
                className='flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2'
              >
                <p className='flex-1 min-w-0 text-[11px] text-destructive/80'>
                  {t('accounts.removeConfirm', { label: account.label })}
                </p>
                <Button
                  type='button'
                  variant='destructive'
                  size='sm'
                  className='rounded-full h-7 px-3 text-xs'
                  onClick={async () => {
                    if (await removeAccount(account.id)) setEditing(null);
                  }}
                >
                  {t('common.remove')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='rounded-full h-7 px-3 text-xs'
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            );
          }

          return (
            <div key={account.id} className='flex items-center gap-1.5 rounded-lg border border-border/40 px-2 py-1.5'>
              <div className='flex flex-col'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-4 w-5 p-0'
                  disabled={index === 0}
                  title={t('common.moveUp')}
                  onClick={() => moveAccount(account.id, -1)}
                >
                  <ChevronUp className='w-3 h-3' />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='h-4 w-5 p-0'
                  disabled={index === accounts.length - 1}
                  title={t('common.moveDown')}
                  onClick={() => moveAccount(account.id, 1)}
                >
                  <ChevronDown className='w-3 h-3' />
                </Button>
              </div>
              <span className='flex-1 min-w-0 truncate text-xs font-medium'>{account.label}</span>
              <span className='font-mono text-xs text-muted-foreground'>{maskKey(account.apiKey)}</span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 w-7 p-0'
                title={t('common.edit')}
                onClick={() => openEdit(account)}
              >
                <Pencil className='w-3 h-3' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 w-7 p-0 text-destructive/70 hover:text-destructive'
                title={t('common.remove')}
                onClick={() => setEditing({ mode: 'confirm-delete', id: account.id })}
              >
                <Trash2 className='w-3 h-3' />
              </Button>
            </div>
          );
        })}

        {editing?.mode === 'add'
          ? editor
          : (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='rounded-full h-8 px-3 text-xs self-start'
              onClick={openAdd}
            >
              <Plus className='w-3 h-3' />
              {t('accounts.add')}
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
