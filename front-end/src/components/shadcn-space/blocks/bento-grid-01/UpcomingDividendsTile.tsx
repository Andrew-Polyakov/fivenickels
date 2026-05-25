import * as React from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../ui/table';

export interface DividendRowPayload {
  symbol: string;
  href: string;
  type_label: string;
  ex_date_display: string;
  record_date_display: string;
  payable_date_display: string;
  rate_display: string;
}

export interface UpcomingDividendsTileProps {
  rows: DividendRowPayload[];
}

export default function UpcomingDividendsTile({ rows }: UpcomingDividendsTileProps) {
  if (!rows.length) {
    return (
      <p className="scn-bentogrid01__table-empty text-sm text-muted-foreground">
        No upcoming dividends. Run <code>sync_market_events</code>.
      </p>
    );
  }
  return (
    <div className="scn-bentogrid01__table-wrap overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Ex-date</TableHead>
            <TableHead>Record</TableHead>
            <TableHead>Payable</TableHead>
            <TableHead className="text-right">Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.symbol}-${row.ex_date_display}-${row.type_label}`}>
              <TableCell>
                <a href={row.href} className="font-medium hover:underline">
                  {row.symbol}
                </a>
              </TableCell>
              <TableCell>{row.type_label}</TableCell>
              <TableCell>{row.ex_date_display}</TableCell>
              <TableCell>{row.record_date_display}</TableCell>
              <TableCell>{row.payable_date_display}</TableCell>
              <TableCell className="text-right tabular-nums">{row.rate_display}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
