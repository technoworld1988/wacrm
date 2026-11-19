'use client';

import { useEffect, useState } from 'react';
import { BellRing, CircleAlert, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getCurrentSubscription,
  isIos,
  isPushSupported,
  isStandalone,
  registerServiceWorker,
  sendTestPush,
} from '@/lib/push/client';

type State = 'loading' | 'on' | 'off' | 'unsupported' | 'ios-install';

/**
 * "Phone & background notifications" — Web Push for this device. Unlike
 * the browser-notifications card above it, these arrive with the CRM
 * closed (phone locked, tab closed), via the service worker.
 */
export function PushNotificationsCard({ className }: { className?: string }) {
  const t = useTranslations('Settings.pushNotifications');
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isIos() && !isStandalone()) {
        if (!cancelled) setState('ios-install');
        return;
      }
      if (!isPushSupported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      await registerServiceWorker();
      const sub = await getCurrentSubscription();
      if (!cancelled) setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await disablePushOnThisDevice();
        setState('off');
        return;
      }
      const result = await enablePushOnThisDevice();
      if (result === 'enabled') {
        setState('on');
        toast.success(t('enabledToast'));
      } else if (result === 'denied') {
        toast.error(t('deniedToast'), { description: t('deniedHint') });
      } else if (result === 'not-configured') {
        toast.error(t('notConfigured'));
      } else if (result === 'unsupported') {
        setState('unsupported');
      } else {
        toast.error(t('errorToast'));
      }
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    try {
      const delivered = await sendTestPush(t('testTitle'), t('testBody'));
      if (delivered > 0) toast.success(t('testSent'));
      else toast.error(t('testFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Smartphone className="size-4 text-muted-foreground" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleAlert className="size-4 shrink-0" />
            {t('notConfigured')}
          </p>
        ) : state === 'ios-install' ? (
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium text-foreground">{t('iosTitle')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t('iosStep1')}</li>
              <li>{t('iosStep2')}</li>
              <li>{t('iosStep3')}</li>
            </ol>
          </div>
        ) : state === 'unsupported' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleAlert className="size-4 shrink-0" />
            {t('unsupported')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('toggleLabel')}</p>
                <p className="text-xs text-muted-foreground">{t('toggleDesc')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(busy || state === 'loading') && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                <Switch
                  checked={state === 'on'}
                  onCheckedChange={(next) => void onToggle(next)}
                  disabled={busy || state === 'loading'}
                  aria-label={t('toggleLabel')}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onTest()}
              disabled={busy || state !== 'on'}
            >
              <BellRing className="size-4" />
              {t('sendTest')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
