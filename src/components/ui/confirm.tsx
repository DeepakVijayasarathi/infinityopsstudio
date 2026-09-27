"use client";

import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; destructive?: boolean };
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Promise-based confirmation dialog: `if (await confirm({...})) doIt()` */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback<ConfirmFn>((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
            {state?.description && <DialogDescription>{state.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.destructive ? "destructive" : "default"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
