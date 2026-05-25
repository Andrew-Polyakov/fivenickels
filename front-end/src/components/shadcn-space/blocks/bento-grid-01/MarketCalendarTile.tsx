import * as React from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../ui/table';

export interface CalendarRowPayload {
  session_date: string;
  session_date_display: string;
  pre_display: string;
  core_display: string;
  post_display: string;
  is_closed: boolean;
}

export interface MarketCalendarTileProps {
  rows: CalendarRowPayload[];
}

export default function MarketCalendarTile({ rows }: MarketCalendarTileProps) {
  if (!rows.length) {
    return (
      <p className="scn-bentogrid01__table-empty text-sm text-muted-foreground">
        No upcoming market sessions. Run <code>sync_market_events</code>.
      </p>
    );
  }
  return (
    <div className="scn-bentogrid01__table-wrap overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Pre-market</TableHead>
            <TableHead>Regular</TableHead>
            <TableHead>After-hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.session_date}>
              <TableCell className="font-medium whitespace-nowrap">
                {row.session_date_display}
              </TableCell>
              <TableCell className="text-sm">{row.pre_display}</TableCell>
              <TableCell
                className={
                  row.is_closed
                    ? 'text-sm font-medium text-muted-foreground'
                    : 'text-sm'
                }
              >
                {row.core_display}
              </TableCell>
              <TableCell className="text-sm">{row.post_display}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
