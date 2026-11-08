import type { ReactNode } from 'react';

// Thin-line icons drawn inline (Lucide geometry, ISC licence) to avoid an icon dependency.
type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return <Icon {...props}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 6 9 17l-5-5" /></Icon>;
}

function LeafIcon(props: IconProps) {
  return <Icon {...props}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></Icon>;
}

function FootprintsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
      <path d="M16 17h4" />
      <path d="M4 13h4" />
    </Icon>
  );
}

function HammerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" />
      <path d="m18 15 4-4" />
      <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
    </Icon>
  );
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  if (category === 'Bestiary') return <LeafIcon className={className} />;
  if (category === 'Crafting') return <HammerIcon className={className} />;
  return <FootprintsIcon className={className} />;
}

export function SkillIcon({ skill }: { skill: string }) {
  if (skill === 'Crafting') return <HammerIcon className="icon-lg" />;
  if (skill === 'Bestiary') return <Icon className="icon-lg"><ellipse cx="7" cy="7" rx="2" ry="3" /><ellipse cx="17" cy="7" rx="2" ry="3" /><ellipse cx="3" cy="12" rx="1.5" ry="2.5" /><ellipse cx="21" cy="12" rx="1.5" ry="2.5" /><path d="M6 19c0-3 3-7 6-7s6 4 6 7c0 2-3 2-6 1-3 1-6 1-6-1Z" /></Icon>;
  return <Icon className="icon-lg"><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></Icon>;
}

export function CameraIcon(props: IconProps) {
  return <Icon {...props}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></Icon>;
}

export function MapPinIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></Icon>;
}
