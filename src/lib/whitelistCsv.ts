export interface WhitelistExportRow {
  profile_id: string;
  wallet_address: string;
  claim_status: string;
  registered_at: string;
}

function csvCell(value: string): string {
  // Treat spreadsheet formula prefixes as literal text.
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function whitelistCsv(rows: WhitelistExportRow[]): string {
  return '\uFEFF' + [
    'wallet_address,claim_status,registered_at',
    ...rows.map(row => [row.wallet_address, row.claim_status, row.registered_at].map(csvCell).join(',')),
  ].join('\r\n') + '\r\n';
}