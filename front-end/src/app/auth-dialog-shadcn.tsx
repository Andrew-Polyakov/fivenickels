import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export type AuthTab = 'login' | 'signup';

type AuthDialogRuntimeData = {
  loginUrl: string;
  signupUrl: string;
  next: string;
  csrfToken: string;
  tab: AuthTab;
};

type AuthDialogShellProps = {
  data: AuthDialogRuntimeData;
  onClose: () => void;
};

function AuthDialogShell({ data, onClose }: AuthDialogShellProps): React.JSX.Element {
  const [tab, setTab] = React.useState<AuthTab>(data.tab);

  React.useEffect(() => {
    setTab(data.tab);
  }, [data.tab]);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent aria-describedby="auth-dialog-description">
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            className="scn-dialog-close"
            aria-label="Close dialog"
          >
            x
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Welcome</DialogTitle>
          <DialogDescription id="auth-dialog-description">
            Sign in to your account or create a new one.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as AuthTab)}>
          <TabsList>
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form className="scn-auth-form" method="post" data-turbo="false" action={data.loginUrl}>
              <input type="hidden" name="csrfmiddlewaretoken" value={data.csrfToken} />
              <input type="hidden" name="next" value={data.next} />
              <div className="scn-field">
                <Label htmlFor="auth-login-username">Username or email</Label>
                <Input id="auth-login-username" name="username_or_email" autoComplete="username" required />
              </div>
              <div className="scn-field">
                <Label htmlFor="auth-login-password">Password</Label>
                <Input id="auth-login-password" type="password" name="password" autoComplete="current-password" required />
              </div>
              <div className="scn-field" aria-hidden="true" style={{ visibility: 'hidden' }}>
                <Label>&nbsp;</Label>
                <Input disabled tabIndex={-1} />
              </div>
              <div className="scn-field" aria-hidden="true" style={{ visibility: 'hidden' }}>
                <Label>&nbsp;</Label>
                <Input disabled tabIndex={-1} />
              </div>
              <Button type="submit">Sign in</Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form className="scn-auth-form" method="post" data-turbo="false" action={data.signupUrl}>
              <input type="hidden" name="csrfmiddlewaretoken" value={data.csrfToken} />
              <input type="hidden" name="next" value={data.next} />
              <div className="scn-field">
                <Label htmlFor="auth-signup-username">Username</Label>
                <Input id="auth-signup-username" name="username" autoComplete="username" required />
              </div>
              <div className="scn-field">
                <Label htmlFor="auth-signup-email">Email</Label>
                <Input id="auth-signup-email" type="email" name="email" autoComplete="email" required />
              </div>
              <div className="scn-field">
                <Label htmlFor="auth-signup-password1">Password</Label>
                <Input id="auth-signup-password1" type="password" name="password1" autoComplete="new-password" required />
              </div>
              <div className="scn-field">
                <Label htmlFor="auth-signup-password2">Confirm password</Label>
                <Input id="auth-signup-password2" type="password" name="password2" autoComplete="new-password" required />
              </div>
              <Button type="submit">Create account</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

type AuthDialogBridgeApi = {
  openAuthDialog: (tab: AuthTab) => void;
};

export function mountShadcnAuthDialogBridge(): AuthDialogBridgeApi {
  const host = document.createElement('div');
  host.id = 'shadcn-auth-dialog-root';
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  let currentData: AuthDialogRuntimeData | null = null;

  const readRuntimeData = (tab: AuthTab): AuthDialogRuntimeData => {
    const body = document.body;
    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]') as HTMLInputElement | null;
    const loginUrl = body.getAttribute('data-auth-login-url') || '/auth/login/';
    const signupUrl = body.getAttribute('data-auth-signup-url') || '/auth/signup/';
    const next = body.getAttribute('data-auth-next') || window.location.pathname;
    const csrfToken = csrfInput?.value || getCookie('csrftoken') || '';
    return { loginUrl, signupUrl, next, csrfToken, tab };
  };

  const render = (): void => {
    if (!currentData) {
      root.render(<></>);
      return;
    }
    root.render(
      <AuthDialogShell
        data={currentData}
        onClose={() => {
          currentData = null;
          render();
        }}
      />
    );
  };

  return {
    openAuthDialog: (tab: AuthTab) => {
      currentData = readRuntimeData(tab);
      render();
    },
  };
}

function getCookie(name: string): string {
  const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}
