'use client';

/**
 * UserAvatar — profile picture with initials fallback.
 *
 * If the user has a profilePicUrl, shows their photo.
 * Otherwise shows a coloured circle with their initials.
 * Supports multiple sizes: sm (32), md (40), lg (56), xl (80)
 */

import { useState } from 'react';

interface Props {
  name?:          string;   // kycName or display name for initials
  profilePicUrl?: string | null;
  size?:          'sm' | 'md' | 'lg' | 'xl';
  className?:     string;
  onClick?:       () => void;
}

const SIZE_MAP = {
  sm: 'w-8  h-8  text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

// Deterministic colour from name string
const COLOURS = [
  'bg-primary',    // blue
  'bg-purple-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-rose-500',
];

function colourFor(name: string): string {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return COLOURS[n % COLOURS.length];
}

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function UserAvatar({
  name, profilePicUrl, size = 'md', className = '', onClick,
}: Props) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = SIZE_MAP[size];
  const colour    = colourFor(name ?? 'user');
  const Tag       = onClick ? 'button' : 'div';

  if (profilePicUrl && !imgError) {
    return (
      <Tag
        onClick={onClick}
        className={`${sizeClass} rounded-full overflow-hidden flex-shrink-0 ${className} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      >
        <img
          src={profilePicUrl}
          alt={name ?? 'Profile'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </Tag>
    );
  }

  return (
    <Tag
      onClick={onClick}
      className={`${sizeClass} rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white ${colour} ${className} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
    >
      {initials(name)}
    </Tag>
  );
}
