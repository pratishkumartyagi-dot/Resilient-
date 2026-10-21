import { version as packageVersion } from "../../package.json";

/**
 * The single source of truth for the build version shown in the UI.
 * Kept in sync with package.json, which is also what electron-builder stamps
 * into the produced installers.
 */
export const APP_VERSION: string = packageVersion;
