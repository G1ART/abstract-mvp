/**
 * @deprecated Imports moved to `@/lib/entitlements/*`. This file re-exports
 * the barrel so existing `import { hasFeature, getMyEntitlements } from
 * "@/lib/entitlements"` call sites keep working. New code should prefer
 * `useFeatureAccess` (client) or `resolveEntitlementForServer` (server).
 */

export * from "./entitlements/index";
