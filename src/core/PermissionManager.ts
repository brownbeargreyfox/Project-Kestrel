// src/core/PermissionManager.ts
import type { PermissionChecker } from '../types/plugin';
import { PermissionError } from '../types/plugin';

export class PermissionManager {
  private pluginPermissions = new Map<string, Set<string>>();
  private permissionPolicies = new Map<string, boolean>();

  validatePermissions(pluginId: string, permissions: string[]): void {
    permissions.forEach((permission) => {
      if (!this.isValidPermission(permission)) {
        throw new PermissionError(permission, pluginId);
      }
    });

    const deniedPermissions = permissions.filter((permission) => !this.isPolicyAllowed(pluginId, permission));
    if (deniedPermissions.length > 0) {
      throw new PermissionError(deniedPermissions[0], pluginId);
    }

    this.pluginPermissions.set(pluginId, new Set(permissions));
  }

  createChecker(pluginId: string, permissions: string[]): PermissionChecker {
    const permissionSet = new Set(permissions);

    return {
      hasPermission: (scope: string) => permissionSet.has(scope),
      checkPermission: (scope: string) => {
        if (!permissionSet.has(scope)) {
          throw new PermissionError(scope, pluginId);
        }
      },
      getPermissions: () => Array.from(permissionSet),
    };
  }

  revokePermission(pluginId: string, permission: string): void {
    const permissions = this.pluginPermissions.get(pluginId);
    if (permissions) {
      permissions.delete(permission);
    }
  }

  grantPermission(pluginId: string, permission: string): void {
    if (!this.isValidPermission(permission)) {
      throw new Error(`Invalid permission: ${permission}`);
    }

    let permissions = this.pluginPermissions.get(pluginId);
    if (!permissions) {
      permissions = new Set();
      this.pluginPermissions.set(pluginId, permissions);
    }
    permissions.add(permission);
  }

  getPluginPermissions(pluginId: string): string[] {
    const permissions = this.pluginPermissions.get(pluginId);
    return permissions ? Array.from(permissions) : [];
  }

  setPermissionPolicy(pluginId: string, permission: string, allowed: boolean): void {
    const policyKey = `${pluginId}:${permission}`;
    this.permissionPolicies.set(policyKey, allowed);
  }

  private isValidPermission(permission: string): boolean {
    const permissionRegex = /^[a-z]+:[a-z]+(\.[a-z]+)?$/;
    return permissionRegex.test(permission);
  }

  private isPolicyAllowed(pluginId: string, permission: string): boolean {
    const policyKey = `${pluginId}:${permission}`;
    const policyOverride = this.permissionPolicies.get(policyKey);
    if (policyOverride !== undefined) {
      return policyOverride;
    }

    const dangerousPermissions = [
      'actions:system.restart',
      'data:config.write',
      'events:system',
    ];

    return !dangerousPermissions.includes(permission);
  }
}
