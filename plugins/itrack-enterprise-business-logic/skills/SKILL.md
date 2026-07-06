---
name: itrack-enterprise-business-logic
description: 'Use for any question involving ITrack Enterprise — data, business logic, calculations, reporting, how-to questions, or system architecture. Trigger on: sales orders, purchasing, work orders, labor efficiency, GL, AR, inventory, locations, warehouse management, vehicle teardown, cost pools, cores, Custom Fields, profit, COGS, AR aging, unpulled parts, bin locations, picking, shipping, variance, average cost, Q&A fields, any ITrack calculation, feature questions, permissions, or changelog.'
metadata:
  author: ISoft Data Systems, Inc.
  version: 2.0.0
  mcp-server: Enterprise-Api-Extension
  category: universal
---

# ITrack Enterprise — Business Logic and Reporting

---

## Query Approach — GraphQL First

> **Filter syntax, pagination, orderBy, and common mistakes are documented in this file below.** For domain-specific filter syntax, see the corresponding reference file. Always introspect before querying if field names are uncertain.

**Reference files — read before writing queries in these domains:**

- Custom Fields (Q&A fields), optionValues, Additional Fields → `references/custom-fields.md`
- Sales Order queries → `references/sales-order-schema.md`
- COGS / cost queries → `references/cogs-queries.md`
- GL / adjustment queries → `references/gl-categories-schema.md`
- Work Order queries → `references/work-order-schema.md`
- **Labor / time clock queries → `references/labor-time-clock-queries.md`** ← read this first; some data is not yet in the GraphQL API
- Purchasing queries → `references/purchasing-schema.md`
- Inventory queries → `references/inventory-schema.md`
- Location / warehouse queries → `references/locations-schema.md` ← also use for warehouse management, bin locations, inventory counts, cycle counts, inventory moves, barcode scanning
- Report building, dashboards, output format → `references/reporting-guidance.md`
- How-to questions, UI workflows, documentation → `references/help-routing.md`
- ITrack environment, hosting, components, architecture → `references/environment.md`

GraphQL (`query_graphql`) is available to all authenticated users and is the primary query method.

Some data is not yet available in the GraphQL API. Where noted, the **itrack-enterprise-mysql skill** may provide access if it is available to the user (it requires admin-level access and a separate agreement). If that skill is not available, direct the user to built-in reports or note the limitation clearly — do not fail silently.

## Authentication

### Required Sequence

1. Call `get_stores_for_login` to get available store IDs (works without auth)
2. Call `authenticate` with a `selectedStoreId`
   - If it succeeds → session is active, proceed with queries
   - If it returns `MCP error -32602: Tool authenticate disabled` → session already active, proceed normally
3. Proceed with queries — session persists until `close_session` is called

> ⚠️ **`-32602: Tool authenticate disabled` is not a failure.** It means the tool is already logged in. Do not treat this as an error — just continue to `query_graphql`.

---

## Critical Query Rules

### Variables Must Be a JSON Object, Not a String

Always pass `variables` as a plain JSON object — never as a JSON-encoded string:

```
# WRONG — causes Bad Request error
variables: "{"pagination": {"pageNumber": 1, "pageSize": 100}}"

# CORRECT
variables: {"pagination": {"pageNumber": 1, "pageSize": 100}}
```

As an alternative, inline values directly into the query string to avoid variables entirely:

```graphql
query { customers(pagination: { pageNumber: 1, pageSize: 100 }) { ... } }
```

### Always Introspect Before Querying

**Never guess field names, filter names, or pagination syntax.** Always check:

```graphql
# Object fields
{
  __type(name: "WorkOrder") {
    fields {
      name
      description
      type {
        name
        kind
        ofType {
          name
        }
      }
    }
  }
}

# Filter fields — ALWAYS introspect separately from the object type
{
  __type(name: "WorkOrderFilter") {
    inputFields {
      name
      type {
        name
        kind
        ofType {
          name
        }
      }
    }
  }
}

# Pagination structure
{
  __type(name: "PaginationOptions") {
    inputFields {
      name
      type {
        name
        kind
        ofType {
          name
        }
      }
    }
  }
}
```

Filter field names ≠ object field names. Introspect both.

> ⚠️ **GRAPHQL_VALIDATION_FAILED almost always means a wrong field name** — not a structural problem. Check field names against the schema before assuming the query shape is wrong.

### Decision Order

1. Introspect the object type
2. Introspect the filter input type
3. Introspect pagination
4. Write the query
5. If data is not in the GraphQL API, note the limitation and mention the MySQL skill if relevant

### GraphQL Field Name Gotchas

