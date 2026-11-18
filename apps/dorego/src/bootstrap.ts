import { bootAccountApp } from '@ldayton/ui/account-entry';
void bootAccountApp({ id: 'dorego', name: 'DoReGo', color: 'lime' }, () => import('./main'));
