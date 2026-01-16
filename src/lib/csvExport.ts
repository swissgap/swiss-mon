// CSV Export utility for Swiss Target Scanner

interface ExportTarget {
  host: string;
  ip: string;
  type: string;
  method?: string;
  port?: number;
  is_admin?: boolean;
}

export function exportTargetsToCSV(targets: ExportTarget[], filename: string = 'swiss_targets.csv') {
  // CSV header
  const header = 'Domain;Network;Attack Type';
  
  // CSV rows
  const rows = targets.map(target => {
    const domain = target.host.replace(/^www\./, '');
    const network = target.ip || 'N/A';
    const attackType = `${target.type?.toUpperCase() || 'HTTP'} ${target.method || 'GET'}`;
    
    // Escape semicolons in values
    const escapedDomain = domain.replace(/;/g, ',');
    const escapedNetwork = network.replace(/;/g, ',');
    const escapedAttackType = attackType.replace(/;/g, ',');
    
    return `${escapedDomain};${escapedNetwork};${escapedAttackType}`;
  });
  
  // Combine header and rows
  const csvContent = [header, ...rows].join('\n');
  
  // Create blob and download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