| Gotcha                 | Notes                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `UserAccount.name`     | Login/username — NOT `username`. `firstName` and `lastName` are separate optional fields.                                |
| `UserAccount.id`       | Primary key — not `userId`. The DB primary key is `useraccountid`, not `userid`.                                         |
| `userAccounts` query   | Query is `userAccounts`, not `users`. No pagination required — returns all accounts.                                     |
| `Customer.companyName` | Business name. `Customer` has no `name` field — use `companyName` for the business and `contactName` for the individual. |
| Worker groups          | `WorkerGroup` does not exist as a GraphQL type. If the MySQL skill is available, see `work-orders.md`.                   |

---

## orderBy Syntax

Most entities use a **string enum** for `orderBy` — not an `OrderByInstruction` object:

```graphql
orderBy: [date_ASC]
orderBy: [description_DESC]
orderBy: [stockNumber_ASC]
```

| Entity          | Enum type           | Example values                                       |
| --------------- | ------------------- | ---------------------------------------------------- |
| Inventory       | `InventorySort`     | `description_ASC`, `partNumber_DESC`, `quantity_ASC` |
| Sales Orders    | `SalesOrderSort`    | `date_ASC`, `date_DESC`                              |
| Vehicles        | `VehicleSort`       | `stockNumber_ASC`, `make_ASC`, `year_DESC`           |
| Work Orders     | `WorkOrderSort`     | `workOrderId_ASC`, `workOrderId_DESC`                |
| Purchase Orders | `PurchaseOrderSort` | `date_ASC`, `date_DESC`                              |

**Customers are the exception** — they use `OrderByInstruction` object syntax:

```graphql
orderBy: [{ field: "companyName", direction: ASC }]
```

> ⚠️ Using `{ field: "date", direction: ASC }` on non-customer entities throws: `Enum "XSort" cannot represent non-enum value`. Use `explore_schema` on the entity's sort enum to see all valid values.

---

## Pagination

All list queries use page-number-based pagination via `PaginationOptions`:

```graphql
input PaginationOptions {
  pageNumber: Int! = 1
  pageSize: Int! = 100
}
```

Every list response returns:

```graphql
type PageInfo {
  pageNumber: Int!
  pageSize: Int!
  totalPages: Int!
}
```

> ⚠️ **The count field is `totalItems`, not `totalCount`.** Using `totalCount` will cause a schema error.

**Core rules:**

1. Always request `totalItems` and `pageInfo` — required to know if there are more pages
2. Recommended page sizes: UI browsing = 20–50, data processing = 100–500, full retrieval = 500–1000
3. Iterate until `pageInfo.pageNumber >= pageInfo.totalPages`
4. Always filter before paginating — never fetch unfiltered then filter in code
5. Always use `orderBy` for consistent multi-page results

**Count-only pattern** — `pageSize: 1` returns `totalItems` for the full filtered set with minimal data:

```graphql
inventories(pagination: { pageNumber: 1, pageSize: 1 }, filter: { statuses: [A, H], stores: [1] }) {
  totalItems
  pageInfo { pageNumber totalPages }
}
```

**Deep nesting performance** — fetching nested relationships causes severe response time degradation:

| Nesting depth                            | Recommended outer `pageSize` |
| ---------------------------------------- | ---------------------------- |
| 1 level (SO → lines)                     | 50–100                       |
| 2 levels (SO → lines → job)              | 25–50                        |
| 3+ levels (SO → lines → job → workOrder) | 10–25                        |

Response times are not consistent across pages — a denser page can take 25 seconds while others take 7. Use smaller page sizes and iterate rather than risking timeouts.

---

## Common Query Mistakes

