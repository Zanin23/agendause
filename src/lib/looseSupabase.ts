import { supabase } from "@/integrations/supabase/client";

export type DatabaseRow = Record<string, unknown>;

export type LooseQueryResult = {
  data: unknown;
  error: unknown | null;
};

export interface LooseQuery extends PromiseLike<LooseQueryResult> {
  select(columns?: string): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(count: number): LooseQuery;
  insert(values: unknown): LooseQuery;
  upsert(values: unknown, options?: { onConflict?: string }): LooseQuery;
  update(values: unknown): LooseQuery;
  delete(): LooseQuery;
  single(): LooseQuery;
  maybeSingle(): LooseQuery;
}

export const looseSupabase = supabase as unknown as {
  from(table: string): LooseQuery;
};

export function isDatabaseRow(value: unknown): value is DatabaseRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asDatabaseRow(value: unknown): DatabaseRow {
  if (!isDatabaseRow(value)) throw new Error("O banco retornou um registro inválido.");
  return value;
}

export function asDatabaseRows(value: unknown): DatabaseRow[] {
  return Array.isArray(value) ? value.filter(isDatabaseRow) : [];
}
