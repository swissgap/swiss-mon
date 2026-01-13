import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Target, TargetWithStatus } from '@/types/target';

interface CheckResult {
  host: string;
  status: 'online' | 'offline' | 'warning';
  responseTime: number;
  statusCode?: number;
  error?: string;
}

export function useRealStatusCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checkedResults, setCheckedResults] = useState<Map<string, CheckResult>>(new Map());

  const checkBatch = useCallback(async (targets: Target[]): Promise<CheckResult[]> => {
    const { data, error } = await supabase.functions.invoke('check-target-status', {
      body: { targets },
    });

    if (error) {
      console.error('Error checking batch:', error);
      return [];
    }

    return data?.results || [];
  }, []);

  const checkAllTargets = useCallback(async (
    targets: TargetWithStatus[],
    onUpdate: (updated: TargetWithStatus[]) => void
  ) => {
    if (isChecking) return;
    
    setIsChecking(true);
    setProgress(0);
    
    const resultsMap = new Map<string, CheckResult>();
    const batchSize = 20;
    const totalBatches = Math.ceil(targets.length / batchSize);
    
    // Process in batches
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const batchTargets = batch.map(t => ({
        host: t.host,
        ip: t.ip,
        type: t.type,
        method: t.method,
        port: t.port,
        use_ssl: t.use_ssl,
      }));
      
      try {
        const results = await checkBatch(batchTargets);
        
        results.forEach(result => {
          resultsMap.set(result.host, result);
        });
        
        // Update progress
        const currentBatch = Math.floor(i / batchSize) + 1;
        setProgress((currentBatch / totalBatches) * 100);
        
        // Update targets with new results
        const updatedTargets = targets.map(target => {
          const result = resultsMap.get(target.host);
          if (result) {
            return {
              ...target,
              status: result.status,
              responseTime: result.responseTime,
              lastChecked: new Date(),
            };
          }
          return target;
        });
        
        onUpdate(updatedTargets);
        setCheckedResults(new Map(resultsMap));
        
        // Small delay between batches to avoid overwhelming
        if (i + batchSize < targets.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('Batch check failed:', error);
      }
    }
    
    setIsChecking(false);
    setProgress(100);
  }, [isChecking, checkBatch]);

  return {
    isChecking,
    progress,
    checkedResults,
    checkAllTargets,
  };
}