| Mistake                                                        | Fix                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `variables` passed as a JSON-encoded string                    | Pass as plain object: `{"pageNumber": 1}` not `"{\"pageNumber\": 1}"`                                                          |
| Omitting `pageInfo`                                            | Always include — can't know if there are more pages without it                                                                 |
| `totalCount` instead of `totalItems`                           | Field is `totalItems` — `totalCount` does not exist                                                                            |
| Assuming page 1 has all data                                   | Always check `totalPages > 1`                                                                                                  |
| `pageSize: 10000`                                              | Cap at 1000; iterate instead                                                                                                   |
| No `orderBy` across pages                                      | Add a stable sort field                                                                                                        |
| Filtering in code after full fetch                             | Filter in the query                                                                                                            |
| `storeId: { eq: 1 }` on inventory/vehicles                     | Use `stores: [1]` (list of IDs)                                                                                                |
| `customerFilter: { ids: [456] }` on salesOrders                | Known backend bug — throws `ER_BAD_FIELD_ERROR`. Workaround: filter in code or use `SalesOrderKey`                             |
| `SalesOrderFilter.ids: [43685]` (int or string)                | `ids` takes `SalesOrderKey` objects: `ids: [{ storeId: 2, salesOrderId: 43685 }]`                                              |
| `SalesOrderFilter.date: { from: "...", to: "..." }`            | Use comparison operators: `date: { gte: "...", lte: "..." }`                                                                   |
| `salesOrder { lines { id type } }`                             | `lines` is paginated: `lines(pagination: { pageNumber: 1, pageSize: 100 }) { totalItems items { ... } }`                       |
| `active: { eq: true }` on customers                            | Use `active: true` (plain Boolean)                                                                                             |
| `status: ACTIVE` on inventory                                  | Use `statuses: [A]` (enum list)                                                                                                |
| `orderBy: [{ field: "date" }]` on SOs/inventory/WOs/POs        | Use string enum: `orderBy: [date_ASC]`. Only customers use `OrderByInstruction`.                                               |
| Widening date range to catch records by a different date field | `date` is always creation date on SOs, POs, TOs. Use `dateClosed` on Work Orders instead.                                      |
| `storeId: [2]` on workOrders                                   | Work Orders use `store: { id: [2] }` — not `storeId`                                                                           |
| `model` on vehicles as plain field                             | `model` is object type — use `model { name }`                                                                                  |
| `customerUnit { make model { name } }` on work orders          | `CustomerUnit` has no `make` or `model` — available fields are `unitNumber`, `year`, `vin`, `serialNumber`, `mileage`, `notes` |
| Querying only `addresses` for customer address lookups         | Billing address is on top-level customer fields. Always check both.                                                            |

---

## Custom Fields — When to Include

Read `references/custom-fields.md` and automatically include Custom Fields in your response (without the user asking) when:

- User asks to "show all info" or "full details" about a customer, vendor, inventory part, or vehicle
- User asks about a field that doesn't exist on the standard record type
- User mentions "Q&A fields", "custom fields", "flex fields", "additional fields", or "more labels"
- The question implies database-specific data (e.g., industry-specific fields unique to their setup)

Always look up `customerOptions` / `vendorOptions` / `inventoryOptions` first to understand what Custom Fields exist before claiming a field doesn't exist. For inventory parts, also check `inventoryType.typeFieldLabel1`–`4` — the field may be a type-specific Additional Field.

---

## ITrack App Disambiguation

ITrack has two apps — **Web** and **Desktop** — with different UIs and workflows. For how-to questions:

- **If the user has already stated which app they're using, assume it for all subsequent questions — do not ask again.**
- **If unknown**, ask before fetching documentation:
  > "Are you using the ITrack Enterprise **web app** or the **desktop app**? The steps differ between them."
- **For conceptual questions** (how something works, not how to click through it) — no need to ask, fetch from either source.

Read `references/help-routing.md` for all how-to, workflow, feature, changelog, and environment questions.

---

## Resolving Relative Dates

**Always call `get_current_date` before building any query with relative date language:** "today", "yesterday", "this week", "last week", "this month", "last month", "this year", "last year", "YTD", "recent", "current", "past X days."

Derive date ranges after receiving the result. Show the resolved range to the user before executing.

---

## Business Logic: Cost of Goods Sold (COGS)

> Read `references/cogs-queries.md` for business logic, query patterns, and the COGS by inventory type table. COGS also touches:
>
> - `references/sales-order-schema.md` — `SalesOrderLine.averageCost` for line-level cost
> - `references/gl-categories-schema.md` — GL-based COGS, document linkage
> - `references/inventory-schema.md` — vehicle cost pool, `Vehicle.remainingCost`

---

## Business Logic: GL Categories

> Read `references/gl-categories-schema.md` for business logic, adjustment type flags, and GL document types. GL also touches:
>
> - `references/cogs-queries.md` — GL-based COGS, `percentOfPrice` rate
> - `references/sales-order-schema.md` — SO document types post GL entries
> - `references/purchasing-schema.md` — PO receiving posts GL entries
> - `references/work-order-schema.md` — WO finalization posts GL entries

---

## Business Logic: Labor Efficiency and Time Clock

> Read `references/labor-time-clock-queries.md` for all labor business logic, column name reference, efficiency patterns, and confirmed query patterns. Time clock data is not in the GraphQL API — MySQL skill required for raw clock queries. Labor also touches:
>
> - `references/work-order-schema.md` — WO type flags, `billingHours`, date anchors
> - `references/reporting-guidance.md` — efficiency report caveats, proportional attribution

---