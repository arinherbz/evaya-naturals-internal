import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('simplified navigation', () => {
  it('shows expenses in the app and removes suppliers from active navigation', () => {
    const sidebarSource = readFileSync(resolve(process.cwd(), 'client/src/components/Sidebar.tsx'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');

    expect(sidebarSource).toContain("label: 'Expenses'");
    expect(sidebarSource).not.toContain("label: 'Suppliers'");
    expect(appSource).toContain("path=\"/expenses\"");
    expect(appSource).not.toContain("path=\"/suppliers\"");
  });

  it('keeps role-limited items behind explicit allowRoles checks', () => {
    const sidebarSource = readFileSync(resolve(process.cwd(), 'client/src/components/Sidebar.tsx'), 'utf8');

    expect(sidebarSource).toContain("if (!permission) return !allowRoles || allowRoles.length === 0;");
    expect(sidebarSource).toContain("label: 'Settings'");
    expect(sidebarSource).toContain("label: 'Products'");
    expect(sidebarSource).toContain("label: 'Deliveries'");
  });
});
