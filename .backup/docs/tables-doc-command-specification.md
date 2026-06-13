# Tables Doc Command Specification

## Purpose

`shot tables-doc <spec file> --output <table spec file>` validates a Data Sketch
Specification v1 YAML or JSON file and writes a Markdown table
specification.

## Usage

```sh
shot tables-doc <spec file> --output <table spec file>
shot tables-doc <spec file> -o <table spec file>
```

## Example

Command:

```sh
shot tables-doc online-shop-example.yaml --output online-shop-example.tables-doc.md
```

Input `online-shop-example.yaml`:

```yaml
data-sketch: 1.0.0-draft.1

info:
  name: online-shop

stores:
  customer:
    name: customers
    reason: Customer profiles need to be looked up when handling orders and support requests.
    traces:
      operations:
        - createCustomer
        - getCustomer
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
      publicId:
        name: public_id
        reason: Customers need a stable public identifier that doesn't reveal the internal sequential id.
        aliases:
          - customer number
          - customer code
        type:
          name: char
          length: 26
        format: ulid
        nullable: false
      name:
        name: name
        aliases:
          - customer full name
        type:
          name: varchar
          length: 100
        nullable: false
    keys:
      primary:
        name: pk_customers
        fields:
          - id
      unique:
        - name: ux_customers_public_id
          fields:
            - publicId
  order:
    name: orders
    reason: Customers need to view their order history and cancel orders that haven't shipped yet.
    traces:
      operations:
        - createOrder
        - getOrder
        - listOrders
        - cancelOrder
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
      publicId:
        name: public_id
        aliases:
          - order number
        type:
          name: char
          length: 26
        format: ulid
        nullable: false
      customerId:
        name: customer_id
        aliases:
          - buyer customer
        type:
          name: integer
        nullable: false
      status:
        name: status
        aliases:
          - order state
          - fulfillment status
        type:
          name: varchar
          length: 20
        nullable: false
        enum:
          - created
          - cancelled
    keys:
      primary:
        name: pk_orders
        fields:
          - id
      unique:
        - name: ux_orders_public_id
          fields:
            - publicId
      foreign:
        - name: fk_orders_customer
          fields:
            - customerId
          references:
            store: customer
            fields:
              - id
          onDelete: restrict
          onUpdate: restrict
    indexes:
      - name: ix_orders_status
        fields:
          - status
        reason: Used to search orders by status.
```

Output `online-shop-example.tables-doc.md`:

````md
---
source: online-shop-example.yaml
sha256: <sha256>
generated_at: <generated-at>
---

# online-shop

## customers

Customer profiles need to be looked up when handling orders and support requests.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | customer number, customer code |
| name | varchar(100) | no |  |  | customer full name |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_customers | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_customers\_public\_id | public\_id |

## orders

Customers need to view their order history and cancel orders that haven't shipped yet.

| Column | Data Type | Nullable | Default | Format | Description |
| --- | --- | --- | --- | --- | --- |
| id | integer | no |  |  |  |
| public\_id | char(26) | no |  | ulid | order number |
| customer\_id | integer | no |  |  | buyer customer |
| status | varchar(20) | no |  |  | order state, fulfillment status |

### Primary Key

| Constraint Name | Columns |
| --- | --- |
| pk\_orders | id |

### Unique Constraints

| Constraint Name | Columns |
| --- | --- |
| ux\_orders\_public\_id | public\_id |

### Foreign Keys

| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |
| --- | --- | --- | --- | --- | --- |
| fk\_orders\_customer | customer\_id | customers | id | restrict | restrict |

### Check Constraints

| Constraint Name | Column | Values |
| --- | --- | --- |
| ck\_orders\_status | status | created, cancelled |

### Indexes

| Index Name | Indexed Columns | Description |
| --- | --- | --- |
| ix\_orders\_status | status | Used to search orders by status. |

## DDL

```sql
CREATE TABLE customers (
  id INTEGER NOT NULL,
  public_id CHAR(26) NOT NULL,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT pk_customers PRIMARY KEY (id),
  CONSTRAINT ux_customers_public_id UNIQUE (public_id)
);

CREATE TABLE orders (
  id INTEGER NOT NULL,
  public_id CHAR(26) NOT NULL,
  customer_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id),
  CONSTRAINT ux_orders_public_id UNIQUE (public_id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_orders_status CHECK (status IN ('created', 'cancelled'))
);

CREATE INDEX ix_orders_status ON orders (status);
```
````

## Options

- `-o, --output <table spec file>`: output Markdown file path. This option is
  required.
- `-h, --help`: print usage.

## Behavior

- When `-h` or `--help` is provided, the command prints usage to stdout.
- When `<spec file>` is not provided, the command prints usage to stdout.
- When `--output` / `-o` is not provided, the command prints usage to stdout.
- When `<spec file>` is valid, the command parses it as a Specification,
  creates a db projection snapshot, renders a Markdown table specification with
  a SQL-92 DDL block, and writes it to the output file.
- When a store has `tentative: true`, the command writes a warning before that
  table section's column table.
- When the output file already exists, the command overwrites it.
- When reading, validation, projection, rendering, or writing fails, the command
  prints the error message to stderr.

## Db Projection Snapshot

The command projects the Specification into a db projection snapshot before
rendering Markdown. See [Db Projection Specification](db-projection-specification.md) for
the snapshot shape and projection rules.

## Markdown Output

The Markdown table specification includes frontmatter, one section per table,
and a DDL section at the end.

The frontmatter contains:

- `source`: source Specification file name.
- `sha256`: SHA-256 digest of the normalized Specification.
- `generated_at`: generation timestamp.

Each table section includes:

- Table name.
- Store reason.
- Warning message when the store has `tentative: true`.
- Column table with `Column`, `Data Type`, `Nullable`, `Default`, `Format`, and
  `Description` columns.
- Primary key section when present.
- Unique constraints section when present.
- Foreign keys section when present.
- Check constraints section when present.
- Indexes section when present.

The column table does not include check values. Check values are rendered only in
the `Check Constraints` section.

When a store has `tentative: true`, the table section includes this warning
after the store reason and before the column table:

```md
> [!CAUTION]
> This table is tentative and needs human review.
```

The DDL section includes one `sql` fence block after all table sections. The DDL
uses SQL-92 compatible syntax:

- Identifiers are not quoted.
- SQL keywords and data types are uppercase.
- Non-nullable columns include `NOT NULL`.
- Nullable columns omit nullable syntax.
- Default values are rendered as `DEFAULT <value>`.
- Table constraints are rendered inside `CREATE TABLE`.
- Field `enum` values are rendered as named `CHECK` constraints.
- Indexes are rendered after table definitions with `CREATE INDEX`.
