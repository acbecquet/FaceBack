type P = { className?: string };
const S = (props: { children: React.ReactNode } & P) => (
  <svg viewBox="0 0 24 24" className={props.className ?? "fb-icon"} aria-hidden="true">
    {props.children}
  </svg>
);
export const PhotoIcon = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-4.5-4.5L11 17l-2.5-2.5L3 19" />
  </S>
);
export const SwitchCameraIcon = (p: P) => (
  <S {...p}>
    <path d="M20 11a8 8 0 00-14-4.5L4 8" />
    <path d="M4 13a8 8 0 0014 4.5L20 16" />
    <path d="M4 4v4h4" />
    <path d="M20 20v-4h-4" />
  </S>
);
export const GearIcon = (p: P) => (
  <S {...p}>
    <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);
export const EyeIcon = (p: P) => (<S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></S>);
export const LockIcon = (p: P) => (<S {...p}><rect x="5" y="11" width="14" height="9" rx="2.2" /><path d="M8 11V8a4 4 0 018 0v3" /></S>);
export const DownloadIcon = (p: P) => (<S {...p}><path d="M12 4v10" /><path d="M8 10.5l4 4 4-4" /><path d="M5 20h14" /></S>);
export const RetryIcon = (p: P) => (<S {...p}><path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 005.5 6.5L3.5 8.5" /><path d="M3.5 3.5v5h5" /></S>);
export const TrashIcon = (p: P) => (<S {...p}><path d="M4 7h16" /><path d="M9 7V5.4A1.4 1.4 0 0110.4 4h3.2A1.4 1.4 0 0115 5.4V7" /><path d="M6.2 7l1 12.2a1.5 1.5 0 001.5 1.4h6.6a1.5 1.5 0 001.5-1.4L18 7" /><path d="M10 11v6M14 11v6" /></S>);
export const PersonIcon = (p: P) => (<S {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.6 20a6.5 6.5 0 0112.8 0" /></S>);
export const KeyIcon = (p: P) => (<S {...p}><circle cx="8" cy="15" r="3.4" /><path d="M10.4 12.6L20 3M17 6l2.2 2.2M14.4 8.6l2.2 2.2" /></S>);
export const SignOutIcon = (p: P) => (<S {...p}><path d="M14 4.5h3.5A1.5 1.5 0 0119 6v12a1.5 1.5 0 01-1.5 1.5H14" /><path d="M10 12h9.5" /><path d="M15.5 8l4 4-4 4" /></S>);
export const ChevronIcon = (p: P) => (<S {...p}><path d="M9 6l6 6-6 6" /></S>);
export const BackIcon = (p: P) => (<S {...p}><path d="M15 6l-6 6 6 6" /></S>);
export const CheckIcon = (p: P) => (<S {...p}><path d="M5 13l4 4 10-11" /></S>);
export const CameraIcon = (p: P) => (<S {...p}><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8.5 7l1.2-2.2h4.6L15.5 7" /><circle cx="12" cy="13.5" r="3.4" /></S>);
export const GridIcon = (p: P) => (<S {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></S>);
export const LinkIcon = (p: P) => (<S {...p}><path d="M9 15l6-6" /><path d="M10.6 6.4l1.7-1.7a3.5 3.5 0 014.95 4.95l-1.7 1.7" /><path d="M13.4 17.6l-1.7 1.7a3.5 3.5 0 01-4.95-4.95l1.7-1.7" /></S>);
export const CopyIcon = (p: P) => (<S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6.5A1.5 1.5 0 016.5 5H15" /></S>);
export const ClockIcon = (p: P) => (<S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>);
