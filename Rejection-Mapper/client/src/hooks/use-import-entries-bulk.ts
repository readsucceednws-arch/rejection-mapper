/**
 * useImportEntries Hook
 * 
 * Provides a convenient way to import rejection/rework entries from CSV/Excel data.
 * Handles both dry-run (preview) and actual imports.
 * 
 * Usage:
 * const { importEntries, isImporting, lastResult } = useImportEntries();
 * 
 * // Dry run first
 * await importEntries(rows, { dryRun: true });
 * console.log(lastResult.summary);
 * 
 * // Then actual import
 * await importEntries(rows, { dryRun: false });
 */

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export interface ImportRow {
  [key: string]: any;
}

export interface ImportOptions {
  dryRun?: boolean;
}

export interface ImportSummary {
  totalRows: number;
  successfulImports: number;
  failedRows: Array<{
    success: false;
    rowIndex: number;
    reason: string;
  }>;
  created: {
    parts: number;
    rejectionTypes: number;
    reworkTypes: number;
    zones: number;
  };
  warnings: string[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  summary: ImportSummary;
  logs: string[];
}

export function useImportEntries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const importEntries = async (
    rows: ImportRow[],
    options: ImportOptions = {}
  ): Promise<ImportResult | null> => {
    try {
      setIsImporting(true);

      const response = await fetch('/api/import-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rows,
          dryRun: options.dryRun,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Import failed with status ${response.status}`);
      }

      const result: ImportResult = await response.json();
      setLastResult(result);

      // Show summary toast
      if (options.dryRun) {
        toast({
          title: 'Dry Run Preview',
          description: `Would import ${result.summary.successfulImports} of ${result.summary.totalRows} rows`,
          variant: result.summary.failedRows.length > 0 ? 'destructive' : 'default',
        });
      } else {
        toast({
          title: 'Import Complete',
          description: result.message,
          variant: result.summary.failedRows.length > 0 ? 'destructive' : 'default',
        });

        // Invalidate queries to refresh data
        if (result.summary.successfulImports > 0) {
          await queryClient.invalidateQueries({ queryKey: ['/api/rejection-entries'] });
          await queryClient.invalidateQueries({ queryKey: ['/api/rework-entries'] });
          await queryClient.invalidateQueries({ queryKey: ['/api/parts'] });
          await queryClient.invalidateQueries({ queryKey: ['/api/rejection-types'] });
          await queryClient.invalidateQueries({ queryKey: ['/api/rework-types'] });
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      console.error('[useImportEntries]', error);
      
      toast({
        title: 'Import Failed',
        description: message,
        variant: 'destructive',
      });

      return null;
    } finally {
      setIsImporting(false);
    }
  };

  return {
    importEntries,
    isImporting,
    lastResult,
  };
}

/**
 * Helper to parse CSV/Excel rows from file
 * Returns array of row objects
 */
export function parseRowsFromCSV(csvText: string): ImportRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length <= 1) return [];

  // Parse header
  const header = lines[0]
    .split(',')
    .map((h) => h.trim().replace(/^"|"$/g, ''));

  // Parse data rows
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    if (values.some((v) => v.length > 0)) {
      const row: ImportRow = {};
      header.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Example usage in a component:
 * 
 * function ImportEntriesDialog() {
 *   const { importEntries, isImporting, lastResult } = useImportEntries();
 * 
 *   const handleImport = async (file: File) => {
 *     const text = await file.text();
 *     const rows = parseRowsFromCSV(text);
 * 
 *     // First: dry run
 *     const preview = await importEntries(rows, { dryRun: true });
 *     if (!preview || preview.summary.failedRows.length > 0) {
 *       // Show preview and ask for confirmation
 *       const confirmed = await showConfirmation(preview);
 *       if (!confirmed) return;
 *     }
 * 
 *     // Then: actual import
 *     await importEntries(rows, { dryRun: false });
 *   };
 * 
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         onChange={(e) => handleImport(e.target.files?.[0]!)}
 *         disabled={isImporting}
 *       />
 * 
 *       {lastResult && (
 *         <div>
 *           <h3>Import Summary</h3>
 *           <p>Successful: {lastResult.summary.successfulImports} / {lastResult.summary.totalRows}</p>
 *           <p>Created parts: {lastResult.summary.created.parts}</p>
 *           
 *           {lastResult.summary.failedRows.length > 0 && (
 *             <div>
 *               <h4>Failed Rows:</h4>
 *               {lastResult.summary.failedRows.map((row) => (
 *                 <p key={row.rowIndex}>
 *                   Row {row.rowIndex}: {row.reason}
 *                 </p>
 *               ))}
 *             </div>
 *           )}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 */
