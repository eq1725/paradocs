// Adapter Registry - manages all data source adapters

import { SourceAdapter } from '../types';
import { nuforcAdapter } from './nuforc';

// Registry of all available adapters
const adapters: Record<string, SourceAdapter> = {
    nuforc: nuforcAdapter,
};

// Get an adapter by type
export function getAdapter(adapterType: string): SourceAdapter | null {
    return adapters[adapterType] || null;
}

// List all available adapter types
export function listAdapters(): string[] {
    return Object.keys(adapters);
}

// Re-export individual adapters
export { nuforcAdapter };
