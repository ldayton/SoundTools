import { Account } from '@ldayton/account';
import { diagnostics } from './diagnostics';
export const account = new Account('dorego', (code) => diagnostics.event('account.' + code));
