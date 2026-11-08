'use client';

import React from 'react';
import type { Branch } from './useBranches';

/**
 * Selector de sede para zonas, repartidores y cuentas de cocina. Valor "" = sin sede
 * (emptyLabel explica qué significa en cada caso).
 */
export function BranchSelect({
  branches,
  value,
  onChange,
  emptyLabel,
  className,
  id,
  ariaLabel,
  disabled,
}: {
  branches: Branch[];
  value: string | null | undefined;
  onChange: (branchId: string | null) => void;
  emptyLabel: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const current = branches.find((branch) => branch.id === value);
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {branches
        .filter((branch) => branch.isActive || branch.id === current?.id)
        .map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {branch.isMain ? ' (principal)' : ''}
            {branch.isActive ? '' : ' (inactiva)'}
          </option>
        ))}
    </select>
  );
}
