import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CircleUser } from 'lucide-react';

import { Button } from '../components/ui/button';

type ProfileMountData = {
  authenticated: boolean;
  profileUrl: string;
};

function readMountData(host: HTMLElement): ProfileMountData {
  return {
    authenticated: host.dataset['authenticated'] === 'true',
    profileUrl: host.dataset['profileUrl'] || '/profile/',
  };
}

function ProfileHeaderButton({ data }: { data: ProfileMountData }): React.JSX.Element {
  const openSignIn = React.useCallback(() => {
    if (typeof window.showMaterialAuthDialog === 'function') {
      window.showMaterialAuthDialog('login');
    }
  }, []);

  const icon = (
    <CircleUser className="site-header__profile-toggle-icon" size={18} strokeWidth={2} aria-hidden />
  );

  if (data.authenticated) {
    return (
      <Button
        asChild
        variant="ghost"
        data-slot="button"
        className="site-header__profile-toggle"
      >
        <a href={data.profileUrl} aria-label="Profile">
          {icon}
        </a>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      data-slot="button"
      className="site-header__profile-toggle"
      onClick={openSignIn}
      aria-label="Sign in"
    >
      {icon}
    </Button>
  );
}

const profileHeaderRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnProfileHeaderButton(): void {
  const host = document.querySelector<HTMLElement>('#site-profile-mount');
  if (!host) {
    return;
  }
  const data = readMountData(host);
  let root = profileHeaderRoots.get(host);
  if (!root) {
    root = createRoot(host);
    profileHeaderRoots.set(host, root);
  }
  root.render(<ProfileHeaderButton data={data} />);
}
