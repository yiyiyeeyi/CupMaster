import "server-only";
import type { Pool } from "pg";
import type { Database, Tables } from "@/types/database.types";

type Table = keyof Database["public"]["Tables"];
type Column<T extends Table> = Extract<keyof Tables<T>, string>;
type Values<T extends Table> = Partial<Tables<T>>;
type QueryError = { code?: string };
type QueryResult<T> = { data: T; error: null } | { data: null; error: QueryError };

const jsonColumns = new Set([
  "preferences", "recipe_snapshot", "brew_plan", "stage_results", "flavor_feedback",
  "analysis", "analysis_attempt", "record_details", "suggested_plan_handoff",
  "base_recipe_snapshot", "adjustments", "evidence", "applied_adjustment", "payload",
]);
const timestampOid = 1184;
const numericOid = 1700;
const bigintOid = 20;
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** Only server-owned repository code provides table names, columns and predicates. */
export class OwnerStore {
  constructor(private readonly pool: Pool, readonly userId: string) {}

  from<T extends Table>(table: T) {
    return new OwnerQuery(this.pool, table, this.userId);
  }
}

class OwnerQuery<T extends Table> implements PromiseLike<QueryResult<Tables<T>[]>> {
  private readonly owner: string;
  private readonly predicates: string[];
  private readonly parameters: unknown[];
  private sort = "";
  private maximum = "";
  private mutation?: { operation: "insert" | "update"; values: Values<T> };

  constructor(private readonly pool: Pool, private readonly table: T, userId: string) {
    this.owner = table === "profiles" ? "id" : "user_id";
    this.parameters = [userId];
    this.predicates = [`${identifier(this.owner)} = $1`];
  }

  select(_columns: "*" | "id") {
    void _columns;
    return this;
  }

  insert(values: Values<T>) {
    this.mutation = { operation: "insert", values };
    return this;
  }

  update(values: Values<T>) {
    this.mutation = { operation: "update", values };
    return this;
  }

  eq(column: Column<T>, value: unknown) {
    this.predicates.push(`${identifier(column)} = ${this.parameter(value)}`);
    return this;
  }

  is(column: Column<T>, value: null) {
    void value;
    this.predicates.push(`${identifier(column)} is null`);
    return this;
  }

  in(column: Column<T>, values: readonly string[]) {
    this.predicates.push(`${identifier(column)} = any(${this.parameter(values)})`);
    return this;
  }

  order(column: Column<T>, { ascending }: { ascending: boolean }) {
    this.sort = ` order by ${identifier(column)} ${ascending ? "asc" : "desc"}`;
    return this;
  }

  limit(count: number) {
    this.maximum = ` limit ${this.parameter(count)}`;
    return this;
  }

  private parameter(value: unknown) {
    this.parameters.push(value);
    return `$${this.parameters.length}`;
  }

  private async execute(): Promise<QueryResult<Tables<T>[]>> {
    const table = `public.${identifier(this.table)}`;
    const where = `where ${this.predicates.join(" and ")}`;
    let sql = `select * from ${table} ${where}${this.sort}${this.maximum}`;
    if (this.mutation) {
      const fields = Object.entries(this.mutation.values).filter(([column, value]) => column !== this.owner && value !== undefined);
      const values = fields.map(([column, value]) => this.parameter(jsonColumns.has(column) && value !== null ? JSON.stringify(value) : value));
      const columns = fields.map(([column]) => identifier(column));
      sql = this.mutation.operation === "insert"
        ? `insert into ${table} (${[identifier(this.owner), ...columns].join(", ")}) values (${["$1", ...values].join(", ")}) returning *`
        : `update ${table} set ${columns.map((column, index) => `${column} = ${values[index]}`).join(", ")} ${where} returning *`;
    }
    try {
      const { rows, fields } = await this.pool.query<Tables<T>>(sql, this.parameters);
      for (const field of fields) {
        if (![timestampOid, numericOid, bigintOid].includes(field.dataTypeID)) continue;
        for (const row of rows) {
          const record: Record<string, unknown> = row;
          const value = record[field.name];
          if (value instanceof Date) record[field.name] = value.toISOString();
          if ((field.dataTypeID === numericOid || field.dataTypeID === bigintOid) && typeof value === "string") {
            record[field.name] = Number(value);
          }
        }
      }
      return { data: rows, error: null };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
      return { data: null, error: { code } };
    }
  }

  then<TResult1 = QueryResult<Tables<T>[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Tables<T>[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async maybeSingle(): Promise<QueryResult<Tables<T> | null>> {
    const result = await this.execute();
    if (result.error) return result;
    return result.data.length > 1 ? { data: null, error: {} } : { data: result.data[0] ?? null, error: null };
  }

  async single(): Promise<QueryResult<Tables<T>>> {
    const result = await this.maybeSingle();
    if (result.error) return result;
    return result.data ? { data: result.data, error: null } : { data: null, error: {} };
  }
}
