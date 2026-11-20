"use client";

// In-app replacement for window.confirm().
//
// Native confirm/alert boxes are blocked in some browsers — the Claude
// desktop browser pane, several in-app browsers (Instagram/Facebook),
// and installed PWAs on some phones — where confirm() silently returns
// false. Every "Delete?" in the app then looked like a dead button.
//
// Usage (anywhere, no hook needed):
//   if (!(await confirmDialog(t("deleteConfirm"), { destructive: true }))) return;
//
// <ConfirmDialogHost /> is mounted once in the root layout. If it isn't
// mounted (e.g. a unit test), we fall back to window.confirm.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for deletes and other irreversible actions. */
  destructive?: boolean;
}

interface Request extends ConfirmOptions {
  message: string;
  resolve: (ok: boolean) => void;
}

let open: ((req: Request) => void) | null = null;

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!open) {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  }
  const show = open;
  return new Promise((resolve) => show({ ...options, message, resolve }));
}

export function ConfirmDialogHost() {
  const t = useTranslations("UiPrimitives");
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    open = (next) =>
      setReq((current) => {
        // A second request while one is showing: refuse the older one.
        current?.resolve(false);
        return next;
      });
    return () => {
      open = null;
    };
  }, []);

  const finish = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <Dialog open={req !== null} onOpenChange={(o) => !o && finish(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{req?.title ?? t("confirmTitle")}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{req?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(false)}>
            {req?.cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={req?.destructive ? "destructive" : "default"}
            onClick={() => finish(true)}
            autoFocus
          >
            {req?.confirmLabel ?? (req?.destructive ? t("delete") : t("ok"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
