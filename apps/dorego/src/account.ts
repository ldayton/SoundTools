import { Account } from '@ldayton/account';
import { diagnostics } from './diagnostics';
export const account = new Account('dorego', (code, error, details) =>
  error
    ? diagnostics.capture(error, 'account.' + code, details)
    : diagnostics.event('account.' + code, details)
);
