/**
 * The extension's instance of the shared API client. Only the base-URL policy
 * (lib/config.ts) is extension-specific.
 */
import { createApiClient } from '@authbox/api-client';
import { getApiBase } from './config';

export const api = createApiClient(getApiBase);
